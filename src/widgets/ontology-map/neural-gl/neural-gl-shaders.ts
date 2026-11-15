/**
 * Neural's two instanced programs, in CSS px under an orthographic camera (y down, depth `-(1 + u)`).
 * Output is premultiplied. Attribute layouts are `SPOT_FLOATS` and `RIBBON_FLOATS` in
 * `neural-gl-buffers.ts`; no term depends on time, every animated value arrives in the frame.
 */

/** A ribbon is tessellated into this many pieces along its curve. */
export const RIBBON_SEGMENTS = 24;

export const SPOT_VERTEX = /* glsl */ `
attribute vec4 aSpot;
attribute vec4 aBody;
attribute vec4 aGlow;
attribute vec4 aInner;
attribute vec4 aRing;
attribute vec4 aExtent;
varying vec2 vOffset;
varying vec4 vBody;
varying vec4 vGlow;
varying vec4 vInner;
varying vec4 vRing;
varying vec4 vSize;
varying float vRingHalf;
void main() {
  float reach = max(max(aSpot.z, aExtent.x), aExtent.z + aExtent.w * 0.5) + 1.0;
  vOffset = position.xy * reach;
  vBody = aBody;
  vGlow = aGlow;
  vInner = aInner;
  vRing = aRing;
  vSize = vec4(aSpot.z, aExtent.x, aExtent.y, aExtent.z);
  vRingHalf = aExtent.w * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aSpot.xy + vOffset, -(1.0 + aSpot.w), 1.0);
}
`;

export const SPOT_FRAGMENT = /* glsl */ `
varying vec2 vOffset;
varying vec4 vBody;
varying vec4 vGlow;
varying vec4 vInner;
varying vec4 vRing;
varying vec4 vSize;
varying float vRingHalf;
vec4 over(vec4 below, vec3 ink, float alpha) {
  return vec4(ink * alpha, alpha) + below * (1.0 - alpha);
}
void main() {
  float d = length(vOffset);
  float px = max(fwidth(d), 1e-4);
  vec4 color = vec4(0.0);
  if (vSize.y > 0.0) color = over(color, vGlow.rgb, vGlow.a * clamp(1.0 - d / vSize.y, 0.0, 1.0));
  color = over(color, vBody.rgb, vBody.a * clamp((vSize.x - d) / px + 0.5, 0.0, 1.0));
  color = over(color, vInner.rgb, vInner.a * clamp((vSize.z - d) / px + 0.5, 0.0, 1.0));
  color = over(color, vRing.rgb, vRing.a * clamp((vRingHalf - abs(d - vSize.w)) / px + 0.5, 0.0, 1.0));
  if (color.a < 0.002) discard;
  gl_FragColor = color;
}
`;

export const RIBBON_VERTEX = /* glsl */ `
attribute vec4 aCurve0;
attribute vec4 aCurve1;
attribute vec4 aWidth;
attribute vec4 aColor;
varying float vAcross;
varying float vHalfWidth;
varying vec4 vColor;
vec2 bezier(vec2 a, vec2 c, vec2 b, float t) {
  float s = 1.0 - t;
  return s * s * a + 2.0 * s * t * c + t * t * b;
}
void main() {
  vec2 a = aCurve0.xy;
  vec2 c = aCurve0.zw;
  vec2 b = aCurve1.xy;
  float t = mix(aCurve1.z, aCurve1.w, position.x);
  vec2 tangent = 2.0 * (1.0 - t) * (c - a) + 2.0 * t * (b - c);
  if (dot(tangent, tangent) < 1e-8) tangent = b - a;
  if (dot(tangent, tangent) < 1e-8) tangent = vec2(1.0, 0.0);
  vec2 normal = normalize(vec2(-tangent.y, tangent.x));
  float width = mix(aWidth.x, aWidth.y, sqrt(t));
  float reach = 0.5 * width + 1.0;
  vAcross = position.y * reach;
  vHalfWidth = 0.5 * width;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(bezier(a, c, b, t) + normal * vAcross, -(1.0 + aWidth.z), 1.0);
}
`;

export const RIBBON_FRAGMENT = /* glsl */ `
varying float vAcross;
varying float vHalfWidth;
varying vec4 vColor;
void main() {
  float px = max(fwidth(vAcross), 1e-4);
  float alpha = vColor.a * clamp((vHalfWidth - abs(vAcross)) / px + 0.5, 0.0, 1.0);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb * alpha, alpha);
}
`;
