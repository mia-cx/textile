import { MAX_LABELS, SEGMENTS, SHAPE } from './geometry'

/**
 * The thread field's shaders, in WGSL for WebGPU and GLSL ES 3.00 for WebGL2. Both run `position` from geometry.ts per
 * vertex, with its SHAPE: each thread is one instance, a triangle strip of SEGMENTS + 1 pairs of vertices widened
 * across the curve. Threads add their light into a half-float target, then a second pass tone-maps it over the ink.
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

/** A number as a shader float literal: `2` becomes `2.0`. */
const float = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

/** Half the strip's width, in CSS pixels: room for the thread's soft halo. */
const HALF_WIDTH = float(3.2)
/** How much light each thread gives inside the cord, where hundreds of them overlap. */
const CORD_LIGHT = float(0.28)

/** The constants both languages share, each written by `declare` in that language's syntax. */
const constants = (declare: (name: string, value: string) => string) =>
  [
    declare('TAU', '6.283185307'),
    declare('PITCH', float(SHAPE.pitch)),
    declare('OPENING', float(SHAPE.opening)),
    declare('WAVE', float(SHAPE.wave)),
    declare('FRAY', float(SHAPE.fray)),
    declare('RIBBONS', float(SHAPE.ribbons)),
    declare('RIBBON', float(SHAPE.ribbon)),
    declare('SEGMENTS', float(SEGMENTS)),
  ].join('\n')

const commonWgsl = /* wgsl */ `
@group(0) @binding(0) var<uniform> U: array<vec4f, ${UNIFORM_VEC4S}>;
${constants((name, value) => `const ${name} = ${value};`)}
fn hash(n: f32) -> f32 { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
fn ribbonOf(i: f32) -> f32 { return floor(hash(i + 1.3) * RIBBONS); }
fn paint(pick: f32) -> vec3f {
  if (pick < 0.48) { return U[8].rgb; }
  if (pick < 0.8) { return U[9].rgb; }
  return U[10].rgb;
}
`

export const threadWgsl = /* wgsl */ `${commonWgsl}
struct Out {
  @builtin(position) clip: vec4f,
  @location(0) colour: vec3f,
  @location(1) across: f32,
};

// xy: position in CSS px. z: how far into the cord (0 to 1). w: the strand's facing, -1 behind to 1 in front.
fn place(i: f32, u: f32) -> vec4f {
  let p0 = U[1].xy; let p1 = U[1].zw; let p2 = U[2].xy;
  let spread = U[2].z; let cord = U[2].w; let braid = U[3].x; let t = U[0].w;
  let ribbon = ribbonOf(i);
  let centre = (ribbon + 0.5) / RIBBONS * 2.0 - 1.0 + (hash(ribbon + 11.0) - 0.5) * 0.15;
  var lane = centre + (hash(i + 0.5) - 0.5) * RIBBON;
  var pin = -1.0;
  if (i < U[3].w) { let label = U[4u + u32(i)]; pin = label.x; lane = label.y; }
  let strand = i - 3.0 * floor(i / 3.0);
  let phase = hash(ribbon + 3.3) * TAU + hash(i + 3.3) * 0.6;
  let jitter = hash(i + 5.9) * 2.0 - 1.0;

  let a = 1.0 - u;
  let p = a * a * p0 + 2.0 * a * u * p1 + u * u * p2;
  let tangent = 2.0 * a * (p1 - p0) + 2.0 * u * (p2 - p1);
  let len = max(length(tangent), 1.0);
  let n = vec2f(-tangent.y, tangent.x) / len;

  let open = 1.0 - pow(smoothstep(0.0, braid, u), OPENING);
  var held = 1.0;
  if (pin >= 0.0) { let d = (u - pin) / 0.09; held = 1.0 - exp(-d * d); }
  let sway = sin(u * 4.5 + t * 0.35 + phase) * 0.6 + sin(u * 9.0 - t * 0.23 + phase * 1.7) * 0.4;
  let fan = lane * spread * open + spread * WAVE * open * held * sway;

  let twist = (u - braid) * len / (cord * PITCH) * TAU - t * 0.8 + strand * TAU / 3.0;
  let twisted = cord * (sin(twist) + jitter * FRAY);
  let inCord = smoothstep(braid - 0.12, braid + 0.03, u);
  let offset = mix(fan, twisted, inCord);
  return vec4f(p + n * offset, inCord, cos(twist));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let i = f32(ii);
  let du = 1.0 / SEGMENTS;
  let u = f32(vi / 2u) * du;
  let side = select(-1.0, 1.0, (vi & 1u) == 1u);
  let here = place(i, u);
  let ahead = place(i, min(u + du, 1.0));
  let behind = place(i, max(u - du, 0.0));
  let dir = ahead.xy - behind.xy;
  let tangent = dir / max(length(dir), 1e-4);
  let pos = here.xy + vec2f(-tangent.y, tangent.x) * side * ${HALF_WIDTH};

  // Most threads take their ribbon's colour in the fan; in the cord, each takes its strand's.
  var pick = hash(i + 4.4);
  if (hash(i + 9.7) < 0.75) { pick = hash(ribbonOf(i) * 1.7 + 9.7); }
  let strand = u32(i) % 3u;
  let colour = mix(paint(pick), U[8u + strand].rgb, here.z);
  var brightness = 0.22 + 0.78 * pow(hash(i + 2.2), 3.0);
  if (i < U[3].w) { brightness = 1.0; }
  // Strands in front of the cord catch the light; those behind fall into shadow. Many threads share the cord, so each
  // gives less light there.
  let facing = 0.35 + 0.65 * (0.5 + 0.5 * here.w);
  let shade = mix(1.0, facing * ${CORD_LIGHT}, here.z) * smoothstep(0.0, 0.06, u);

  var out: Out;
  let res = U[0].xy;
  out.clip = vec4f(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  out.colour = colour * brightness * shade * U[3].z;
  out.across = side;
  return out;
}

@fragment
fn fs(v: Out) -> @location(0) vec4f {
  let d = abs(v.across) * ${HALF_WIDTH};
  let core = exp(-(d * d) / 0.3);
  let halo = 0.1 * exp(-(d * d) / 3.2);
  return vec4f(v.colour * (core + halo), 1.0);
}
`

