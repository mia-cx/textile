import { CROWD, MAX_LABELS, SEGMENTS, SHAPE } from './geometry'

/**
 * The thread field's shaders, in WGSL for WebGPU and GLSL ES 3.00 for WebGL2. Both run `position` from geometry.ts per
 * vertex, with its SHAPE: each thread is one instance, a triangle strip of SEGMENTS + 1 pairs of vertices widened
 * across the curve. Pulses of light run along every thread toward the end.
 *
 * A frame takes four more passes after the threads add their light into a half-float target: `bloom` shrinks that
 * light to a small target (`BLOOM_SCALE` of the CSS size), `blur` spreads it across and then down, and `tone` maps the
 * light, its bloom, and a flare where the cord ends over the ink.
 *
 * Uniforms are twelve vec4s, packed by `pack` in renderer.ts:
 *   0  width, height (CSS px), device pixel ratio, time (s)
 *   1  start.xy, control.xy
 *   2  end.xy, spread, cord
 *   3  braid, count, intensity, label count
 *   4–7  labels: at, lane
 *   8–10 colours: violet, amber, silver
 *   11 background rgb, exposure
 */
export const UNIFORM_VEC4S = 12
export const VERTICES_PER_THREAD = (SEGMENTS + 1) * 2
/** The bloom target's size, as a fraction of the canvas's CSS size: the same blur radius at every pixel ratio. */
export const BLOOM_SCALE = 0.25

/** A number as a shader float literal: `2` becomes `2.0`. */
const float = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

/** Half the strip's width, in CSS pixels: room for the thread's own soft halo; the bloom gives the wider glow. */
const HALF_WIDTH = float(2)

/** The constants both languages share, each written by `declare` in that language's syntax. */
const constants = (declare: (name: string, value: string) => string) =>
  [
    declare('TAU', '6.283185307'),
    declare('PITCH', float(SHAPE.pitch)),
    declare('SWELL', float(SHAPE.swell)),
    declare('TAPER', float(SHAPE.taper)),
    declare('GATHER', float(SHAPE.gather)),
    declare('WAVE', float(SHAPE.wave)),
    declare('FRAY', float(SHAPE.fray)),
    declare('RIBBONS', float(SHAPE.ribbons)),
    declare('RIBBON', float(SHAPE.ribbon)),
    declare('JOIN', float(SHAPE.join)),
    declare('JOINED', float(SHAPE.joined)),
    declare('SPIN', float(SHAPE.spin)),
    declare('SEGMENTS', float(SEGMENTS)),
    declare('CROWD', float(CROWD)),
    // How much light each thread gives in the braid, where hundreds of them overlap.
    declare('BRAID_LIGHT', float(0.22)),
    // Pulses along each thread, how fast they travel (thread lengths per second), and how bright they peak.
    declare('PULSES', float(2.5)),
    declare('PULSE_SPEED', float(0.16)),
    declare('PULSE_LIGHT', float(2.2)),
    // How much of the bloom adds back, and how bright the flare is where the cord ends.
    declare('BLOOM', float(1.1)),
    declare('FLARE_LIGHT', float(2.5)),
  ].join('\n')

const commonWgsl = /* wgsl */ `
@group(0) @binding(0) var<uniform> U: array<vec4f, ${UNIFORM_VEC4S}>;
${constants((name, value) => `const ${name} = ${value};`)}
fn hash(n: f32) -> f32 { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
fn ribbonOf(i: f32) -> f32 { return floor(hash(i + 1.3) * RIBBONS); }
fn along(fraction: f32) -> f32 { return 1.0 - pow(1.0 - fraction, CROWD); }
fn paint(pick: f32) -> vec3f {
  if (pick < 0.48) { return U[8].rgb; }
  if (pick < 0.8) { return U[9].rgb; }
  return U[10].rgb;
}
// The braid's strands: violet, amber, and violet toward silver, so it stays coloured rather than turning white.
fn strandColour(strand: u32) -> vec3f {
  if (strand == 2u) { return mix(U[8].rgb, U[10].rgb, 0.4); }
  return U[8u + strand].rgb;
}
// Light to colour without bleaching it: the brightest channel saturates as 1 - e^(-x) and the others keep their share
// of it, so dense light keeps its hue; only the densest, where the cord ends, burns toward white.
fn tone(hdr: vec3f) -> vec3f {
  let peak = max(max(hdr.r, hdr.g), max(hdr.b, 1e-4)) * U[11].w;
  return mix(hdr * U[11].w * (1.0 - exp(-peak)) / peak, vec3f(1.0), smoothstep(2.0, 6.0, peak) * 0.85);
}
`

