import {
  CORD_THREADS,
  DRIFT_SPAN,
  LOOSE_HUE,
  MAX_COPY,
  PEEL_LEAD,
  PEEL_THREADS,
  ROW,
  TEXELS,
} from './cord'
import { CROWD, MAX_LABELS, SEGMENTS, SHAPE } from './geometry'

/**
 * The thread field's shaders, in WGSL for WebGPU and GLSL ES 3.00 for WebGL2. Both run `position` from geometry.ts per
 * vertex, with its SHAPE: each thread is one instance, a triangle strip of SEGMENTS + 1 pairs of vertices widened
 * across the curve. Pulses of light run along every thread toward the end, every strand breathes, and glints spark
 * along the fibres: now and then on a loose one, and in the braid, wherever a band turns toward the light.
 *
 * Light is linear, in units where a lone fibre in the current gives about 0.1 and a glint a few hundred times that. The
 * threads add their light into a half-float target, and a frame then scatters a share of it as glare, as a lens or the
 * air does: `shrink` averages the light into the first of BLOOM_LEVELS bloom targets (`BLOOM_SCALE` of the CSS size),
 * `down` halves it level by level, and `up` adds each level back into the one above, blurring it with a tent. Each
 * level spreads the light about twice as far as the one above it and carries an equal share, which sums to a glare that
 * falls off as the inverse square of distance: a tight core and a long, faint tail. `tone` adds the glare to the light
 * and maps it to the screen with AgX, which keeps hues saturated and burns only the hottest light toward white.
 *
 * Uniforms are twelve vec4s, packed by `pack` in renderer.ts:
 *   0  width, height (CSS px), device pixel ratio, time (s)
 *   1  start.xy, control.xy
 *   2  end.xy, spread, cord
 *   3  where the plait forms, count, intensity, label count
 *   4–7  labels: at, lane
 *   8–9  colours: violet, amber
 *   10 background rgb, exposure
 *   11 where the plait is whole, where the bundles start to gather, -, -
 */
export const UNIFORM_VEC4S = 12
export const VERTICES_PER_THREAD = (SEGMENTS + 1) * 2
/** The first bloom target's size, as a fraction of the canvas's CSS size: the same glare at every pixel ratio. */
export const BLOOM_SCALE = 0.25
/** Bloom targets, each half the size of the one before: the last spreads light across about half the screen. */
export const BLOOM_LEVELS = 7

/** A number as a shader float literal: `2` becomes `2.0`. */
const float = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

/** Half the strip's width, in CSS pixels: room for the thread's own soft halo; the bloom gives the wider glow. */
const HALF_WIDTH = float(2)

/** The light a glint gives, in either language's vector type: nearly white, just warm. */
const SPARK_WHITE = (vec3: string) => `${vec3}(1.0, 0.94, 0.86)`

/**
 * `tone`, in either language: linear light, scaled by the exposure, to sRGB for the screen by Troy Sobotka's AgX, in
 * Benjamin Wrensch's polynomial fit. AgX compresses in a log space whose primaries lean inward, so bright light keeps its
 * hue as it brightens and only the hottest burns toward white; a little more saturation than its base look keeps the
 * violet and gold rich where they are dim.
 */
const AGX_IN = `0.842479062253094, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772, 0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104`
const AGX_OUT = `1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116`
/** AgX's log range, in stops around mid grey. */
const AGX_RANGE = { low: '-12.47393', high: '4.026069', lift: '12.47393', span: '16.500999' }
const AGX_CURVE = `15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232`

const agxWgsl = /* wgsl */ `
fn tone(hdr: vec3f) -> vec3f {
  let lit = mat3x3f(${AGX_IN}) * max(hdr * U[10].w, vec3f(1e-10));
  let x = (clamp(log2(lit), vec3f(${AGX_RANGE.low}), vec3f(${AGX_RANGE.high})) + ${AGX_RANGE.lift}) / ${AGX_RANGE.span};
  let x2 = x * x;
  let x4 = x2 * x2;
  let curved = ${AGX_CURVE};
  let rich = mix(vec3f(dot(curved, vec3f(0.2126, 0.7152, 0.0722))), curved, SATURATION);
  return clamp(mat3x3f(${AGX_OUT}) * rich, vec3f(0.0), vec3f(1.0));
}`

const agxGlsl = /* glsl */ `
vec3 tone(vec3 hdr) {
  vec3 lit = mat3(${AGX_IN}) * max(hdr * U[10].w, vec3(1e-10));
  vec3 x = (clamp(log2(lit), vec3(${AGX_RANGE.low}), vec3(${AGX_RANGE.high})) + ${AGX_RANGE.lift}) / ${AGX_RANGE.span};
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  vec3 curved = ${AGX_CURVE};
  vec3 rich = mix(vec3(dot(curved, vec3(0.2126, 0.7152, 0.0722))), curved, SATURATION);
  return clamp(mat3(${AGX_OUT}) * rich, vec3(0.0), vec3(1.0));
}`

/** The constants both languages share, each written by `declare` in that language's syntax. */
const constants = (declare: (name: string, value: string) => string) =>
  [
    declare('TAU', '6.283185307'),
    declare('PITCH', float(SHAPE.pitch)),
    declare('SWELL', float(SHAPE.swell)),
    declare('TAPER', float(SHAPE.taper)),
    declare('WAVE', float(SHAPE.wave)),
    declare('FRAY', float(SHAPE.fray)),
    declare('FLAT', float(SHAPE.flat)),
    declare('EDGES', float(SHAPE.edges)),
    declare('EDGE_LANES', float(SHAPE.edgeLanes)),
    declare('EDGE_STEP', float(SHAPE.edgeStep)),
    declare('EDGE_SPREAD', float(SHAPE.edgeSpread)),
    declare('INNER', float(SHAPE.inner)),
    declare('EDGE_LIGHT', float(SHAPE.edgeLight)),
    declare('INNER_LIGHT', float(SHAPE.innerLight)),
    declare('FIBRES', float(SHAPE.fibres)),
    declare('SPILL', float(SHAPE.spill)),
    declare('DRIFT', float(SHAPE.drift)),
    declare('WEAVE', float(SHAPE.weave)),
    declare('RIBBONS', float(SHAPE.ribbons)),
    declare('RIBBON', float(SHAPE.ribbon)),
    declare('RIBBON_SPREAD', float(SHAPE.ribbonSpread)),
    declare('LEAVE', float(SHAPE.leave)),
    declare('JOINED', float(SHAPE.joined)),
    declare('JOINING', float(SHAPE.joining)),
    declare('PLAIT', float(SHAPE.plait)),
    declare('CLEAR', float(SHAPE.clear)),
    declare('SWING', float(SHAPE.swing)),
    declare('SPLAY', float(SHAPE.splay)),
    declare('INWARD', float(SHAPE.inward)),
    declare('STAGGER', float(SHAPE.stagger)),
    declare('SCATTER', float(SHAPE.scatter)),
    declare('WANDER', float(SHAPE.wander)),
    declare('BENDS', float(SHAPE.bends)),
    declare('FRAYING', float(SHAPE.fraying)),
    declare('STRAY', float(SHAPE.stray)),
    declare('BREATH', float(SHAPE.breath)),
    declare('BREATH_WAVES', float(SHAPE.breathWaves)),
    declare('BREATH_LIGHT', float(SHAPE.breathLight)),
    declare('BREATH_WARMTH', float(SHAPE.breathWarmth)),
    declare('TRACE_FIRST', float(SHAPE.traceFirst)),
    declare('TRACE_COUNT', float(SHAPE.traceCount)),
    declare('TRACE_RIBBON', float(SHAPE.traceRibbon)),
    declare('TRACE_LANE', float(SHAPE.traceLane)),
    declare('TRACE_HALF', float(SHAPE.traceHalf)),
    declare('TRACE', float(SHAPE.trace)),
    declare('TRACE_STEP', float(SHAPE.traceStep)),
    declare('TRACED', float(SHAPE.traced)),
    declare('PINNED', float(SHAPE.pinned)),
    declare('LABEL_PHASE', float(SHAPE.labelPhase)),
    declare('HUE', float(SHAPE.hue)),
    declare('SPIN', float(SHAPE.spin)),
    declare('LABELLED', float(SHAPE.labelled)),
    declare('DIM', float(SHAPE.dim)),
    declare('COHERENCE', float(SHAPE.coherence)),
    declare('GRADIENT', float(SHAPE.gradient)),
    declare('BRAID_GRADIENT', float(SHAPE.braidGradient)),
    declare('FLOW', float(SHAPE.flow)),
    declare('WARM', float(SHAPE.warm)),
    declare('TURN', float(SHAPE.turn)),
    declare('SEGMENTS', float(SEGMENTS)),
    declare('CROWD', float(CROWD)),
    // How much light each thread gives in the braid, where hundreds of them overlap.
    declare('BRAID_LIGHT', float(0.17)),
    // Pulses along each thread, how fast they travel (thread lengths per second), and how bright they peak: less in the
    // braid, where hundreds of threads pulse in step and would otherwise burn it flat white.
    declare('PULSES', float(2.5)),
    declare('PULSE_SPEED', float(0.16)),
    declare('PULSE_LIGHT', float(2.2)),
    declare('BRAID_PULSE_LIGHT', float(0.3)),
    // Glints: specular sparkles where a fibre catches the light, at most `GLINTS` along each thread's length, travelling
    // with the flow (thread lengths per second). In the braid they spark on GLINT_SHARE of the fibres where a strand
    // passes over its neighbour, brightest on its band's edge fibres, and burn a few hundred times a lone fibre's light.
    // On loose fibres, LOOSE_GLINTS of the places a glint could be spark, at LOOSE_GLINT: a few glints at a time, each
    // on a fibre of its own, as bright as the braid's, so they bloom too.
    declare('GLINTS', float(8)),
    declare('GLINT_SPEED', float(0.05)),
    declare('GLINT_LIGHT', float(200)),
    declare('GLINT_SHARE', float(0.2)),
    declare('LOOSE_GLINT', float(260)),
    declare('LOOSE_GLINTS', float(0.01)),
    // How dark a fibre is behind the braid, against in front of it, and how much hotter it burns on a crossing's crest.
    declare('BACK', float(0.2)),
    declare('CREST', float(4)),
    declare('COOL', float(SHAPE.cool)),
    // The share of all light that scatters into glare, and the bloom levels it spreads over.
    declare('GLARE', float(0.06)),
    declare('LEVELS', float(BLOOM_LEVELS)),
    // How much more saturated than AgX's base look the tone map leaves colour.
    declare('SATURATION', float(1.5)),
  ].join('\n')

