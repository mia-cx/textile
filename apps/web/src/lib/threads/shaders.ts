import { CORD_THREADS, DRIFT_SPAN, LOOSEN, MAX_COPY, PEEL_THREADS, ROW, TEXELS } from './cord'
import { CROWD, MAX_LABELS, SEGMENTS, SHAPE } from './geometry'

/**
 * The thread field's shaders, in WGSL for WebGPU and GLSL ES 3.00 for WebGL2. Both run `position` from geometry.ts per
 * vertex, with its SHAPE: each thread is one instance, a triangle strip of SEGMENTS + 1 pairs of vertices widened
 * across the curve. Pulses of light run along every thread toward the end, and in the braid, glints spark along each
 * fibre where its band turns toward the light.
 *
 * A frame takes four more passes after the threads add their light into a half-float target: `bloom` shrinks that
 * light to a small target (`BLOOM_SCALE` of the CSS size), `blur` spreads it across and then down, and `tone` maps the
 * light, its bloom, and a flare where the cord ends over the ink.
 *
 * Uniforms are eleven vec4s, packed by `pack` in renderer.ts:
 *   0  width, height (CSS px), device pixel ratio, time (s)
 *   1  start.xy, control.xy
 *   2  end.xy, spread, cord
 *   3  braid, count, intensity, label count
 *   4–7  labels: at, lane
 *   8–9  colours: violet, amber
 *   10 background rgb, exposure
 */
export const UNIFORM_VEC4S = 11
export const VERTICES_PER_THREAD = (SEGMENTS + 1) * 2
/** The bloom target's size, as a fraction of the canvas's CSS size: the same blur radius at every pixel ratio. */
export const BLOOM_SCALE = 0.25

/** A number as a shader float literal: `2` becomes `2.0`. */
const float = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

/** Half the strip's width, in CSS pixels: room for the thread's own soft halo; the bloom gives the wider glow. */
const HALF_WIDTH = float(2)

/** The white the densest light burns toward, in either language's vector type: warm, like the concept's hot crossings. */
const WARM_WHITE = (vec3: string) => `${vec3}(1.0, 0.93, 0.84)`

/** The constants both languages share, each written by `declare` in that language's syntax. */
const constants = (declare: (name: string, value: string) => string) =>
  [
    declare('TAU', '6.283185307'),
    declare('PITCH', float(SHAPE.pitch)),
    declare('SWELL', float(SHAPE.swell)),
    declare('TAPER', float(SHAPE.taper)),
    declare('CLOSE', float(SHAPE.close)),
    declare('WAVE', float(SHAPE.wave)),
    declare('FRAY', float(SHAPE.fray)),
    declare('FLAT', float(SHAPE.flat)),
    declare('EDGES', float(SHAPE.edges)),
    declare('EDGE_LANES', float(SHAPE.edgeLanes)),
    declare('EDGE_STEP', float(SHAPE.edgeStep)),
    declare('INNER', float(SHAPE.inner)),
    declare('EDGE_LIGHT', float(SHAPE.edgeLight)),
    declare('INNER_LIGHT', float(SHAPE.innerLight)),
    declare('FIBRES', float(SHAPE.fibres)),
    declare('DRIFT', float(SHAPE.drift)),
    declare('WEAVE', float(SHAPE.weave)),
    declare('RIBBONS', float(SHAPE.ribbons)),
    declare('RIBBON', float(SHAPE.ribbon)),
    declare('JOIN', float(SHAPE.join)),
    declare('JOINED', float(SHAPE.joined)),
    declare('INWARD', float(SHAPE.inward)),
    declare('STAGGER', float(SHAPE.stagger)),
    declare('SCATTER', float(SHAPE.scatter)),
    declare('PINNED', float(SHAPE.pinned)),
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
    declare('BRAID_LIGHT', float(0.5)),
    // Pulses along each thread, how fast they travel (thread lengths per second), and how bright they peak: less in the
    // braid, where hundreds of threads pulse in step and would otherwise burn it flat white.
    declare('PULSES', float(2.5)),
    declare('PULSE_SPEED', float(0.16)),
    declare('PULSE_LIGHT', float(2.2)),
    declare('BRAID_PULSE_LIGHT', float(0.3)),
    // Glints in the braid: specular sparkles where a fibre catches the light, `GLINTS` along each thread's length,
    // travelling with the flow (thread lengths per second). They show where a band turns toward the light, at
    // `LIGHT_ANGLE` of its twist past facing the viewer, brightest on its edge fibres.
    declare('GLINTS', float(10)),
    declare('GLINT_SPEED', float(0.05)),
    declare('GLINT_LIGHT', float(24)),
    declare('LIGHT_ANGLE', float(0.5)),
    // How much of the bloom adds back, and how bright the flare is where the cord ends.
    declare('BLOOM', float(0.8)),
    declare('FLARE_LIGHT', float(2.5)),
    // How far the densest light burns toward white: partly, so the hottest crossings keep their colour.
    declare('WHITE_HOT', float(0.35)),
  ].join('\n')

