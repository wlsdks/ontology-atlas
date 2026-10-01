const SIGNAL_SEGMENTS = 24;
export const SIGNAL_VERTICES = (SIGNAL_SEGMENTS + 1) * 2;
export const BLOOM_VERTICES = 4;
export const INK_SLOTS = 4;

export const SIGNAL_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec4 i_departControl;
layout(location = 1) in vec4 i_arrivalSpan;
layout(location = 2) in vec4 i_headStyle;
uniform vec2 u_viewport;
uniform float u_halo;
out float v_across;
out float v_behind;
out float v_strength;
flat out int v_ink;
const float SEGMENTS = ${SIGNAL_SEGMENTS}.0;
void main() {
  vec2 a = i_departControl.xy;
  vec2 c = i_departControl.zw;
  vec2 b = i_arrivalSpan.xy;
  float t = mix(i_arrivalSpan.z, i_arrivalSpan.w, float(gl_VertexID / 2) / SEGMENTS);
  float u = 1.0 - t;
  vec2 point = u * u * a + 2.0 * u * t * c + t * t * b;
  vec2 tangent = 2.0 * u * (c - a) + 2.0 * t * (b - c);
  float tangentLength = length(tangent);
  vec2 normal = tangentLength > 1e-5 ? vec2(-tangent.y, tangent.x) / tangentLength : vec2(0.0, 1.0);
  float side = float(gl_VertexID % 2) * 2.0 - 1.0;
  float halfWidth = 3.0 * u_halo;
  vec2 position = point + normal * side * halfWidth;
  v_across = side * halfWidth;
  v_behind = (i_headStyle.x - t) / max(i_headStyle.y, 1e-4);
  v_strength = i_headStyle.z;
  v_ink = int(i_headStyle.w);
  gl_Position = vec4(position.x / u_viewport.x * 2.0 - 1.0, 1.0 - position.y / u_viewport.y * 2.0, 0.0, 1.0);
}
`;

export const SIGNAL_FRAGMENT = `#version 300 es
precision highp float;
in float v_across;
in float v_behind;
in float v_strength;
flat in int v_ink;
uniform vec3 u_inks[${INK_SLOTS}];
uniform float u_core;
uniform float u_halo;
out vec4 color;
void main() {
  float across2 = v_across * v_across;
  float across = exp(-across2 / (2.0 * u_core * u_core)) + 0.35 * exp(-across2 / (2.0 * u_halo * u_halo));
  float behind = max(v_behind, 0.0);
  float along = exp(-3.0 * behind) * clamp((1.0 - behind) * 4.0, 0.0, 1.0);
  float intensity = v_strength * across * along;
  color = vec4(u_inks[v_ink] * intensity, intensity);
}
`;

export const BLOOM_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec4 i_centerSigma;
layout(location = 1) in vec4 i_style;
uniform vec2 u_viewport;
out vec2 v_offset;
out float v_sigma;
out float v_haloSigma;
out float v_haloWeight;
out float v_strength;
flat out int v_ink;
void main() {
  vec2 corner = vec2(float(gl_VertexID % 2), float(gl_VertexID / 2)) * 2.0 - 1.0;
  float radius = 3.0 * max(i_centerSigma.z, i_centerSigma.w);
  vec2 position = i_centerSigma.xy + corner * radius;
  v_offset = corner * radius;
  v_sigma = i_centerSigma.z;
  v_haloSigma = i_centerSigma.w;
  v_haloWeight = i_style.x;
  v_strength = i_style.y;
  v_ink = int(i_style.z);
  gl_Position = vec4(position.x / u_viewport.x * 2.0 - 1.0, 1.0 - position.y / u_viewport.y * 2.0, 0.0, 1.0);
}
`;

export const BLOOM_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_offset;
in float v_sigma;
in float v_haloSigma;
in float v_haloWeight;
in float v_strength;
flat in int v_ink;
uniform vec3 u_inks[${INK_SLOTS}];
out vec4 color;
void main() {
  float r2 = dot(v_offset, v_offset);
  float intensity = v_strength * (exp(-r2 / (2.0 * v_sigma * v_sigma)) + v_haloWeight * exp(-r2 / (2.0 * v_haloSigma * v_haloSigma)));
  color = vec4(u_inks[v_ink] * intensity, intensity);
}
`;