/** What every WGSL thread module and the tone pass share, for a scene of `vec4s` uniforms. */
export const commonWgslFor = (vec4s: number) => /* wgsl */ `
@group(0) @binding(0) var<uniform> U: array<vec4f, ${vec4s}>;
${constants((name, value) => `const ${name} = ${value};`)}
fn hash(n: f32) -> f32 { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
// Whether thread i is one of the lead's fibres. Mirrors isTraced in geometry.ts.
fn traced(i: f32) -> bool { return i >= TRACE_FIRST && i < TRACE_FIRST + TRACE_COUNT; }
// Thread i's ribbon and its place across it, -1 to 1. Mirrors ribbonOf in geometry.ts.
fn ribbonOf(i: f32) -> vec2f {
  if (traced(i)) { return vec2f(TRACE_RIBBON, TRACE - (i - TRACE_FIRST) * TRACE_STEP); }
  return vec2f(floor(hash(i + 1.3) * RIBBONS), (hash(i + 0.5) - 0.5) * 2.0);
}
// Where a ribbon's centre runs across the funnel, -1 to 1, and its half-width. Mirrors ribbonLane in geometry.ts.
fn ribbonLane(ribbon: f32) -> vec2f {
  return vec2f(
    (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15,
    RIBBON * (1.0 + RIBBON_SPREAD * (hash(ribbon + 2.9) - 0.5)) / 2.0,
  );
}
// Where thread i's bundle runs across the funnel, and its half-width: the lead's lane, or its ribbon's. Mirrors laneOf
// in geometry.ts.
fn laneOf(i: f32, ribbon: f32) -> vec2f {
  if (traced(i)) { return vec2f(TRACE_LANE, TRACE_HALF); }
  return ribbonLane(ribbon);
}
fn along(fraction: f32) -> f32 { return 1.0 - pow(1.0 - fraction, CROWD); }
// Eases from 0 at a to 1 at b with no slope and no curvature at either end. Mirrors ease in geometry.ts.
fn ease(a: f32, b: f32, x: f32) -> f32 {
  let t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
// How much ease(a, b, …) has gathered from a up to x: its integral. Mirrors eased in geometry.ts.
fn eased(a: f32, b: f32, x: f32) -> f32 {
  let t = clamp((x - a) / (b - a), 0.0, 1.0);
  return (b - a) * t * t * t * t * (t * (t - 3.0) + 2.5) + max(x - b, 0.0);
}
// How far through its breath a strand is along its path (in gradient units) at time t, -1 to 1. Mirrors breath in
// geometry.ts.
fn breath(strand: f32, at: f32, t: f32) -> f32 { return sin(TAU * (t * BREATH - at * BREATH_WAVES) + strand * TAU / 3.0); }
// How far through its violet-to-amber cycle a thread is, in cycles. Mirrors hueOf in geometry.ts.
fn hueOf(at: f32, wound: f32, pick: f32, t: f32, breathing: f32) -> f32 {
  return at * GRADIENT + wound * (BRAID_GRADIENT - GRADIENT) - t * FLOW + pick + BREATH_WARMTH * breathing;
}
// How warm a thread is at a phase (in gradient cycles): 0 violet, 1 amber. Mirrors warmthAt in geometry.ts.
fn warmth(phase: f32) -> f32 { return smoothstep(-TURN, TURN, sin(TAU * phase) + WARM); }
// The braid strand a ribbon centred at side (-1 to 1 across its current) joins. Mirrors strandOf in geometry.ts.
fn strandOf(side: f32) -> f32 { return clamp(floor((side + 1.0) * 1.5), 0.0, 2.0); }
// Where thread i runs in its band, -1 to 1, from its place across its ribbon; 1 when that is on one of the band's
// edges, else 0; and where its drift starts. Mirrors fibre in geometry.ts.
fn fibre(i: f32, across: f32) -> vec3f {
  let reach = abs(across);
  let edge = reach > 1.0 - EDGES;
  let inside = (across / (1.0 - EDGES) + 1.0) / 2.0;
  let bundle = (min(floor(inside * FIBRES), FIBRES - 1.0) + 0.5) / FIBRES;
  let jitter = select(
    INNER * (bundle * 2.0 - 1.0 + (hash(i + 8.3) - 0.5) * SPILL),
    sign(across) * (1.0 - EDGE_STEP * min(floor((1.0 - reach) / EDGES * EDGE_LANES), EDGE_LANES - 1.0) - hash(i + 9.1) * EDGE_SPREAD),
    edge,
  );
  return vec3f(jitter, select(0.0, 1.0, edge), hash(i + 4.7) * TAU);
}
// How far from the spine a fibre lies, in braid radii, where its strand has turned twist, u along the fibre, with the
// plait grown plait (0 to 1): its strand's place, side by side or swinging across the plait, and its place across its
// band. Mirrors band in geometry.ts.
fn band(twist: f32, strand: f32, f: vec3f, u: f32, plait: f32) -> f32 {
  let centre = (strand - 1.0) * SPLAY;
  let across = FLAT + (1.0 - FLAT) * (0.5 + 0.5 * sin(2.0 * twist));
  return mix(centre, SWING * sin(twist), plait) + (f.x + (1.0 - f.y) * DRIFT * sin(u * WEAVE + f.z)) * FRAY * mix(1.0, across, plait);
}
// How near the viewer a strand is where it has turned twist, -1 to 1: a plait's strand passes over one neighbour and
// under the other as it swings across, so its depth turns twice as fast as its swing.
fn depthOf(twist: f32) -> f32 { return sin(2.0 * twist); }
// The light a fibre gives in the braid, for one of brightness own in the funnel, at depth: more on a band's edges than
// inside it, much more where its strand passes over than under, and hottest on the crest of each crossing, where it
// burns toward white and blooms, so the crossings read.
fn braidLight(depth: f32, f: vec3f, own: f32) -> f32 {
  let front = 0.5 + 0.5 * depth;
  let crest = max(depth, 0.0) * max(depth, 0.0);
  return mix(INNER_LIGHT * pow(own, 1.0 / 3.0), EDGE_LIGHT, f.y) * (BACK + (1.0 - BACK) * front * front) * (1.0 + CREST * crest * crest) * BRAID_LIGHT;
}
// How brightly a fibre glints at depth: where its strand passes over its neighbour. Only some fibres glint: those whose
// drift starts in the first GLINT_SHARE of its cycle, a random share.
fn glintLight(depth: f32, f: vec3f) -> f32 {
  let facing = max(depth, 0.0);
  let f2 = facing * facing;
  return GLINT_LIGHT * f2 * mix(0.05, 1.0, f.y) * step(f.z, TAU * GLINT_SHARE);
}
// What a glint multiplies a fibre of this shade by, so it shines as bright as a band's edge whatever the fibre's own
// light: a spark of its own, not a share of the fibre's.
fn spark(shade: f32) -> f32 { return EDGE_LIGHT * BRAID_LIGHT / max(shade, 0.05); }
// How warm a strand braided (0 to 1) into the braid is at depth, from its warmth w: a gold strand falling behind its
// neighbours leans violet, as the concept's do, rather than darkening to brown. Shading only: the 2D renderers leave it
// out (see warmth in geometry.ts).
fn cool(w: f32, depth: f32, braided: f32) -> f32 { return w * mix(1.0, COOL + (1.0 - COOL) * (0.5 + 0.5 * depth), braided); }
// A page colour (sRGB) as linear light.
fn linear(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }
${agxWgsl}
`