export const threadWgsl = /* wgsl */ `${commonWgsl}
struct Out {
  @builtin(position) clip: vec4f,
  @location(0) colour: vec3f,
  @location(1) across: f32,
  @location(2) pulse: f32,
};

// xy: position in CSS px. z: how far into the braid (0 to 1). w: the strand's facing, -1 behind to 1 in front.
fn place(i: f32, u: f32) -> vec4f {
  let p0 = U[1].xy; let p1 = U[1].zw; let p2 = U[2].xy;
  let spread = U[2].z; let cord = U[2].w; let braid = U[3].x; let t = U[0].w;
  let ribbon = ribbonOf(i);
  let centre = (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15;
  var lane = centre + (hash(i + 0.5) - 0.5) * RIBBON;
  var pin = -1.0;
  if (i < U[3].w) { let label = U[4u + u32(i)]; pin = label.x; lane = label.y; }
  var joins = braid + (JOINED - braid) * min(1.0, 0.7 * abs(lane) + 0.3 * hash(i + 7.1));
  if (pin >= 0.0) { joins = max(joins, min(JOINED, pin + JOIN * 1.5)); }
  let strand = i - 3.0 * floor(i / 3.0);
  let phase = hash(ribbon + 3.3) * TAU + hash(i + 3.3) * 0.6;
  let jitter = hash(i + 5.9) * 2.0 - 1.0;

  let a = 1.0 - u;
  let p = a * a * p0 + 2.0 * a * u * p1 + u * u * p2;
  let tangent = 2.0 * a * (p1 - p0) + 2.0 * u * (p2 - p1);
  let n = vec2f(-tangent.y, tangent.x) / max(length(tangent), 1.0);

  let radius = cord * (1.0 + SWELL * a);
  let width = radius + spread * (1.0 - TAPER * u) * (1.0 - smoothstep(GATHER, 1.0, u));
  var held = 1.0;
  if (pin >= 0.0) { let d = (u - pin) / 0.09; held = 1.0 - exp(-d * d); }
  let sway = sin(u * 4.5 + t * 0.35 + phase) * 0.6 + sin(u * 9.0 - t * 0.23 + phase * 1.7) * 0.4;
  let current = width * (lane + WAVE * held * sway);

  let spine = (2.0 * distance(p0, p2) + distance(p0, p1) + distance(p1, p2)) / 3.0;
  let turns = spine / (PITCH * cord * SWELL);
  let twist = turns * TAU * log((1.0 + SWELL) / (1.0 + SWELL * a)) - t * SPIN + strand * TAU / 3.0;
  let braided = radius * (sin(twist) + jitter * FRAY);
  let inBraid = smoothstep(joins - JOIN, joins, u);
  return vec4f(p + n * mix(current, braided, inBraid), inBraid, cos(twist));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let i = f32(ii);
  let s = f32(vi / 2u);
  let u = along(s / SEGMENTS);
  let side = select(-1.0, 1.0, (vi & 1u) == 1u);
  let here = place(i, u);
  // The direction toward the next point, or from the one before at the end.
  let last = s >= SEGMENTS;
  let other = place(i, along(select(s + 1.0, s - 1.0, last) / SEGMENTS)).xy;
  let dir = select(other - here.xy, here.xy - other, last);
  let tangent = dir / max(length(dir), 1e-4);
  let pos = here.xy + vec2f(-tangent.y, tangent.x) * side * ${HALF_WIDTH};

  // Most threads take their ribbon's colour in the funnel; in the braid, each takes its strand's.
  var pick = hash(i + 4.4);
  if (hash(i + 9.7) < 0.75) { pick = fract(ribbonOf(i) * 0.618034 + 0.05); }
  let strand = u32(i) % 3u;
  let colour = mix(paint(pick), strandColour(strand), here.z);
  var brightness = 0.22 + 0.78 * pow(hash(i + 2.2), 3.0);
  if (i < U[3].w) { brightness = 1.0; }
  // Strands in front of the braid catch the light; those behind fall into shadow. Many threads share the braid, so
  // each gives less light there.
  let facing = 0.15 + 0.85 * (0.5 + 0.5 * here.w);
  let shade = mix(1.0, facing * BRAID_LIGHT, here.z) * smoothstep(0.0, 0.06, u);

  var out: Out;
  let res = U[0].xy;
  out.clip = vec4f(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  out.colour = colour * brightness * shade * U[3].z;
  out.across = side;
  out.pulse = u * PULSES - U[0].w * PULSE_SPEED * PULSES + hash(i + 6.6) * (1.0 - here.z);
  return out;
}

// A thread's light where it is a phase of the way through its pulses: dim between them, bright at their narrow crests.
fn pulse(phase: f32) -> f32 {
  let crest = 0.5 + 0.5 * cos(TAU * phase);
  let crest4 = crest * crest * crest * crest;
  return 0.55 + PULSE_LIGHT * crest4 * crest4 * crest4;
}

@fragment
fn fs(v: Out) -> @location(0) vec4f {
  let d = abs(v.across) * ${HALF_WIDTH};
  let core = exp(-(d * d) / 0.3);
  let halo = 0.1 * exp(-(d * d) / 1.6);
  return vec4f(v.colour * (core + halo) * pulse(v.pulse), 1.0);
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
  `mix(U[8].rgb, mix(U[10].rgb, ${vec3}(1.0), 0.5), exp(-r * 0.6)) * FLARE_LIGHT * U[3].z * (2.0 * exp(-r * r * 0.5) + 0.5 * exp(-r * 0.35))`

export const toneWgsl = /* wgsl */ `${commonWgsl}
${fullscreenWgsl}
@group(0) @binding(1) var light: texture_2d<f32>;
@group(0) @binding(2) var bloom: texture_2d<f32>;
@group(0) @binding(3) var filtering: sampler;

