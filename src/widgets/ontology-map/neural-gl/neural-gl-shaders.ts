import { DEPTH_FLOOR } from "./neural-gl-buffers";

/**
 * Neural's instanced programs, in CSS px under an orthographic camera (y down, depth `-(1 + u)`).
 * Output is premultiplied. Attribute layouts are the `*_FLOATS` records in `neural-gl-buffers.ts`;
 * no term depends on time, every animated value arrives in the frame.
 */

/** A ribbon is tessellated into this many pieces along its curve. */
export const RIBBON_SEGMENTS = 24;

const glsl = (value: number) => value.toFixed(4);
const unit = (x: number, y: number, z: number) => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length] as const;
};
const vec3 = (v: readonly [number, number, number]) => `vec3(${v.map(glsl).join(", ")})`;

/** The one key light: from the upper left (screen y runs down) and toward the viewer. */
const KEY_LIGHT = unit(-0.5, -0.55, 0.67);
/** The highlight sits halfway between the key light and the viewer. */
const HALF_VECTOR = unit(KEY_LIGHT[0], KEY_LIGHT[1], KEY_LIGHT[2] + 1);
/** The shadow side keeps this share of the ink, so a cell never turns into a hole on the ground. */
const AMBIENT = 0.32;
/** Wraps the terminator past the limb, so the light falls off softly across the sphere. */
const WRAP = 0.6;
/** The limb darkens by up to this share, which keeps two touching cells of one ink apart. */
const LIMB_DARKENING = 0.22;
/** A small soft highlight: its exponent sets its size, its gain its strength. */
const HIGHLIGHT_EXPONENT = 36;
const HIGHLIGHT_GAIN = 0.45;
/** A capability's nucleus darkens from this far inside its radius (in radii), so it reads as a soft core. */
const NUCLEUS_SOFTNESS = 0.14;
/** A cluster shell's ink rises toward its rim with this power of `1 - n.z`, and fades out over the outer share. */
const SHELL_RIM_POWER = 2.2;
const SHELL_RIM_GAIN = 2.6;
const SHELL_EDGE_FADE = 0.9;
/** How sharply a glow ribbon falls off across its width: `exp(-k (x / half)^2)`. */
const GLOW_FALLOFF = 2.2;

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

export const CELL_VERTEX = /* glsl */ `
attribute vec4 aCell;
attribute vec4 aInk;
attribute vec4 aCore;
varying vec2 vDisc;
varying vec4 vInk;
varying vec3 vCore;
varying float vDepth;
void main() {
  float radius = max(aCell.z, 1e-3);
  vec2 offset = position.xy * (radius + 1.0);
  vDisc = offset / radius;
  vInk = aInk;
  vCore = aCore.xyz;
  vDepth = aCell.w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aCell.xy + offset, -(1.0 + aCell.w), 1.0);
}
`;

/**
 * The sphere's normal is built from the disc coordinate (1 at the silhouette); one key light, an
 * ambient floor and a highlight shade it, depth darkens it toward DEPTH_FLOOR, and the frame's alpha
 * mixes it with the ground, so the cell is opaque against what lies behind it.
 */
export const CELL_FRAGMENT = /* glsl */ `
uniform vec3 uGround;
uniform vec3 uHighlight;
varying vec2 vDisc;
varying vec4 vInk;
varying vec3 vCore;
varying float vDepth;
void main() {
  float d = length(vDisc);
  float px = max(fwidth(d), 1e-4);
  float coverage = clamp((1.0 - d) / px + 0.5, 0.0, 1.0);
  if (coverage <= 0.0) discard;
  float inside = min(d, 1.0);
  vec3 n = vec3(vDisc / max(d, 1.0), sqrt(1.0 - inside * inside));
  float wrap = clamp((dot(n, ${vec3(KEY_LIGHT)}) + ${glsl(WRAP)}) / ${glsl(1 + WRAP)}, 0.0, 1.0);
  float diffuse = ${glsl(AMBIENT)} + ${glsl(1 - AMBIENT)} * wrap;
  float limb = 1.0 - ${glsl(LIMB_DARKENING)} * pow(1.0 - n.z, 3.0);
  vec3 body = vInk.rgb * diffuse * limb;
  if (vCore.x > 0.0) {
    float nucleus = 1.0 - smoothstep(vCore.x - ${glsl(NUCLEUS_SOFTNESS)}, vCore.x + px, d);
    body = mix(body, uGround, nucleus * vCore.y);
  }
  float highlight = pow(max(dot(n, ${vec3(HALF_VECTOR)}), 0.0), ${glsl(HIGHLIGHT_EXPONENT)}) * ${glsl(HIGHLIGHT_GAIN)};
  body += uHighlight * highlight * (1.0 - vCore.z);
  float depthShade = mix(1.0, ${glsl(DEPTH_FLOOR)}, clamp(vDepth, 0.0, 1.0));
  vec3 ink = mix(uGround, min(body * depthShade, vec3(1.0)), vInk.a);
  gl_FragColor = vec4(ink * coverage, coverage);
}
`;

export const SHELL_VERTEX = /* glsl */ `
attribute vec4 aShell;
attribute vec4 aColor;
varying vec2 vDisc;
varying vec4 vColor;
void main() {
  vec2 offset = position.xy * aShell.z;
  vDisc = position.xy;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aShell.xy + offset, -3.0, 1.0);
}
`;

export const SHELL_FRAGMENT = /* glsl */ `
varying vec2 vDisc;
varying vec4 vColor;
void main() {
  float d = length(vDisc);
  if (d >= 1.0) discard;
  float nz = sqrt(1.0 - d * d);
  float rim = min(1.0, pow(1.0 - nz, ${glsl(SHELL_RIM_POWER)}) * ${glsl(SHELL_RIM_GAIN)}) * (1.0 - smoothstep(${glsl(SHELL_EDGE_FADE)}, 1.0, d));
  float alpha = vColor.a * rim;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb * alpha, alpha);
}
`;

export const RIBBON_VERTEX = /* glsl */ `
attribute vec4 aCurve0;
attribute vec4 aCurve1;
attribute vec4 aWidth;
attribute vec4 aColor;
varying float vAcross;
varying float vHalfWidth;
varying float vGlow;
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
  vGlow = aWidth.w;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(bezier(a, c, b, t) + normal * vAcross, -(1.0 + aWidth.z), 1.0);
}
`;

export const RIBBON_FRAGMENT = /* glsl */ `
varying float vAcross;
varying float vHalfWidth;
varying float vGlow;
varying vec4 vColor;
void main() {
  float across = abs(vAcross);
  float px = max(fwidth(vAcross), 1e-4);
  float share = across / max(vHalfWidth, 1e-4);
  float profile = vGlow > 0.5 ? exp(-${glsl(GLOW_FALLOFF)} * share * share) : clamp((vHalfWidth - across) / px + 0.5, 0.0, 1.0);
  float alpha = vColor.a * profile;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor.rgb * alpha, alpha);
}
`;