const commonWgsl = commonWgslFor(UNIFORM_VEC4S)

/** The thread pass's fragment shader, for every WGSL thread module: its `Out` carries colour, across, pulse, glint. */
const fragmentWgsl = /* wgsl */ `
struct Out {
  @builtin(position) clip: vec4f,
  @location(0) colour: vec3f,
  @location(1) across: f32,
  // x: where the thread is in its pulses. y: how bright their crests are here.
  @location(2) pulse: vec2f,
  // x: where the thread is in its glints. y: how bright its loose glints are here, of which LOOSE_GLINTS spark, picked
  // by w, the thread's own seed. z: how bright its braid's glints are here.
  @location(3) glint: vec4f,
};

// A thread's light where it is a phase of the way through its pulses: dim between them, as bright as light at their
// narrow crests.
fn pulse(phase: f32, light: f32) -> f32 {
  let crest = 0.5 + 0.5 * cos(TAU * phase);
  let crest4 = crest * crest * crest * crest;
  return 0.55 + light * crest4 * crest4 * crest4;
}

// A glint's light where a fibre is phase of the way through its glints (g: x its phase, y its loose light, z its braid
// light, w its seed): short, sharp sparks, each centred on a whole phase. A loose fibre sparks at only LOOSE_GLINTS of
// them, picked by its seed.
fn glint(g: vec4f) -> f32 {
  var c = 0.5 + 0.5 * cos(TAU * g.x);
  c = c * c; c = c * c; c = c * c; c = c * c; c = c * c; c = c * c;
  return c * (g.y * step(hash(round(g.x) * 0.731 + g.w), LOOSE_GLINTS) + g.z);
}

@fragment
fn fs(v: Out) -> @location(0) vec4f {
  let d = abs(v.across) * ${HALF_WIDTH};
  let core = exp(-(d * d) / 0.3);
  let halo = 0.1 * exp(-(d * d) / 1.6);
  // A glint adds warm-white light of its own, as bright as the fibre's strongest channel, so it burns white over a band
  // whose own colour is already saturated, rather than adding more of that colour.
  let spark = ${SPARK_WHITE('vec3f')} * max(v.colour.r, max(v.colour.g, v.colour.b)) * glint(v.glint);
  return vec4f((v.colour * pulse(v.pulse.x, v.pulse.y) + spark) * (core + halo), 1.0);
}`

export const threadWgsl = /* wgsl */ `${commonWgsl}
${fragmentWgsl}

// What makes one thread itself: its lane, its label's place (or -1), where it starts to gather into its strand and
// where it is wholly in it, its strand, its sway's phase, its fibre (as fibre returns it), its ribbon, its wander (how
// many bends, where they start, how far), and how much brighter it burns: the lead's fibres do. Mirrors thread in
// geometry.ts.
struct Thread { lane: f32, pin: f32, leaves: f32, joins: f32, strand: f32, phase: f32, fibre: vec3f, ribbon: f32, wander: vec3f, lead: f32 };

fn threadOf(i: f32) -> Thread {
  // Where the bundles start to gather, where the plait forms, and where it is whole.
  let gathers = U[11].y; let forms = U[3].x; let whole = U[11].x;
  let r = ribbonOf(i);
  let ribbon = r.x;
  let lanes = laneOf(i, ribbon);
  var across = r.y;
  let lead = traced(i);
  let stray = !lead && hash(i + 12.7) < STRAY;
  var lane = select(lanes.x + across * lanes.y, hash(i + 13.1) * 2.0 - 1.0, stray);
  var side = select(lanes.x, lane, stray);
  var pin = -1.0;
  if (i < U[3].w) { let label = U[4u + u32(i)]; pin = label.x; lane = label.y; side = label.y; across = sign(label.y); }
  let order = min(1.0, INWARD * abs(side) + (1.0 - INWARD) * hash(ribbon + 7.1) + STAGGER * hash(i + 7.1));
  var leaves = gathers + (forms - gathers) * LEAVE * order;
  if (pin >= 0.0) { leaves = max(leaves, pin + CLEAR); }
  let joins = max(forms + (whole - forms) * (JOINED + JOINING * order), leaves + (whole - forms) * JOINED);
  var phase = hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SCATTER;
  if (pin >= 0.0) { phase = i * LABEL_PHASE; }
  let reach = select(WANDER * select(pow(hash(i + 5.9), FRAYING), 1.0, stray), 0.0, pin >= 0.0 || lead);
  let wander = vec3f(3.0 + (BENDS - 3.0) * hash(i + 5.5), hash(i + 6.7) * TAU, reach);
  return Thread(lane, pin, leaves, joins, strandOf(side), phase, fibre(i, across), ribbon, wander, select(1.0, TRACED, lead));
}

// Where a thread is u along it: in CSS px, how far it has gathered into its strand (0 to 1), how far the plait has
// grown, and its strand's depth in the plait.
struct Placed { at: vec2f, braided: f32, plait: f32, depth: f32 };

fn place(th: Thread, u: f32) -> Placed {
  let p0 = U[1].xy; let p1 = U[1].zw; let p2 = U[2].xy;
  let spread = U[2].z; let cord = U[2].w; let t = U[0].w;
  let a = 1.0 - u;
  let p = a * a * p0 + 2.0 * a * u * p1 + u * u * p2;
  let tangent = 2.0 * a * (p1 - p0) + 2.0 * u * (p2 - p1);
  let n = vec2f(-tangent.y, tangent.x) / max(length(tangent), 1.0);

  let radius = cord * (1.0 + SWELL * a);
  // The strands' swing grows over the first PLAIT of the stretch from where the plait forms to where it is whole.
  let plait = ease(U[3].x, mix(U[3].x, U[11].x, PLAIT), u);
  let width = radius * (1.0 + (SWING + FRAY - 1.0) * plait) + spread * pow(max(1.0 - u / U[11].x, 0.0), TAPER);
  var held = 1.0;
  if (th.pin >= 0.0) { let d = (u - th.pin) / 0.09; held = 1.0 - (1.0 - PINNED) * exp(-d * d); }
  let sway = sin(u * 4.5 + t * 0.35 + th.phase) * 0.6 + sin(u * 9.0 - t * 0.23 + th.phase * 1.7) * 0.4;
  let bend = th.wander.z * sin(u * th.wander.x + t * 0.12 + th.wander.y);
  let current = width * (th.lane + WAVE * held * sway + bend);

  let spine = (2.0 * distance(p0, p2) + distance(p0, p1) + distance(p1, p2)) / 3.0;
  let turns = spine / (PITCH * cord * SWELL);
  let twist = turns * TAU * log((1.0 + SWELL) / (1.0 + SWELL * a)) - t * SPIN + th.strand * TAU / 3.0;
  let inBand = radius * band(twist, th.strand, th.fibre, u, plait);
  let braided = ease(th.leaves, th.joins, u);
  return Placed(p + n * mix(current, inBand, braided), braided, plait, depthOf(twist));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let i = f32(ii);
  let s = f32(vi / 2u);
  let u = along(s / SEGMENTS);
  let side = select(-1.0, 1.0, (vi & 1u) == 1u);
  let th = threadOf(i);
  let here = place(th, u);
  // The direction toward the next point, or from the one before at the end.
  let last = s >= SEGMENTS;
  let other = place(th, along(select(s + 1.0, s - 1.0, last) / SEGMENTS)).at;
  let dir = select(other - here.at, here.at - other, last);
  let tangent = dir / max(length(dir), 1e-4);
  let pos = here.at + vec2f(-tangent.y, tangent.x) * side * ${HALF_WIDTH};

  // How far into the plait itself the thread is: gathered into its strand, where the strands have wound.
  let knit = here.braided * here.plait;
  // Each thread runs violet to amber and back along its length, the gradient flowing toward the window, faster in the
  // plait. In the current most threads share their ribbon's phase; as they gather, each takes its strand's, a third of
  // a cycle from its neighbours'. Each strand breathes, a slow swell of light and warmth travelling along it.
  var pick = hash(i + 4.4);
  if (th.lead > 1.0 || hash(i + 9.7) < COHERENCE) { pick = fract(th.ribbon * 0.618034 + HUE); }
  let t = U[0].w;
  let breathing = breath(th.strand, u, t);
  let hue = hueOf(u, eased(U[3].x, mix(U[3].x, U[11].x, PLAIT), u), mix(pick, th.strand / 3.0, here.braided), t, breathing);
  let colour = linear(mix(U[8].rgb, U[9].rgb, cool(warmth(hue), here.depth, knit)));
  var own = DIM + (1.0 - DIM) * pow(hash(i + 2.2), 3.0);
  if (i < U[3].w) { own = LABELLED; }
  // Bands in front of the braid catch the light; those behind fall into shadow. Many threads share the braid, so
  // each gives less light there, its band's edges more than its inside.
  let shade = mix(own, braidLight(here.depth, th.fibre, own), knit) * th.lead * (1.0 + BREATH_LIGHT * breathing) * smoothstep(0.0, 0.06, u);

  var out: Out;
  let res = U[0].xy;
  out.clip = vec4f(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  out.colour = colour * shade * U[3].z;
  out.across = side;
  out.pulse = vec2f(
    u * PULSES - t * PULSE_SPEED * PULSES + hash(i + 6.6) * (1.0 - here.braided),
    mix(PULSE_LIGHT, BRAID_PULSE_LIGHT, knit),
  );
  out.glint = vec4f(
    u * GLINTS - t * GLINT_SPEED * GLINTS + hash(i + 7.7),
    (1.0 - knit) * LOOSE_GLINT * spark(shade),
    knit * glintLight(here.depth, th.fibre) * spark(shade),
    hash(i + 8.8) * 97.0,
  );
  return out;
}

`