fn flare(r: f32) -> vec3f { return ${flare('vec3f')}; }

@fragment
fn fs(v: Screen) -> @location(0) vec4f {
  let css = v.at.xy / U[0].z;
  let hdr = textureLoad(light, vec2i(v.at.xy), 0).rgb
    + textureSample(bloom, filtering, v.uv).rgb * BLOOM
    + flare(distance(css, U[2].xy) / U[2].w);
  let mapped = tone(hdr);
  let dither = (hash(v.at.x * 0.137 + v.at.y * 1.173) - 0.5) / 255.0;
  return vec4f(U[11].rgb + mapped + dither, 1.0);
}
`

const commonGlsl = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 U[${UNIFORM_VEC4S}];
${constants((name, value) => `const float ${name} = ${value};`)}
float hash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
float ribbonOf(float i) { return floor(hash(i + 1.3) * RIBBONS); }
float along(float fraction) { return 1.0 - pow(1.0 - fraction, CROWD); }
vec3 paint(float pick) { return pick < 0.48 ? U[8].rgb : pick < 0.8 ? U[9].rgb : U[10].rgb; }
vec3 strandColour(int strand) { return strand == 2 ? mix(U[8].rgb, U[10].rgb, 0.4) : U[8 + strand].rgb; }
vec3 tone(vec3 hdr) {
  float peak = max(max(hdr.r, hdr.g), max(hdr.b, 1e-4)) * U[11].w;
  return mix(hdr * U[11].w * (1.0 - exp(-peak)) / peak, vec3(1.0), smoothstep(2.0, 6.0, peak) * 0.85);
}
`