/** What every WGSL thread module and the tone pass share, for a scene of `vec4s` uniforms. */
export const commonWgslFor = (vec4s: number) => /* wgsl */ `
@group(0) @binding(0) var<uniform> U: array<vec4f, ${vec4s}>;
${constants((name, value) => `const ${name} = ${value};`)}
fn hash(n: f32) -> f32 { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
fn ribbonOf(i: f32) -> f32 { return floor(hash(i + 1.3) * RIBBONS); }
fn along(fraction: f32) -> f32 { return 1.0 - pow(1.0 - fraction, CROWD); }
// How warm a thread is at a phase (in gradient cycles): 0 violet, 1 amber. Mirrors warmth in geometry.ts.
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
    INNER * (bundle * 2.0 - 1.0 + (hash(i + 8.3) - 0.5) * 0.2),
    sign(across) * (1.0 - EDGE_STEP * min(floor((1.0 - reach) / EDGES * EDGE_LANES), EDGE_LANES - 1.0)),
    edge,
  );
  return vec3f(jitter, select(0.0, 1.0, edge), hash(i + 4.7) * TAU);
}
// How far from its strand's centre a fibre lies, in braid radii, where the braid has turned twist and u along the
// fibre: its band is widest facing the viewer and narrowest edge-on. Mirrors band in geometry.ts.
fn band(twist: f32, f: vec3f, u: f32) -> f32 {
  return (f.x + (1.0 - f.y) * DRIFT * sin(u * WEAVE + f.z)) * FRAY * (FLAT + (1.0 - FLAT) * abs(cos(twist)));
}
// The light a fibre gives in the braid, for one of brightness own in the funnel: more on a band's edges, less inside.
fn bandLight(f: vec3f, own: f32) -> f32 { return mix(INNER_LIGHT * own, EDGE_LIGHT, f.y); }
// How brightly a fibre glints where the braid has turned twist: where its band turns toward the light.
fn glintLight(twist: f32, f: vec3f) -> f32 {
  let facing = max(cos(twist - LIGHT_ANGLE), 0.0);
  let f2 = facing * facing;
  return GLINT_LIGHT * f2 * f2 * f2 * mix(0.3, 1.0, f.y);
}
// Light to colour without bleaching it: the brightest channel saturates as 1 - e^(-x) and the others keep their share
// of it, so dense light keeps its hue; only the densest, at the braid's crossings and where the cord ends, burns toward
// a warm white, as hot filament does.
fn tone(hdr: vec3f) -> vec3f {
  let peak = max(max(hdr.r, hdr.g), max(hdr.b, 1e-4)) * U[10].w;
  return mix(hdr * U[10].w * (1.0 - exp(-peak)) / peak, ${WARM_WHITE('vec3f')}, smoothstep(2.5, 6.0, peak) * WHITE_HOT);
}
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
  // x: where the thread is in its glints. y: how bright they are here.
  @location(3) glint: vec2f,
};

// A thread's light where it is a phase of the way through its pulses: dim between them, as bright as light at their
// narrow crests.
fn pulse(phase: f32, light: f32) -> f32 {
  let crest = 0.5 + 0.5 * cos(TAU * phase);
  let crest4 = crest * crest * crest * crest;
  return 0.55 + light * crest4 * crest4 * crest4;
}

// A glint's light where a fibre is a phase of the way through its glints: short, sharp sparks.
fn glint(phase: f32) -> f32 {
  var c = 0.5 + 0.5 * cos(TAU * phase);
  c = c * c; c = c * c; c = c * c; c = c * c; c = c * c;
  return c;
}

@fragment
fn fs(v: Out) -> @location(0) vec4f {
  let d = abs(v.across) * ${HALF_WIDTH};
  let core = exp(-(d * d) / 0.3);
  let halo = 0.1 * exp(-(d * d) / 1.6);
  return vec4f(v.colour * (core + halo) * (pulse(v.pulse.x, v.pulse.y) + glint(v.glint.x) * v.glint.y), 1.0);
}`