/**
 * One triangle over the whole target. `uv` is the texture coordinate under each pixel: WebGPU's textures start at the
 * top, like its targets, so it flips y; WebGL's start at the bottom, like its framebuffers.
 */
const fullscreenWgsl = /* wgsl */ `
struct Screen {
  @builtin(position) at: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> Screen {
  let xy = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return Screen(vec4f(xy * 2.0 - 1.0, 0.0, 1.0), vec2f(xy.x, 1.0 - xy.y));
}
`

/**
 * The most source pixels `shrink` reads across each axis: a quarter-size bloom target covers 8 at the field's highest
 * pixel ratio, 2, and one more when the ratio is fractional.
 */
const MAX_FOOTPRINT = 9

/**
 * `shrink` draws the light into the first bloom target, each pixel averaging the source pixels whose centres fall
 * inside its footprint, sampled at those centres. Neighbouring footprints tile the source, so at any pixel ratio,
 * fractional ones included, every source pixel counts exactly once; skipping any would let a thin thread's bloom
 * flicker as it crosses the grid.
 *
 * `down` halves a level with Jorge Jimenez's 13-tap filter (Call of Duty: Advanced Warfare): four overlapping 2×2
 * boxes, weighted toward the centre, which keeps the halving free of aliasing. `up` reads the level below through a
 * 3×3 tent and adds it to the one above (the pipeline blends it in), so each level carries everything below it, blurred
 * once more. Both keep the light's total: their weights sum to 1.
 */
export const bloomWgsl = /* wgsl */ `${fullscreenWgsl}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var filtering: sampler;

@fragment
fn shrink(v: Screen) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(source));
  // This pixel's footprint runs from pixel * size / cells to (pixel + 1) * size / cells in source pixels, where cells
  // is the bloom target's size. Neighbours compute their shared edge with the same expression, so it rounds the same
  // way for both.
  let cells = round(1.0 / vec2f(abs(dpdx(v.uv.x)), abs(dpdy(v.uv.y))));
  let pixel = floor(v.at.xy);
  let first = ceil(pixel * size / cells - 0.5);
  let count = min(ceil((pixel + 1.0) * size / cells - 0.5) - first, vec2f(${MAX_FOOTPRINT}.0));
  var sum = vec3f(0.0);
  for (var y = 0.0; y < count.y; y += 1.0) {
    for (var x = 0.0; x < count.x; x += 1.0) {
      sum += textureSampleLevel(source, filtering, (first + vec2f(x, y) + 0.5) / size, 0.0).rgb;
    }
  }
  return vec4f(sum / max(count.x * count.y, 1.0), 1.0);
}

fn tap(uv: vec2f, texel: vec2f, x: f32, y: f32) -> vec3f {
  return textureSampleLevel(source, filtering, uv + texel * vec2f(x, y), 0.0).rgb;
}

@fragment
fn down(v: Screen) -> @location(0) vec4f {
  let t = 1.0 / vec2f(textureDimensions(source));
  let centre = tap(v.uv, t, 0.0, 0.0);
  let inner = tap(v.uv, t, -1.0, -1.0) + tap(v.uv, t, 1.0, -1.0) + tap(v.uv, t, -1.0, 1.0) + tap(v.uv, t, 1.0, 1.0);
  let edges = tap(v.uv, t, 0.0, -2.0) + tap(v.uv, t, -2.0, 0.0) + tap(v.uv, t, 2.0, 0.0) + tap(v.uv, t, 0.0, 2.0);
  let corners = tap(v.uv, t, -2.0, -2.0) + tap(v.uv, t, 2.0, -2.0) + tap(v.uv, t, -2.0, 2.0) + tap(v.uv, t, 2.0, 2.0);
  return vec4f(centre * 0.125 + inner * 0.125 + edges * 0.0625 + corners * 0.03125, 1.0);
}

@fragment
fn up(v: Screen) -> @location(0) vec4f {
  let t = 1.0 / vec2f(textureDimensions(source));
  let centre = tap(v.uv, t, 0.0, 0.0);
  let edges = tap(v.uv, t, 0.0, -1.0) + tap(v.uv, t, -1.0, 0.0) + tap(v.uv, t, 1.0, 0.0) + tap(v.uv, t, 0.0, 1.0);
  let corners = tap(v.uv, t, -1.0, -1.0) + tap(v.uv, t, 1.0, -1.0) + tap(v.uv, t, -1.0, 1.0) + tap(v.uv, t, 1.0, 1.0);
  return vec4f((centre * 4.0 + edges * 2.0 + corners) / 16.0, 1.0);
}
`