export const threadVertexGlsl = /* glsl */ `${commonGlsl}
out vec3 vColour;
out float vAcross;
out float vPulse;

vec4 place(float i, float u) {
  vec2 p0 = U[1].xy; vec2 p1 = U[1].zw; vec2 p2 = U[2].xy;
  float spread = U[2].z; float cord = U[2].w; float braid = U[3].x; float t = U[0].w;
  float ribbon = ribbonOf(i);
  float centre = (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15;
  float lane = centre + (hash(i + 0.5) - 0.5) * RIBBON;
  float pin = -1.0;
  for (int k = 0; k < ${MAX_LABELS}; k++) {
    if (float(k) < U[3].w && float(k) == i) { pin = U[4 + k].x; lane = U[4 + k].y; }
  }
  float joins = braid + (JOINED - braid) * min(1.0, 0.7 * abs(lane) + 0.3 * hash(i + 7.1));
  if (pin >= 0.0) joins = max(joins, min(JOINED, pin + JOIN * 1.5));
  float strand = mod(i, 3.0);
  float phase = hash(ribbon + 3.3) * TAU + hash(i + 3.3) * 0.6;
  float jitter = hash(i + 5.9) * 2.0 - 1.0;

  float a = 1.0 - u;
  vec2 p = a * a * p0 + 2.0 * a * u * p1 + u * u * p2;
  vec2 tangent = 2.0 * a * (p1 - p0) + 2.0 * u * (p2 - p1);
  vec2 n = vec2(-tangent.y, tangent.x) / max(length(tangent), 1.0);

  float radius = cord * (1.0 + SWELL * a);
  float width = radius + spread * (1.0 - TAPER * u) * (1.0 - smoothstep(GATHER, 1.0, u));
  float held = 1.0;
  if (pin >= 0.0) { float d = (u - pin) / 0.09; held = 1.0 - exp(-d * d); }
  float sway = sin(u * 4.5 + t * 0.35 + phase) * 0.6 + sin(u * 9.0 - t * 0.23 + phase * 1.7) * 0.4;
  float current = width * (lane + WAVE * held * sway);

  float spine = (2.0 * distance(p0, p2) + distance(p0, p1) + distance(p1, p2)) / 3.0;
  float turns = spine / (PITCH * cord * SWELL);
  float twist = turns * TAU * log((1.0 + SWELL) / (1.0 + SWELL * a)) - t * SPIN + strand * TAU / 3.0;
  float braided = radius * (sin(twist) + jitter * FRAY);
  float inBraid = smoothstep(joins - JOIN, joins, u);
  return vec4(p + n * mix(current, braided, inBraid), inBraid, cos(twist));
}

void main() {
  float i = float(gl_InstanceID);
  float s = float(gl_VertexID / 2);
  float u = along(s / SEGMENTS);
  float side = (gl_VertexID % 2) == 1 ? 1.0 : -1.0;
  vec4 here = place(i, u);
  // The direction toward the next point, or from the one before at the end.
  bool last = s >= SEGMENTS;
  vec2 other = place(i, along((last ? s - 1.0 : s + 1.0) / SEGMENTS)).xy;
  vec2 dir = last ? here.xy - other : other - here.xy;
  vec2 tangent = dir / max(length(dir), 1e-4);
  vec2 pos = here.xy + vec2(-tangent.y, tangent.x) * side * ${HALF_WIDTH};

  float pick = hash(i + 9.7) < 0.75 ? fract(ribbonOf(i) * 0.618034 + 0.05) : hash(i + 4.4);
  vec3 colour = mix(paint(pick), strandColour(int(mod(i, 3.0))), here.z);
  float brightness = i < U[3].w ? 1.0 : 0.22 + 0.78 * pow(hash(i + 2.2), 3.0);
  float facing = 0.15 + 0.85 * (0.5 + 0.5 * here.w);
  float shade = mix(1.0, facing * BRAID_LIGHT, here.z) * smoothstep(0.0, 0.06, u);

  vec2 res = U[0].xy;
  gl_Position = vec4(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  vColour = colour * brightness * shade * U[3].z;
  vAcross = side;
  vPulse = u * PULSES - U[0].w * PULSE_SPEED * PULSES + hash(i + 6.6) * (1.0 - here.z);
}
`

export const threadFragmentGlsl = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColour;
in float vAcross;
in float vPulse;
out vec4 colour;
${constants((name, value) => `const float ${name} = ${value};`)}
float pulse(float phase) {
  float crest = 0.5 + 0.5 * cos(TAU * phase);
  float crest4 = crest * crest * crest * crest;
  return 0.55 + PULSE_LIGHT * crest4 * crest4 * crest4;
}
void main() {
  float d = abs(vAcross) * ${HALF_WIDTH};
  colour = vec4(vColour * (exp(-(d * d) / 0.3) + 0.1 * exp(-(d * d) / 1.6)) * pulse(vPulse), 1.0);
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
  colour = vec4(U[11].rgb + mapped + dither, 1.0);
}
`