export const threadWgsl = /* wgsl */ `${commonWgsl}
${fragmentWgsl}

// What makes one thread itself: its lane, its label's place (or -1), where it joins the braid, its strand, its sway's
// phase, its fibre (as fibre returns it), and its ribbon. Mirrors thread in geometry.ts.
struct Thread { lane: f32, pin: f32, joins: f32, strand: f32, phase: f32, fibre: vec3f, ribbon: f32 };

fn threadOf(i: f32) -> Thread {
  let braid = U[3].x;
  let ribbon = ribbonOf(i);
  let centre = (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15;
  var across = (hash(i + 0.5) - 0.5) * 2.0;
  var lane = centre + across * RIBBON / 2.0;
  var side = centre;
  var pin = -1.0;
  if (i < U[3].w) { let label = U[4u + u32(i)]; pin = label.x; lane = label.y; side = label.y; across = sign(label.y); }
  let order = INWARD * abs(side) + (1.0 - INWARD) * hash(ribbon + 7.1) + STAGGER * hash(i + 7.1);
  var joins = braid + (JOINED - braid) * min(1.0, order);
  if (pin >= 0.0) { joins = max(joins, min(JOINED, pin + JOIN * 1.5)); }
  let phase = hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SCATTER;
  return Thread(lane, pin, joins, strandOf(side), phase, fibre(i, across), ribbon);
}

// Where a thread is u along it: in CSS px, how far into the braid (0 to 1), and the braid's twist there.
struct Placed { at: vec2f, braided: f32, twist: f32 };

fn place(th: Thread, u: f32) -> Placed {
  let p0 = U[1].xy; let p1 = U[1].zw; let p2 = U[2].xy;
  let spread = U[2].z; let cord = U[2].w; let t = U[0].w;
  let a = 1.0 - u;
  let p = a * a * p0 + 2.0 * a * u * p1 + u * u * p2;
  let tangent = 2.0 * a * (p1 - p0) + 2.0 * u * (p2 - p1);
  let n = vec2f(-tangent.y, tangent.x) / max(length(tangent), 1.0);

  let radius = cord * (1.0 + SWELL * a);
  let width = radius + spread * pow(max(1.0 - u / CLOSE, 0.0), TAPER);
  var held = 1.0;
  if (th.pin >= 0.0) { let d = (u - th.pin) / 0.09; held = 1.0 - (1.0 - PINNED) * exp(-d * d); }
  let sway = sin(u * 4.5 + t * 0.35 + th.phase) * 0.6 + sin(u * 9.0 - t * 0.23 + th.phase * 1.7) * 0.4;
  let current = width * (th.lane + WAVE * held * sway);

  let spine = (2.0 * distance(p0, p2) + distance(p0, p1) + distance(p1, p2)) / 3.0;
  let turns = spine / (PITCH * cord * SWELL);
  let twist = turns * TAU * log((1.0 + SWELL) / (1.0 + SWELL * a)) - t * SPIN + th.strand * TAU / 3.0;
  let braided = radius * (sin(twist) + band(twist, th.fibre, u));
  let inBraid = smoothstep(th.joins - JOIN, th.joins, u);
  return Placed(p + n * mix(current, braided, inBraid), inBraid, twist);
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

  // Each thread runs violet to amber and back along its length, the gradient flowing toward the window. In the funnel
  // most threads share their ribbon's phase; in the braid, each takes its strand's.
  var pick = hash(i + 4.4);
  if (hash(i + 9.7) < COHERENCE) { pick = fract(th.ribbon * 0.618034 + HUE); }
  let flow = u * GRADIENT * mix(1.0, BRAID_GRADIENT, here.braided) - U[0].w * FLOW;
  let colour = mix(U[8].rgb, U[9].rgb, warmth(flow + mix(pick, th.strand / 3.0, here.braided)));
  var own = DIM + (1.0 - DIM) * pow(hash(i + 2.2), 3.0);
  if (i < U[3].w) { own = LABELLED; }
  // Bands in front of the braid catch the light; those behind fall into shadow. Many threads share the braid, so
  // each gives less light there, its band's edges more than its inside.
  let facing = 0.15 + 0.85 * (0.5 + 0.5 * cos(here.twist));
  let shade = mix(own, bandLight(th.fibre, own) * facing * BRAID_LIGHT, here.braided) * smoothstep(0.0, 0.06, u);

  var out: Out;
  let res = U[0].xy;
  out.clip = vec4f(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  out.colour = colour * shade * U[3].z;
  out.across = side;
  out.pulse = vec2f(
    u * PULSES - U[0].w * PULSE_SPEED * PULSES + hash(i + 6.6) * (1.0 - here.braided),
    mix(PULSE_LIGHT, BRAID_PULSE_LIGHT, here.braided),
  );
  out.glint = vec2f(
    u * GLINTS - U[0].w * GLINT_SPEED * GLINTS + hash(i + 7.7),
    glintLight(here.twist, th.fibre) * here.braided,
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

/** The blur's taps beside the centre, in source pixels, and their weights: a 9-tap Gaussian in five bilinear taps. */
const BLUR = {
  near: '1.3846',
  far: '3.2308',
  centre: '0.2270',
  nearWeight: '0.3162',
  farWeight: '0.0703',
}

/**
 * The most source pixels `shrink` reads across each axis: a quarter-size bloom target covers 8 at the field's highest
 * pixel ratio, 2, and one more when the ratio is fractional.
 */
const MAX_FOOTPRINT = 9

/**
 * `shrink` draws the light into the bloom target, each pixel averaging the source pixels whose centres fall inside its
 * footprint, sampled at those centres. Neighbouring footprints tile the source, so at any pixel ratio, fractional ones
 * included, every source pixel counts exactly once; skipping any would let a thin thread's bloom flicker as it crosses
 * the grid. `across` and `down` blur the bloom target one way each.
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

fn blur(uv: vec2f, direction: vec2f) -> vec4f {
  let stride = direction / vec2f(textureDimensions(source));
  let sum = textureSample(source, filtering, uv).rgb * ${BLUR.centre}
    + (textureSample(source, filtering, uv + stride * ${BLUR.near}).rgb
      + textureSample(source, filtering, uv - stride * ${BLUR.near}).rgb) * ${BLUR.nearWeight}
    + (textureSample(source, filtering, uv + stride * ${BLUR.far}).rgb
      + textureSample(source, filtering, uv - stride * ${BLUR.far}).rgb) * ${BLUR.farWeight};
  return vec4f(sum, 1.0);
}

@fragment
fn across(v: Screen) -> @location(0) vec4f { return blur(v.uv, vec2f(1.0, 0.0)); }

@fragment
fn down(v: Screen) -> @location(0) vec4f { return blur(v.uv, vec2f(0.0, 1.0)); }
`