export const toneWgsl = /* wgsl */ `${commonWgsl}
${fullscreenWgsl}
@group(0) @binding(1) var light: texture_2d<f32>;
@group(0) @binding(2) var bloom: texture_2d<f32>;
@group(0) @binding(3) var filtering: sampler;

fn dither(at: vec2f) -> f32 { return (hash(at.x * 0.137 + at.y * 1.173) - 0.5) / 255.0; }

// The light that reaches the eye at this pixel: what isn't scattered, and the glare. The first bloom level holds every
// level's light, each kept whole, so it carries LEVELS times the light.
fn seen(v: Screen) -> vec3f {
  return textureLoad(light, vec2i(v.at.xy), 0).rgb * (1.0 - GLARE)
    + textureSample(bloom, filtering, v.uv).rgb * (GLARE / LEVELS);
}

@fragment
fn fs(v: Screen) -> @location(0) vec4f {
  return vec4f(U[10].rgb + tone(seen(v)) + dither(v.at.xy), 1.0);
}

// Over the page: the light alone, premultiplied, as opaque as its brightest channel, so it lays over the page's ink
// much as it would add to it.
@fragment
fn over(v: Screen) -> @location(0) vec4f {
  let mapped = max(tone(seen(v)) + dither(v.at.xy), vec3f(0.0));
  return vec4f(mapped, min(max(mapped.r, max(mapped.g, mapped.b)), 1.0));
}
`

/** What every GLSL thread vertex shader and the tone pass share, for a scene of `vec4s` uniforms. */
export const commonGlslFor = (vec4s: number) => /* glsl */ `#version 300 es
precision highp float;
uniform vec4 U[${vec4s}];
${constants((name, value) => `const float ${name} = ${value};`)}
float hash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
bool traced(float i) { return i >= TRACE_FIRST && i < TRACE_FIRST + TRACE_COUNT; }
vec2 ribbonOf(float i) {
  if (traced(i)) return vec2(TRACE_RIBBON, TRACE - (i - TRACE_FIRST) * TRACE_STEP);
  return vec2(floor(hash(i + 1.3) * RIBBONS), (hash(i + 0.5) - 0.5) * 2.0);
}
vec2 ribbonLane(float ribbon) {
  return vec2(
    (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15,
    RIBBON * (1.0 + RIBBON_SPREAD * (hash(ribbon + 2.9) - 0.5)) / 2.0
  );
}
vec2 laneOf(float i, float ribbon) { return traced(i) ? vec2(TRACE_LANE, TRACE_HALF) : ribbonLane(ribbon); }
float along(float fraction) { return 1.0 - pow(1.0 - fraction, CROWD); }
float ease(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
float eased(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return (b - a) * t * t * t * t * (t * (t - 3.0) + 2.5) + max(x - b, 0.0);
}
float breath(float strand, float at, float t) { return sin(TAU * (t * BREATH - at * BREATH_WAVES) + strand * TAU / 3.0); }
float hueOf(float at, float wound, float pick, float t, float breathing) {
  return at * GRADIENT + wound * (BRAID_GRADIENT - GRADIENT) - t * FLOW + pick + BREATH_WARMTH * breathing;
}
float warmth(float phase) { return smoothstep(-TURN, TURN, sin(TAU * phase) + WARM); }
float strandOf(float side) { return clamp(floor((side + 1.0) * 1.5), 0.0, 2.0); }
vec3 fibre(float i, float across) {
  float reach = abs(across);
  bool edge = reach > 1.0 - EDGES;
  float inside = (across / (1.0 - EDGES) + 1.0) / 2.0;
  float bundle = (min(floor(inside * FIBRES), FIBRES - 1.0) + 0.5) / FIBRES;
  float jitter = edge
    ? sign(across) * (1.0 - EDGE_STEP * min(floor((1.0 - reach) / EDGES * EDGE_LANES), EDGE_LANES - 1.0) - hash(i + 9.1) * EDGE_SPREAD)
    : INNER * (bundle * 2.0 - 1.0 + (hash(i + 8.3) - 0.5) * SPILL);
  return vec3(jitter, edge ? 1.0 : 0.0, hash(i + 4.7) * TAU);
}
float band(float twist, float strand, vec3 f, float u, float plait) {
  float centre = (strand - 1.0) * SPLAY;
  float across = FLAT + (1.0 - FLAT) * (0.5 + 0.5 * sin(2.0 * twist));
  return mix(centre, SWING * sin(twist), plait) + (f.x + (1.0 - f.y) * DRIFT * sin(u * WEAVE + f.z)) * FRAY * mix(1.0, across, plait);
}
float depthOf(float twist) { return sin(2.0 * twist); }
float braidLight(float depth, vec3 f, float own) {
  float front = 0.5 + 0.5 * depth;
  float crest = max(depth, 0.0) * max(depth, 0.0);
  return mix(INNER_LIGHT * pow(own, 1.0 / 3.0), EDGE_LIGHT, f.y) * (BACK + (1.0 - BACK) * front * front) * (1.0 + CREST * crest * crest) * BRAID_LIGHT;
}
float glintLight(float depth, vec3 f) {
  float facing = max(depth, 0.0);
  float f2 = facing * facing;
  return GLINT_LIGHT * f2 * mix(0.05, 1.0, f.y) * step(f.z, TAU * GLINT_SHARE);
}
float spark(float shade) { return EDGE_LIGHT * BRAID_LIGHT / max(shade, 0.05); }
float cool(float w, float depth, float braided) { return w * mix(1.0, COOL + (1.0 - COOL) * (0.5 + 0.5 * depth), braided); }
vec3 linear(vec3 c) { return pow(c, vec3(2.2)); }
${agxGlsl}
`

const commonGlsl = commonGlslFor(UNIFORM_VEC4S)