export const toneWgsl = /* wgsl */ `${commonWgsl}
@group(0) @binding(1) var light: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let xy = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) at: vec4f) -> @location(0) vec4f {
  let hdr = textureLoad(light, vec2i(at.xy), 0).rgb;
  let mapped = 1.0 - exp(-hdr * U[11].w);
  let dither = (hash(at.x * 0.137 + at.y * 1.173) - 0.5) / 255.0;
  return vec4f(U[11].rgb + mapped + dither, 1.0);
}
`

const commonGlsl = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 U[${UNIFORM_VEC4S}];
${constants((name, value) => `const float ${name} = ${value};`)}
float hash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
float ribbonOf(float i) { return floor(hash(i + 1.3) * RIBBONS); }
vec3 paint(float pick) { return pick < 0.48 ? U[8].rgb : pick < 0.8 ? U[9].rgb : U[10].rgb; }
`

export const threadVertexGlsl = /* glsl */ `${commonGlsl}
out vec3 vColour;
out float vAcross;

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
  float strand = mod(i, 3.0);
  float phase = hash(ribbon + 3.3) * TAU + hash(i + 3.3) * 0.6;
  float jitter = hash(i + 5.9) * 2.0 - 1.0;

  float a = 1.0 - u;
  vec2 p = a * a * p0 + 2.0 * a * u * p1 + u * u * p2;
  vec2 tangent = 2.0 * a * (p1 - p0) + 2.0 * u * (p2 - p1);
  float len = max(length(tangent), 1.0);
  vec2 n = vec2(-tangent.y, tangent.x) / len;

  float open = 1.0 - pow(smoothstep(0.0, braid, u), OPENING);
  float held = 1.0;
  if (pin >= 0.0) { float d = (u - pin) / 0.09; held = 1.0 - exp(-d * d); }
  float sway = sin(u * 4.5 + t * 0.35 + phase) * 0.6 + sin(u * 9.0 - t * 0.23 + phase * 1.7) * 0.4;
  float fan = lane * spread * open + spread * WAVE * open * held * sway;

  float twist = (u - braid) * len / (cord * PITCH) * TAU - t * 0.8 + strand * TAU / 3.0;
  float twisted = cord * (sin(twist) + jitter * FRAY);
  float inCord = smoothstep(braid - 0.12, braid + 0.03, u);
  return vec4(p + n * mix(fan, twisted, inCord), inCord, cos(twist));
}

void main() {
  float i = float(gl_InstanceID);
  float du = 1.0 / SEGMENTS;
  float u = float(gl_VertexID / 2) * du;
  float side = (gl_VertexID % 2) == 1 ? 1.0 : -1.0;
  vec4 here = place(i, u);
  vec2 dir = place(i, min(u + du, 1.0)).xy - place(i, max(u - du, 0.0)).xy;
  vec2 tangent = dir / max(length(dir), 1e-4);
  vec2 pos = here.xy + vec2(-tangent.y, tangent.x) * side * ${HALF_WIDTH};

  float pick = hash(i + 9.7) < 0.75 ? hash(ribbonOf(i) * 1.7 + 9.7) : hash(i + 4.4);
  vec3 colour = mix(paint(pick), U[8 + int(mod(i, 3.0))].rgb, here.z);
  float brightness = i < U[3].w ? 1.0 : 0.22 + 0.78 * pow(hash(i + 2.2), 3.0);
  float facing = 0.35 + 0.65 * (0.5 + 0.5 * here.w);
  float shade = mix(1.0, facing * ${CORD_LIGHT}, here.z) * smoothstep(0.0, 0.06, u);

  vec2 res = U[0].xy;
  gl_Position = vec4(pos.x / res.x * 2.0 - 1.0, 1.0 - pos.y / res.y * 2.0, 0.0, 1.0);
  vColour = colour * brightness * shade * U[3].z;
  vAcross = side;
}
`

export const threadFragmentGlsl = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColour;
in float vAcross;
out vec4 colour;
void main() {
  float d = abs(vAcross) * ${HALF_WIDTH};
  colour = vec4(vColour * (exp(-(d * d) / 0.3) + 0.1 * exp(-(d * d) / 3.2)), 1.0);
}
`

export const toneVertexGlsl = /* glsl */ `#version 300 es
void main() {
  vec2 xy = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(xy * 2.0 - 1.0, 0.0, 1.0);
}
`

export const toneFragmentGlsl = /* glsl */ `${commonGlsl}
uniform sampler2D light;
out vec4 colour;
void main() {
  vec3 hdr = texelFetch(light, ivec2(gl_FragCoord.xy), 0).rgb;
  vec3 mapped = 1.0 - exp(-hdr * U[11].w);
  float dither = (hash(gl_FragCoord.x * 0.137 + gl_FragCoord.y * 1.173) - 0.5) / 255.0;
  colour = vec4(U[11].rgb + mapped + dither, 1.0);
}
`