/**
 * Light where the cord ends, `r` cord radii away, in either language: a hot, near-white point the width of the cord
 * inside a wider violet glow.
 */
const flare = (vec3: string) =>
  `mix(U[8].rgb, mix(mix(U[8].rgb, U[9].rgb, 0.5), ${vec3}(1.0), 0.5), exp(-r * 0.6)) * FLARE_LIGHT * U[3].z * (2.0 * exp(-r * r * 0.5) + 0.5 * exp(-r * 0.35))`

export const toneWgsl = /* wgsl */ `${commonWgsl}
${fullscreenWgsl}
@group(0) @binding(1) var light: texture_2d<f32>;
@group(0) @binding(2) var bloom: texture_2d<f32>;
@group(0) @binding(3) var filtering: sampler;

fn flare(r: f32) -> vec3f { return ${flare('vec3f')}; }

fn dither(at: vec2f) -> f32 { return (hash(at.x * 0.137 + at.y * 1.173) - 0.5) / 255.0; }

@fragment
fn fs(v: Screen) -> @location(0) vec4f {
  let css = v.at.xy / U[0].z;
  let hdr = textureLoad(light, vec2i(v.at.xy), 0).rgb
    + textureSample(bloom, filtering, v.uv).rgb * BLOOM
    + flare(distance(css, U[2].xy) / U[2].w);
  return vec4f(U[10].rgb + tone(hdr) + dither(v.at.xy), 1.0);
}

// Over the page: the light alone, premultiplied, as opaque as its brightest channel, so it lays over the page's ink
// much as it would add to it. No flare.
@fragment
fn over(v: Screen) -> @location(0) vec4f {
  let hdr = textureLoad(light, vec2i(v.at.xy), 0).rgb + textureSample(bloom, filtering, v.uv).rgb * BLOOM;
  let mapped = max(tone(hdr) + dither(v.at.xy), vec3f(0.0));
  return vec4f(mapped, min(max(mapped.r, max(mapped.g, mapped.b)), 1.0));
}
`