export const threadVertexGlsl = /* glsl */ `${commonGlsl}
out vec3 vColour;
out float vAcross;
out vec2 vPulse;
out vec4 vGlint;

struct Thread { float lane; float pin; float leaves; float joins; float strand; float phase; vec3 fibre; float ribbon; vec3 wander; float lead; };

Thread threadOf(float i) {
  float gathers = U[11].y; float forms = U[3].x; float whole = U[11].x;
  vec2 r = ribbonOf(i);
  float ribbon = r.x;
  vec2 lanes = laneOf(i, ribbon);
  float across = r.y;
  bool lead = traced(i);
  bool stray = !lead && hash(i + 12.7) < STRAY;
  float lane = stray ? hash(i + 13.1) * 2.0 - 1.0 : lanes.x + across * lanes.y;
  float side = stray ? lane : lanes.x;
  float pin = -1.0;
  for (int k = 0; k < ${MAX_LABELS}; k++) {
    if (float(k) < U[3].w && float(k) == i) {
      pin = U[4 + k].x; lane = U[4 + k].y; side = U[4 + k].y; across = sign(U[4 + k].y);
    }
  }
  float order = min(1.0, INWARD * abs(side) + (1.0 - INWARD) * hash(ribbon + 7.1) + STAGGER * hash(i + 7.1));
  float leaves = gathers + (forms - gathers) * LEAVE * order;
  if (pin >= 0.0) leaves = max(leaves, pin + CLEAR);
  float joins = max(forms + (whole - forms) * (JOINED + JOINING * order), leaves + (whole - forms) * JOINED);
  float phase = pin >= 0.0 ? i * LABEL_PHASE : hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SCATTER;
  float reach = pin >= 0.0 || lead ? 0.0 : WANDER * (stray ? 1.0 : pow(hash(i + 5.9), FRAYING));
  vec3 wander = vec3(3.0 + (BENDS - 3.0) * hash(i + 5.5), hash(i + 6.7) * TAU, reach);
  return Thread(lane, pin, leaves, joins, strandOf(side), phase, fibre(i, across), ribbon, wander, lead ? TRACED : 1.0);
}

struct Placed { vec2 at; float braided; float plait; float depth; };

Placed place(Thread th, float u) {
  vec2 p0 = U[1].xy; vec2 p1 = U[1].zw; vec2 p2 = U[2].xy;
  float spread = U[2].z; float cord = U[2].w; float t = U[0].w;
  float a = 1.0 - u;
  vec2 p = a * a * p0 + 2.0 * a * u * p1 + u * u * p2;
  vec2 tangent = 2.0 * a * (p1 - p0) + 2.0 * u * (p2 - p1);
  vec2 n = vec2(-tangent.y, tangent.x) / max(length(tangent), 1.0);

  float radius = cord * (1.0 + SWELL * a);
  float plait = ease(U[3].x, mix(U[3].x, U[11].x, PLAIT), u);
  float width = radius * (1.0 + (SWING + FRAY - 1.0) * plait) + spread * pow(max(1.0 - u / U[11].x, 0.0), TAPER);
  float held = 1.0;
  if (th.pin >= 0.0) { float d = (u - th.pin) / 0.09; held = 1.0 - (1.0 - PINNED) * exp(-d * d); }
  float sway = sin(u * 4.5 + t * 0.35 + th.phase) * 0.6 + sin(u * 9.0 - t * 0.23 + th.phase * 1.7) * 0.4;
  float bend = th.wander.z * sin(u * th.wander.x + t * 0.12 + th.wander.y);
  float current = width * (th.lane + WAVE * held * sway + bend);

  float spine = (2.0 * distance(p0, p2) + distance(p0, p1) + distance(p1, p2)) / 3.0;
  float turns = spine / (PITCH * cord * SWELL);
  float twist = turns * TAU * log((1.0 + SWELL) / (1.0 + SWELL * a)) - t * SPIN + th.strand * TAU / 3.0;
  float inBand = radius * band(twist, th.strand, th.fibre, u, plait);
  float braided = ease(th.leaves, th.joins, u);
  return Placed(p + n * mix(current, inBand, braided), braided, plait, depthOf(twist));
}

void main() {
  float i = float(gl_InstanceID);
  float s = float(gl_VertexID / 2);
  float u = along(s / SEGMENTS);
  float side = (gl_VertexID % 2) == 1 ? 1.0 : -1.0;
  Thread th = threadOf(i);
  Placed here = place(th, u);
  // The direction toward the next point, or from the one before at the end.
  bool last = s >= SEGMENTS;
  vec2 other = place(th, along((last ? s - 1.0 : s + 1.0) / SEGMENTS)).at;
  vec2 dir = last ? here.at - other : other - here.at;
  vec2 tangent = dir / max(length(dir), 1e-4);
  vec2 pos = here.at + vec2(-tangent.y, tangent.x) * side * ${HALF_WIDTH};

  float knit = here.braided * here.plait;
  float pick = th.lead > 1.0 || hash(i + 9.7) < COHERENCE ? fract(th.ribbon * 0.618034 + HUE) : hash(i + 4.4);
  float t = U[0].w;
  float breathing = breath(th.strand, u, t);
  float hue = hueOf(u, eased(U[3].x, mix(U[3].x, U[11].x, PLAIT), u), mix(pick, th.strand / 3.0, here.braided), t, breathing);
  vec3 colour = linear(mix(U[8].rgb, U[9].rgb, cool(warmth(hue), here.depth, knit)));
  float own = i < U[3].w ? LABELLED : DIM + (1.0 - DIM) * pow(hash(i + 2.2), 3.0);
  float shade = mix(own, braidLight(here.depth, th.fibre, own), knit) * th.lead * (1.0 + BREATH_LIGHT * breathing) * smoothstep(0.0, 0.06, u);

  vec2 res = U[0].xy;
  gl_Position = vec4(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  vColour = colour * shade * U[3].z;
  vAcross = side;
  vPulse = vec2(
    u * PULSES - t * PULSE_SPEED * PULSES + hash(i + 6.6) * (1.0 - here.braided),
    mix(PULSE_LIGHT, BRAID_PULSE_LIGHT, knit)
  );
  vGlint = vec4(
    u * GLINTS - t * GLINT_SPEED * GLINTS + hash(i + 7.7),
    (1.0 - knit) * LOOSE_GLINT * spark(shade),
    knit * glintLight(here.depth, th.fibre) * spark(shade),
    hash(i + 8.8) * 97.0
  );
}
`

export const threadFragmentGlsl = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColour;
in float vAcross;
in vec2 vPulse;
in vec4 vGlint;
out vec4 colour;
${constants((name, value) => `const float ${name} = ${value};`)}
float hash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
float pulse(float phase, float light) {
  float crest = 0.5 + 0.5 * cos(TAU * phase);
  float crest4 = crest * crest * crest * crest;
  return 0.55 + light * crest4 * crest4 * crest4;
}
float glint(vec4 g) {
  float c = 0.5 + 0.5 * cos(TAU * g.x);
  c = c * c; c = c * c; c = c * c; c = c * c; c = c * c; c = c * c;
  return c * (g.y * step(hash(round(g.x) * 0.731 + g.w), LOOSE_GLINTS) + g.z);
}
void main() {
  float d = abs(vAcross) * ${HALF_WIDTH};
  vec3 spark = ${SPARK_WHITE('vec3')} * max(vColour.r, max(vColour.g, vColour.b)) * glint(vGlint);
  colour = vec4((vColour * pulse(vPulse.x, vPulse.y) + spark) * (exp(-(d * d) / 0.3) + 0.1 * exp(-(d * d) / 1.6)), 1.0);
}
`

export const screenVertexGlsl = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 xy = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = xy;
  gl_Position = vec4(xy * 2.0 - 1.0, 0.0, 1.0);
}
`

export const shrinkFragmentGlsl = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D source;
in vec2 vUv;
out vec4 colour;
void main() {
  vec2 size = vec2(textureSize(source, 0));
  // This pixel's footprint runs from pixel * size / cells to (pixel + 1) * size / cells in source pixels, where cells
  // is the bloom target's size. Neighbours compute their shared edge with the same expression, so it rounds the same
  // way for both.
  vec2 cells = round(1.0 / vec2(abs(dFdx(vUv.x)), abs(dFdy(vUv.y))));
  vec2 pixel = floor(gl_FragCoord.xy);
  vec2 first = ceil(pixel * size / cells - 0.5);
  vec2 count = min(ceil((pixel + 1.0) * size / cells - 0.5) - first, vec2(${MAX_FOOTPRINT}.0));
  vec3 sum = vec3(0.0);
  for (int y = 0; y < ${MAX_FOOTPRINT}; y++) {
    if (float(y) >= count.y) break;
    for (int x = 0; x < ${MAX_FOOTPRINT}; x++) {
      if (float(x) >= count.x) break;
      sum += textureLod(source, (first + vec2(x, y) + 0.5) / size, 0.0).rgb;
    }
  }
  colour = vec4(sum / max(count.x * count.y, 1.0), 1.0);
}
`

/** A bloom pass reading `source` at `tap(x, y)`, in its texels from this pixel's centre: as `down` and `up` in bloomWgsl. */
const bloomPassGlsl = (body: string) => /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D source;
in vec2 vUv;
out vec4 colour;
vec3 tap(float x, float y) { return textureLod(source, vUv + vec2(x, y) / vec2(textureSize(source, 0)), 0.0).rgb; }
void main() {
${body}
}
`

export const downFragmentGlsl = bloomPassGlsl(`
  vec3 centre = tap(0.0, 0.0);
  vec3 inner = tap(-1.0, -1.0) + tap(1.0, -1.0) + tap(-1.0, 1.0) + tap(1.0, 1.0);
  vec3 edges = tap(0.0, -2.0) + tap(-2.0, 0.0) + tap(2.0, 0.0) + tap(0.0, 2.0);
  vec3 corners = tap(-2.0, -2.0) + tap(2.0, -2.0) + tap(-2.0, 2.0) + tap(2.0, 2.0);
  colour = vec4(centre * 0.125 + inner * 0.125 + edges * 0.0625 + corners * 0.03125, 1.0);`)

export const upFragmentGlsl = bloomPassGlsl(`
  vec3 centre = tap(0.0, 0.0);
  vec3 edges = tap(0.0, -1.0) + tap(-1.0, 0.0) + tap(1.0, 0.0) + tap(0.0, 1.0);
  vec3 corners = tap(-1.0, -1.0) + tap(1.0, -1.0) + tap(-1.0, 1.0) + tap(1.0, 1.0);
  colour = vec4((centre * 4.0 + edges * 2.0 + corners) / 16.0, 1.0);`)

/** The tone pass, as `fs` in toneWgsl, or for a canvas `over` the page, as `over`. */
const toneGlsl = (over: boolean) => /* glsl */ `${commonGlsl}
uniform sampler2D light;
uniform sampler2D bloom;
in vec2 vUv;
out vec4 colour;

void main() {
  vec3 seen = texelFetch(light, ivec2(gl_FragCoord.xy), 0).rgb * (1.0 - GLARE) + texture(bloom, vUv).rgb * (GLARE / LEVELS);
  float dither = (hash(gl_FragCoord.x * 0.137 + gl_FragCoord.y * 1.173) - 0.5) / 255.0;
  ${
    over
      ? `vec3 mapped = max(tone(seen) + dither, vec3(0.0));
  colour = vec4(mapped, min(max(mapped.r, max(mapped.g, mapped.b)), 1.0));`
      : 'colour = vec4(U[10].rgb + tone(seen) + dither, 1.0);'
  }
}
`

export const toneFragmentGlsl = toneGlsl(false)
export const toneOverFragmentGlsl = toneGlsl(true)

/**
 * The cord's uniforms, packed by `paint` in cordRenderer.ts. The tone pass reads 10 as it does the hero's:
 *   0  width, height (CSS px), device pixel ratio, time (s)
 *   1  the canvas's top-left on the page (px), the tip's height on the page, intensity
 *   2  the seam: strand 0's twist and hue where the cord leaves the window, how many prose boxes, the seam's drift
 *   3  braid radius, cord threads, -, the cord's first sample on screen
 *   4  how many of its samples are on screen, peels, -, -
 *   5–7  peels: first sample and count, two to a vec4
 *   8–9  colours: violet, amber
 *   10 background rgb, exposure
 *   11–18  prose boxes on the page: left, top, right, bottom
 */
export const CORD_VEC4S = 19

/** The cord's own constants, in either language's syntax. */
const cordConstants = (declare: (name: string, value: string) => string) =>
  [
    declare('CORD_THREADS', float(CORD_THREADS)),
    declare('PEEL_THREADS', float(PEEL_THREADS)),
    declare('ROW', float(ROW)),
    declare('TEXELS', float(TEXELS)),
    declare('DRIFT_SPAN', float(DRIFT_SPAN)),
    // How far above its tip the cord fades into the page, in px: 14rem.
    declare('FADE', float(224)),
    // How bright loose strands are, behind a section, and how much of that shows behind its prose.
    declare('LOOSE_LIGHT', float(0.55)),
    // How soon a strand's pulses fall out of step with the braid's, and the braid's shading and glints fade, as it comes
    // loose: early, so none of them line up in rows across the parting strands.
    declare('PULSE_SPREAD', float(8)),
    declare('COPY_LIGHT', float(0.2)),
    declare('LOOSE_HUE', float(LOOSE_HUE)),
    // How many of a peeling strand's fibres, along its outer edge, carry the lead on when it peels from the cord.
    declare('PEEL_LEAD', float(PEEL_LEAD)),
  ].join('\n')

export const cordWgsl = /* wgsl */ `${commonWgslFor(CORD_VEC4S)}
${cordConstants((name, value) => `const ${name} = ${value};`)}
${fragmentWgsl}
@group(0) @binding(1) var paths: texture_2d<f32>;

// What makes one cord thread itself: its path (0 the cord, then the peels), its lane, its strand, its sway's phase, its
// ribbon, its fibre, and whether it is one of the lead's fibres, where its path carries the lead. Mirrors cordThread in
// cord.ts.
struct Thread { path: f32, lane: f32, strand: f32, phase: f32, ribbon: f32, fibre: vec3f, lead: f32 };

fn threadOf(i: f32) -> Thread {
  if (i >= CORD_THREADS) {
    let peel = floor((i - CORD_THREADS) / PEEL_THREADS);
    let j = i - CORD_THREADS - peel * PEEL_THREADS;
    let across = (j + 0.5) / PEEL_THREADS * 2.0 - 1.0;
    return Thread(1.0 + peel, across, peel - 3.0 * floor(peel / 3.0), 0.0, peel, fibre(i, across), step(PEEL_THREADS - PEEL_LEAD, j));
  }
  let r = ribbonOf(i);
  let lanes = laneOf(i, r.x);
  return Thread(
    0.0, lanes.x + r.y * lanes.y, strandOf(lanes.x),
    hash(r.x + 3.3) * TAU + hash(i + 3.3) * SCATTER, r.x, fibre(i, r.y), select(0.0, 1.0, traced(i)),
  );
}

// Texel c of sample k.
fn texel(k: f32, c: f32) -> vec4f {
  let row = floor(k / ROW);
  return textureLoad(paths, vec2i(i32((k - row * ROW) * TEXELS + c), i32(row)), 0);
}

// A path's first sample on screen and how many: the cord's from 3.w and 4.x, a peel's from 5–7.
fn span(path: f32) -> vec2f {
  if (path < 0.5) { return vec2f(U[3].w, U[4].x); }
  let p = u32(path) - 1u;
  let pair = U[5u + p / 2u];
  return select(pair.xy, pair.zw, (p & 1u) == 1u);
}

// Where a thread is at sample k: on the page, how loose (0 braided to 1), its strand's depth in the plait, how far
// along its path, how bright the path is there, its hue there (gradient cycles, as weave adds them up), and whether the
// path carries the lead. Mirrors place in cord.ts.
struct Placed { at: vec2f, loose: f32, depth: f32, s: f32, light: f32, hue: f32, leads: f32 };

fn place(th: Thread, k: f32) -> Placed {
  let a = texel(k, 0.0); let b = texel(k, 1.0); let c = texel(k, 2.0);
  let t = U[0].w; let radius = U[3].x;
  let loose = b.y;
  // The twist and drift carry on from where the hero's strands stood at the seam.
  let twist = b.x / (PITCH * radius) * TAU + U[2].x - t * SPIN + th.strand * TAU / 3.0;
  let braided = radius * band(twist, th.strand, th.fibre, b.x / DRIFT_SPAN + U[2].w, 1.0);
  var sway = 0.0;
  if (th.path < 0.5) {
    sway = b.z * WAVE * (sin(b.x * 0.004 + t * 0.35 + th.phase) * 0.6 + sin(b.x * 0.008 - t * 0.23 + th.phase * 1.7) * 0.4);
  }
  let spread = th.lane * b.z + sway;
  // The braid's swing fades as the strands part, gone once they are two braid radii apart, so a strand coming loose
  // straightens rather than crimps.
  let held = (1.0 - loose) * exp(-pow(loose * b.z / radius, 2.0));
  return Placed(a.xy + a.zw * braided * held + c.xy * spread * loose, loose, depthOf(twist), b.x, c.z, b.w, c.w);
}

// How much light shows at p: less behind a section's prose, fading in over a few pixels around it.
fn behindCopy(p: vec2f) -> f32 {
  var light = 1.0;
  for (var r = 0u; r < u32(U[2].z); r++) {
    let box = U[11u + r];
    let outside = max(max(box.x - p.x, p.x - box.z), max(box.y - p.y, p.y - box.w));
    light = min(light, mix(COPY_LIGHT, 1.0, smoothstep(-8.0, 40.0, outside)));
  }
  return light;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let i = f32(ii);
  let th = threadOf(i);
  let range = span(th.path);
  // Past the path's end, vertices repeat its last pair, so their triangles have no area.
  let s = min(f32(vi / 2u), max(range.y - 1.0, 0.0));
  let k = range.x + s;
  let side = select(-1.0, 1.0, (vi & 1u) == 1u);
  let here = place(th, k);
  let last = s >= range.y - 1.0;
  let other = place(th, select(k + 1.0, k - 1.0, last)).at;
  let dir = select(other - here.at, here.at - other, last);
  let tangent = dir / max(length(dir), 1e-4);
  let pos = here.at + vec2f(-tangent.y, tangent.x) * side * ${HALF_WIDTH} - U[1].xy;

  // The braid's depth shading, its warm strands leaning violet behind, and its glints fade as soon as a strand starts
  // to part, so the loose strands carry no rows of the braid's crossings.
  let knit = 1.0 - min(here.loose * PULSE_SPREAD, 1.0);
  // Each strand keeps its colour as it parts, its ribbons a little apart, and runs violet to amber and back along the
  // cord, faster where it is braided, carrying on the hero's gradient and breath from the seam.
  var pick = hash(i + 4.4);
  if (th.lead > 0.0 || hash(i + 9.7) < COHERENCE) { pick = fract(th.ribbon * 0.618034 + HUE); }
  let t = U[0].w;
  let run = here.s / DRIFT_SPAN;
  let breathing = breath(th.strand, run + U[2].w, t);
  let hue = hueOf(0.0, 0.0, th.strand / 3.0 + LOOSE_HUE * (pick - 0.5) * here.loose, t, breathing) + here.hue + U[2].y;
  let colour = linear(mix(U[8].rgb, U[9].rgb, cool(warmth(hue), here.depth, knit)));
  let own = DIM + (1.0 - DIM) * pow(hash(i + 2.2), 3.0);
  // The lead burns brighter all the way down, on the cord and on the strand that carries it on where the cord ends.
  let lead = 1.0 + (TRACED - 1.0) * th.lead * here.leads;
  let shade = mix(own * LOOSE_LIGHT, braidLight(here.depth, th.fibre, own), knit) * lead * (1.0 + BREATH_LIGHT * breathing);
  // The cord fades out over FADE above its tip, and dims behind prose.
  let tip = 1.0 - smoothstep(U[1].z - FADE, U[1].z, here.at.y);

  var out: Out;
  let res = U[0].xy;
  out.clip = vec4f(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  out.colour = colour * shade * here.light * tip * behindCopy(here.at) * U[1].w;
  out.across = side;
  out.pulse = vec2f(
    run * PULSES - t * PULSE_SPEED * PULSES + hash(i + 6.6) * min(here.loose * PULSE_SPREAD, 1.0),
    mix(BRAID_PULSE_LIGHT, PULSE_LIGHT, here.loose),
  );
  out.glint = vec4f(
    run * GLINTS - t * GLINT_SPEED * GLINTS + hash(i + 7.7),
    (1.0 - knit) * LOOSE_GLINT * spark(shade),
    knit * glintLight(here.depth, th.fibre) * spark(shade),
    hash(i + 8.8) * 97.0,
  );
  return out;
}
`