/** What every GLSL thread vertex shader and the tone pass share, for a scene of `vec4s` uniforms. */
export const commonGlslFor = (vec4s: number) => /* glsl */ `#version 300 es
precision highp float;
uniform vec4 U[${vec4s}];
${constants((name, value) => `const float ${name} = ${value};`)}
float hash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
float ribbonOf(float i) { return floor(hash(i + 1.3) * RIBBONS); }
float along(float fraction) { return 1.0 - pow(1.0 - fraction, CROWD); }
float warmth(float phase) { return smoothstep(-TURN, TURN, sin(TAU * phase) + WARM); }
float strandOf(float side) { return clamp(floor((side + 1.0) * 1.5), 0.0, 2.0); }
vec3 fibre(float i, float across) {
  float reach = abs(across);
  bool edge = reach > 1.0 - EDGES;
  float inside = (across / (1.0 - EDGES) + 1.0) / 2.0;
  float bundle = (min(floor(inside * FIBRES), FIBRES - 1.0) + 0.5) / FIBRES;
  float jitter = edge
    ? sign(across) * (1.0 - EDGE_STEP * min(floor((1.0 - reach) / EDGES * EDGE_LANES), EDGE_LANES - 1.0))
    : INNER * (bundle * 2.0 - 1.0 + (hash(i + 8.3) - 0.5) * 0.2);
  return vec3(jitter, edge ? 1.0 : 0.0, hash(i + 4.7) * TAU);
}
float band(float twist, vec3 f, float u) {
  return (f.x + (1.0 - f.y) * DRIFT * sin(u * WEAVE + f.z)) * FRAY * (FLAT + (1.0 - FLAT) * abs(cos(twist)));
}
float bandLight(vec3 f, float own) { return mix(INNER_LIGHT * own, EDGE_LIGHT, f.y); }
float glintLight(float twist, vec3 f) {
  float facing = max(cos(twist - LIGHT_ANGLE), 0.0);
  float f2 = facing * facing;
  return GLINT_LIGHT * f2 * f2 * f2 * mix(0.3, 1.0, f.y);
}
vec3 tone(vec3 hdr) {
  float peak = max(max(hdr.r, hdr.g), max(hdr.b, 1e-4)) * U[10].w;
  return mix(hdr * U[10].w * (1.0 - exp(-peak)) / peak, ${WARM_WHITE('vec3')}, smoothstep(2.5, 6.0, peak) * WHITE_HOT);
}
`

const commonGlsl = commonGlslFor(UNIFORM_VEC4S)

export const threadVertexGlsl = /* glsl */ `${commonGlsl}
out vec3 vColour;
out float vAcross;
out vec2 vPulse;
out vec2 vGlint;

struct Thread { float lane; float pin; float joins; float strand; float phase; vec3 fibre; float ribbon; };

Thread threadOf(float i) {
  float braid = U[3].x;
  float ribbon = ribbonOf(i);
  float centre = (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15;
  float across = (hash(i + 0.5) - 0.5) * 2.0;
  float lane = centre + across * RIBBON / 2.0;
  float side = centre;
  float pin = -1.0;
  for (int k = 0; k < ${MAX_LABELS}; k++) {
    if (float(k) < U[3].w && float(k) == i) {
      pin = U[4 + k].x; lane = U[4 + k].y; side = U[4 + k].y; across = sign(U[4 + k].y);
    }
  }
  float order = INWARD * abs(side) + (1.0 - INWARD) * hash(ribbon + 7.1) + STAGGER * hash(i + 7.1);
  float joins = braid + (JOINED - braid) * min(1.0, order);
  if (pin >= 0.0) joins = max(joins, min(JOINED, pin + JOIN * 1.5));
  float phase = hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SCATTER;
  return Thread(lane, pin, joins, strandOf(side), phase, fibre(i, across), ribbon);
}

struct Placed { vec2 at; float braided; float twist; };

Placed place(Thread th, float u) {
  vec2 p0 = U[1].xy; vec2 p1 = U[1].zw; vec2 p2 = U[2].xy;
  float spread = U[2].z; float cord = U[2].w; float t = U[0].w;
  float a = 1.0 - u;
  vec2 p = a * a * p0 + 2.0 * a * u * p1 + u * u * p2;
  vec2 tangent = 2.0 * a * (p1 - p0) + 2.0 * u * (p2 - p1);
  vec2 n = vec2(-tangent.y, tangent.x) / max(length(tangent), 1.0);

  float radius = cord * (1.0 + SWELL * a);
  float width = radius + spread * pow(max(1.0 - u / CLOSE, 0.0), TAPER);
  float held = 1.0;
  if (th.pin >= 0.0) { float d = (u - th.pin) / 0.09; held = 1.0 - (1.0 - PINNED) * exp(-d * d); }
  float sway = sin(u * 4.5 + t * 0.35 + th.phase) * 0.6 + sin(u * 9.0 - t * 0.23 + th.phase * 1.7) * 0.4;
  float current = width * (th.lane + WAVE * held * sway);

  float spine = (2.0 * distance(p0, p2) + distance(p0, p1) + distance(p1, p2)) / 3.0;
  float turns = spine / (PITCH * cord * SWELL);
  float twist = turns * TAU * log((1.0 + SWELL) / (1.0 + SWELL * a)) - t * SPIN + th.strand * TAU / 3.0;
  float braided = radius * (sin(twist) + band(twist, th.fibre, u));
  float inBraid = smoothstep(th.joins - JOIN, th.joins, u);
  return Placed(p + n * mix(current, braided, inBraid), inBraid, twist);
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

  float pick = hash(i + 9.7) < COHERENCE ? fract(th.ribbon * 0.618034 + HUE) : hash(i + 4.4);
  float flow = u * GRADIENT * mix(1.0, BRAID_GRADIENT, here.braided) - U[0].w * FLOW;
  vec3 colour = mix(U[8].rgb, U[9].rgb, warmth(flow + mix(pick, th.strand / 3.0, here.braided)));
  float own = i < U[3].w ? LABELLED : DIM + (1.0 - DIM) * pow(hash(i + 2.2), 3.0);
  float facing = 0.15 + 0.85 * (0.5 + 0.5 * cos(here.twist));
  float shade = mix(own, bandLight(th.fibre, own) * facing * BRAID_LIGHT, here.braided) * smoothstep(0.0, 0.06, u);

  vec2 res = U[0].xy;
  gl_Position = vec4(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  vColour = colour * shade * U[3].z;
  vAcross = side;
  vPulse = vec2(
    u * PULSES - U[0].w * PULSE_SPEED * PULSES + hash(i + 6.6) * (1.0 - here.braided),
    mix(PULSE_LIGHT, BRAID_PULSE_LIGHT, here.braided)
  );
  vGlint = vec2(u * GLINTS - U[0].w * GLINT_SPEED * GLINTS + hash(i + 7.7), glintLight(here.twist, th.fibre) * here.braided);
}
`

export const threadFragmentGlsl = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColour;
in float vAcross;
in vec2 vPulse;
in vec2 vGlint;
out vec4 colour;
${constants((name, value) => `const float ${name} = ${value};`)}
float pulse(float phase, float light) {
  float crest = 0.5 + 0.5 * cos(TAU * phase);
  float crest4 = crest * crest * crest * crest;
  return 0.55 + light * crest4 * crest4 * crest4;
}
float glint(float phase) {
  float c = 0.5 + 0.5 * cos(TAU * phase);
  c = c * c; c = c * c; c = c * c; c = c * c; c = c * c;
  return c;
}
void main() {
  float d = abs(vAcross) * ${HALF_WIDTH};
  float light = pulse(vPulse.x, vPulse.y) + glint(vGlint.x) * vGlint.y;
  colour = vec4(vColour * (exp(-(d * d) / 0.3) + 0.1 * exp(-(d * d) / 1.6)) * light, 1.0);
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

export const blurFragmentGlsl = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D source;
uniform vec2 direction;
in vec2 vUv;
out vec4 colour;
void main() {
  vec2 stride = direction / vec2(textureSize(source, 0));
  vec3 sum = texture(source, vUv).rgb * ${BLUR.centre}
    + (texture(source, vUv + stride * ${BLUR.near}).rgb + texture(source, vUv - stride * ${BLUR.near}).rgb) * ${BLUR.nearWeight}
    + (texture(source, vUv + stride * ${BLUR.far}).rgb + texture(source, vUv - stride * ${BLUR.far}).rgb) * ${BLUR.farWeight};
  colour = vec4(sum, 1.0);
}
`

export const toneFragmentGlsl = /* glsl */ `${commonGlsl}
uniform sampler2D light;
uniform sampler2D bloom;
in vec2 vUv;
out vec4 colour;

vec3 flare(float r) { return ${flare('vec3')}; }

void main() {
  vec2 css = vec2(gl_FragCoord.x, float(textureSize(light, 0).y) - gl_FragCoord.y) / U[0].z;
  vec3 hdr = texelFetch(light, ivec2(gl_FragCoord.xy), 0).rgb + texture(bloom, vUv).rgb * BLOOM + flare(distance(css, U[2].xy) / U[2].w);
  vec3 mapped = tone(hdr);
  float dither = (hash(gl_FragCoord.x * 0.137 + gl_FragCoord.y * 1.173) - 0.5) / 255.0;
  colour = vec4(U[10].rgb + mapped + dither, 1.0);
}
`

/** The tone pass for a canvas over the page, as `over` in toneWgsl. */
export const toneOverFragmentGlsl = /* glsl */ `${commonGlsl}
uniform sampler2D light;
uniform sampler2D bloom;
in vec2 vUv;
out vec4 colour;

void main() {
  vec3 hdr = texelFetch(light, ivec2(gl_FragCoord.xy), 0).rgb + texture(bloom, vUv).rgb * BLOOM;
  float dither = (hash(gl_FragCoord.x * 0.137 + gl_FragCoord.y * 1.173) - 0.5) / 255.0;
  vec3 mapped = max(tone(hdr) + dither, vec3(0.0));
  colour = vec4(mapped, min(max(mapped.r, max(mapped.g, mapped.b)), 1.0));
}
`

/**
 * The cord's uniforms, packed by `paint` in cordRenderer.ts. The tone pass reads 0, 2, 3, and 8–10 as it does the
 * hero's, so 2 and 3.z leave its flare out:
 *   0  width, height (CSS px), device pixel ratio, time (s)
 *   1  the canvas's top-left on the page (px), the tip's height on the page, intensity
 *   2  0, 0, how many prose boxes, 1
 *   3  braid radius, cord threads, 0, the cord's first sample on screen
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
    declare('LOOSEN', float(LOOSEN)),
    declare('DRIFT_SPAN', float(DRIFT_SPAN)),
    // How far above its tip the cord fades into the page, in px: 14rem.
    declare('FADE', float(224)),
    // How bright loose strands are, behind a section, and how much of that shows behind its prose.
    declare('LOOSE_LIGHT', float(0.55)),
    declare('COPY_LIGHT', float(0.2)),
  ].join('\n')

export const cordWgsl = /* wgsl */ `${commonWgslFor(CORD_VEC4S)}
${cordConstants((name, value) => `const ${name} = ${value};`)}
${fragmentWgsl}
@group(0) @binding(1) var paths: texture_2d<f32>;

// What makes one cord thread itself: its path (0 the cord, then the peels), its lane, its strand, when it comes
// apart, its sway's phase, its ribbon, and its fibre. Mirrors cordThread in cord.ts.
struct Thread { path: f32, lane: f32, strand: f32, leave: f32, phase: f32, ribbon: f32, fibre: vec3f };

fn threadOf(i: f32) -> Thread {
  if (i >= CORD_THREADS) {
    let peel = floor((i - CORD_THREADS) / PEEL_THREADS);
    let j = i - CORD_THREADS - peel * PEEL_THREADS;
    let across = (j + 0.5) / PEEL_THREADS * 2.0 - 1.0;
    return Thread(1.0 + peel, across, peel - 3.0 * floor(peel / 3.0), 0.0, 0.0, peel, fibre(i, across));
  }
  let ribbon = ribbonOf(i);
  let centre = (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15;
  let across = (hash(i + 0.5) - 0.5) * 2.0;
  let order = min(1.0, INWARD * abs(centre) + (1.0 - INWARD) * hash(ribbon + 7.1) + STAGGER * hash(i + 7.1));
  return Thread(
    0.0, centre + across * RIBBON / 2.0, strandOf(centre), (1.0 - LOOSEN) * (1.0 - order),
    hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SCATTER, ribbon, fibre(i, across),
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

// Where a thread is at sample k: on the page, how loose (0 braided to 1), the braid's twist, how far along its path,
// and how bright the path is there. Mirrors place in cord.ts.
struct Placed { at: vec2f, loose: f32, twist: f32, s: f32, light: f32 };

fn place(th: Thread, k: f32) -> Placed {
  let a = texel(k, 0.0); let b = texel(k, 1.0); let c = texel(k, 2.0);
  let t = U[0].w; let radius = U[3].x;
  let loose = smoothstep(th.leave, th.leave + LOOSEN, b.y);
  let twist = b.x / (PITCH * radius) * TAU - t * SPIN + th.strand * TAU / 3.0;
  let braided = radius * (sin(twist) + band(twist, th.fibre, b.x / DRIFT_SPAN));
  var sway = 0.0;
  if (th.path < 0.5) {
    sway = b.z * WAVE * (sin(b.x * 0.004 + t * 0.35 + th.phase) * 0.6 + sin(b.x * 0.008 - t * 0.23 + th.phase * 1.7) * 0.4);
  }
  let spread = b.w + th.lane * b.z + sway;
  return Placed(a.xy + a.zw * braided * (1.0 - loose) + c.xy * spread * loose, loose, twist, b.x, c.z);
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

  let braided = 1.0 - here.loose;
  var pick = hash(i + 4.4);
  if (hash(i + 9.7) < COHERENCE) { pick = fract(th.ribbon * 0.618034 + HUE); }
  let run = here.s / DRIFT_SPAN;
  let flow = run * GRADIENT * mix(1.0, BRAID_GRADIENT, braided) - U[0].w * FLOW;
  let colour = mix(U[8].rgb, U[9].rgb, warmth(flow + mix(pick, th.strand / 3.0, braided)));
  let own = DIM + (1.0 - DIM) * pow(hash(i + 2.2), 3.0);
  let facing = 0.15 + 0.85 * (0.5 + 0.5 * cos(here.twist));
  let shade = mix(own * LOOSE_LIGHT, bandLight(th.fibre, own) * facing * BRAID_LIGHT, braided);
  // The cord fades out over FADE above its tip, and dims behind prose.
  let tip = 1.0 - smoothstep(U[1].z - FADE, U[1].z, here.at.y);

  var out: Out;
  let res = U[0].xy;
  out.clip = vec4f(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  out.colour = colour * shade * here.light * tip * behindCopy(here.at) * U[1].w;
  out.across = side;
  out.pulse = vec2f(
    run * PULSES - U[0].w * PULSE_SPEED * PULSES + hash(i + 6.6) * here.loose,
    mix(BRAID_PULSE_LIGHT, PULSE_LIGHT, here.loose),
  );
  out.glint = vec2f(run * GLINTS - U[0].w * GLINT_SPEED * GLINTS + hash(i + 7.7), glintLight(here.twist, th.fibre) * braided);
  return out;
}
`

export const cordVertexGlsl = /* glsl */ `${commonGlslFor(CORD_VEC4S)}
${cordConstants((name, value) => `const float ${name} = ${value};`)}
uniform highp sampler2D data;
out vec3 vColour;
out float vAcross;
out vec2 vPulse;
out vec2 vGlint;

struct Thread { float path; float lane; float strand; float leave; float phase; float ribbon; vec3 fibre; };

Thread threadOf(float i) {
  if (i >= CORD_THREADS) {
    float peel = floor((i - CORD_THREADS) / PEEL_THREADS);
    float j = i - CORD_THREADS - peel * PEEL_THREADS;
    float across = (j + 0.5) / PEEL_THREADS * 2.0 - 1.0;
    return Thread(1.0 + peel, across, mod(peel, 3.0), 0.0, 0.0, peel, fibre(i, across));
  }
  float ribbon = ribbonOf(i);
  float centre = (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15;
  float across = (hash(i + 0.5) - 0.5) * 2.0;
  float order = min(1.0, INWARD * abs(centre) + (1.0 - INWARD) * hash(ribbon + 7.1) + STAGGER * hash(i + 7.1));
  return Thread(
    0.0, centre + across * RIBBON / 2.0, strandOf(centre), (1.0 - LOOSEN) * (1.0 - order),
    hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SCATTER, ribbon, fibre(i, across)
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

struct Placed { vec2 at; float loose; float twist; float s; float light; };

Placed place(Thread th, float k) {
  vec4 a = texel(k, 0.0); vec4 b = texel(k, 1.0); vec4 c = texel(k, 2.0);
  float t = U[0].w; float radius = U[3].x;
  float loose = smoothstep(th.leave, th.leave + LOOSEN, b.y);
  float twist = b.x / (PITCH * radius) * TAU - t * SPIN + th.strand * TAU / 3.0;
  float braided = radius * (sin(twist) + band(twist, th.fibre, b.x / DRIFT_SPAN));
  float sway = 0.0;
  if (th.path < 0.5) {
    sway = b.z * WAVE * (sin(b.x * 0.004 + t * 0.35 + th.phase) * 0.6 + sin(b.x * 0.008 - t * 0.23 + th.phase * 1.7) * 0.4);
  }
  float spread = b.w + th.lane * b.z + sway;
  return Placed(a.xy + a.zw * braided * (1.0 - loose) + c.xy * spread * loose, loose, twist, b.x, c.z);
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

  float braided = 1.0 - here.loose;
  float pick = hash(i + 9.7) < COHERENCE ? fract(th.ribbon * 0.618034 + HUE) : hash(i + 4.4);
  float run = here.s / DRIFT_SPAN;
  float flow = run * GRADIENT * mix(1.0, BRAID_GRADIENT, braided) - U[0].w * FLOW;
  vec3 colour = mix(U[8].rgb, U[9].rgb, warmth(flow + mix(pick, th.strand / 3.0, braided)));
  float own = DIM + (1.0 - DIM) * pow(hash(i + 2.2), 3.0);
  float facing = 0.15 + 0.85 * (0.5 + 0.5 * cos(here.twist));
  float shade = mix(own * LOOSE_LIGHT, bandLight(th.fibre, own) * facing * BRAID_LIGHT, braided);
  float tip = 1.0 - smoothstep(U[1].z - FADE, U[1].z, here.at.y);

  vec2 res = U[0].xy;
  gl_Position = vec4(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  vColour = colour * shade * here.light * tip * behindCopy(here.at) * U[1].w;
  vAcross = side;
  vPulse = vec2(run * PULSES - U[0].w * PULSE_SPEED * PULSES + hash(i + 6.6) * here.loose, mix(BRAID_PULSE_LIGHT, PULSE_LIGHT, here.loose));
  vGlint = vec2(run * GLINTS - U[0].w * GLINT_SPEED * GLINTS + hash(i + 7.7), glintLight(here.twist, th.fibre) * braided);
}
`