export const cordVertexGlsl = /* glsl */ `${commonGlslFor(CORD_VEC4S)}
${cordConstants((name, value) => `const float ${name} = ${value};`)}
uniform highp sampler2D data;
out vec3 vColour;
out float vAcross;
out vec2 vPulse;
out vec4 vGlint;

struct Thread { float path; float lane; float strand; float phase; float ribbon; vec3 fibre; float lead; };

Thread threadOf(float i) {
  if (i >= CORD_THREADS) {
    float peel = floor((i - CORD_THREADS) / PEEL_THREADS);
    float j = i - CORD_THREADS - peel * PEEL_THREADS;
    float across = (j + 0.5) / PEEL_THREADS * 2.0 - 1.0;
    return Thread(1.0 + peel, across, mod(peel, 3.0), 0.0, peel, fibre(i, across), step(PEEL_THREADS - PEEL_LEAD, j));
  }
  vec2 r = ribbonOf(i);
  vec2 lanes = laneOf(i, r.x);
  return Thread(
    0.0, lanes.x + r.y * lanes.y, strandOf(lanes.x),
    hash(r.x + 3.3) * TAU + hash(i + 3.3) * SCATTER, r.x, fibre(i, r.y), traced(i) ? 1.0 : 0.0
  );
}

vec4 texel(float k, float c) {
  float row = floor(k / ROW);
  return texelFetch(data, ivec2(int((k - row * ROW) * TEXELS + c), int(row)), 0);
}

vec2 span(float path) {
  if (path < 0.5) return vec2(U[3].w, U[4].x);
  int p = int(path) - 1;
  vec4 pair = U[5 + p / 2];
  return (p % 2) == 1 ? pair.zw : pair.xy;
}

struct Placed { vec2 at; float loose; float depth; float s; float light; float hue; float leads; };

Placed place(Thread th, float k) {
  vec4 a = texel(k, 0.0); vec4 b = texel(k, 1.0); vec4 c = texel(k, 2.0);
  float t = U[0].w; float radius = U[3].x;
  float loose = b.y;
  float twist = b.x / (PITCH * radius) * TAU + U[2].x - t * SPIN + th.strand * TAU / 3.0;
  float braided = radius * band(twist, th.strand, th.fibre, b.x / DRIFT_SPAN + U[2].w, 1.0);
  float sway = 0.0;
  if (th.path < 0.5) {
    sway = b.z * WAVE * (sin(b.x * 0.004 + t * 0.35 + th.phase) * 0.6 + sin(b.x * 0.008 - t * 0.23 + th.phase * 1.7) * 0.4);
  }
  float spread = th.lane * b.z + sway;
  float held = (1.0 - loose) * exp(-pow(loose * b.z / radius, 2.0));
  return Placed(a.xy + a.zw * braided * held + c.xy * spread * loose, loose, depthOf(twist), b.x, c.z, b.w, c.w);
}

float behindCopy(vec2 p) {
  float light = 1.0;
  for (int r = 0; r < ${MAX_COPY}; r++) {
    if (float(r) >= U[2].z) break;
    vec4 box = U[11 + r];
    float outside = max(max(box.x - p.x, p.x - box.z), max(box.y - p.y, p.y - box.w));
    light = min(light, mix(COPY_LIGHT, 1.0, smoothstep(-8.0, 40.0, outside)));
  }
  return light;
}

void main() {
  float i = float(gl_InstanceID);
  Thread th = threadOf(i);
  vec2 range = span(th.path);
  float s = min(float(gl_VertexID / 2), max(range.y - 1.0, 0.0));
  float k = range.x + s;
  float side = (gl_VertexID % 2) == 1 ? 1.0 : -1.0;
  Placed here = place(th, k);
  bool last = s >= range.y - 1.0;
  vec2 other = place(th, last ? k - 1.0 : k + 1.0).at;
  vec2 dir = last ? here.at - other : other - here.at;
  vec2 tangent = dir / max(length(dir), 1e-4);
  vec2 pos = here.at + vec2(-tangent.y, tangent.x) * side * ${HALF_WIDTH} - U[1].xy;

  float knit = 1.0 - min(here.loose * PULSE_SPREAD, 1.0);
  float pick = th.lead > 0.0 || hash(i + 9.7) < COHERENCE ? fract(th.ribbon * 0.618034 + HUE) : hash(i + 4.4);
  float t = U[0].w;
  float run = here.s / DRIFT_SPAN;
  float breathing = breath(th.strand, run + U[2].w, t);
  float hue = hueOf(0.0, 0.0, th.strand / 3.0 + LOOSE_HUE * (pick - 0.5) * here.loose, t, breathing) + here.hue + U[2].y;
  vec3 colour = linear(mix(U[8].rgb, U[9].rgb, cool(warmth(hue), here.depth, knit)));
  float own = DIM + (1.0 - DIM) * pow(hash(i + 2.2), 3.0);
  float lead = 1.0 + (TRACED - 1.0) * th.lead * here.leads;
  float shade = mix(own * LOOSE_LIGHT, braidLight(here.depth, th.fibre, own), knit) * lead * (1.0 + BREATH_LIGHT * breathing);
  float tip = 1.0 - smoothstep(U[1].z - FADE, U[1].z, here.at.y);

  vec2 res = U[0].xy;
  gl_Position = vec4(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  vColour = colour * shade * here.light * tip * behindCopy(here.at) * U[1].w;
  vAcross = side;
  vPulse = vec2(run * PULSES - t * PULSE_SPEED * PULSES + hash(i + 6.6) * min(here.loose * PULSE_SPREAD, 1.0), mix(BRAID_PULSE_LIGHT, PULSE_LIGHT, here.loose));
  vGlint = vec4(
    run * GLINTS - t * GLINT_SPEED * GLINTS + hash(i + 7.7),
    (1.0 - knit) * LOOSE_GLINT * spark(shade),
    knit * glintLight(here.depth, th.fibre) * spark(shade),
    hash(i + 8.8) * 97.0
  );
}
`
