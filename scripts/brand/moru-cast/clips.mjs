// Every prototype clip. An interaction is beats over the shared poses plus props and bubbles.
import { b, hop, timing, timeline } from './scene.mjs';
import { PROPS, FX } from './art.mjs';
import { px, KEY } from './engine.mjs';
import { TOOLS, HOOK_WRENCH, BOOK_STACK } from './tools.mjs';

const FLOORY = 100;
const tw = (f, a, z, v0, v1) => f <= a ? v0 : f >= z ? v1 : v0 + (v1 - v0) * (1 - (1 - (f - a) / (z - a)) ** 2);
const within = (f, a, z) => f >= a && f <= z;
/** A prop that rises from the floor line at `inAt` and sinks back at `outAt`, as the catalogue's props do. */
const risen = (api, s, x, inAt, outAt, len = 3) => {
  const f = api.f, t = f < inAt ? 0 : f < inAt + len ? (f - inAt + 1) / (len + 1) : f < outAt ? 1 : f < outAt + len ? 1 - (f - outAt + 1) / (len + 1) : 0;
  if (t > 0) api.put(s, x, FLOORY - s.h * t, { clipY: FLOORY }); return t;
};
const solo = (beats, costume) => [{ name: 'm', ox: 0, beats, costume }];

// ============ emotions ============
const E = (id, title, beats, extra = {}) => ({ id: 'feel-' + id, group: 'emotions', frames: 24, title, actors: solo(beats), ...extra });
const FEEL_HAPPY = E('happy', 'Happy: two light hops, flippers flapping', [b(1, 'antic', 'blink'), ...hop(2, [3, 6, 7, 6, 3, 0], 'rest', 'cheer', { ly: -4, ry: -4, lx: -3, rx: 3 }), b(8, 'antic', 'happy'), ...hop(9, [3, 6, 8, 6, 3, 0], 'rest', 'cheer', { ly: -5, ry: -5, lx: -3, rx: 3 }),
  b(15, 'antic', 'happy'), b(17, 'perk', 'happy', { tail: 3 }), b(19, 'rest', 'happy', { tail: 1 }), b(21, 'rest', 'glad'), b(22, 'rest', 'blink')], {
  ms: timing(24, 80, { 1: 140, 8: 110, 15: 130, 17: 220, 19: 200, 21: 160 }),
  over: (f, api) => { if (within(f, 4, 6) || within(f, 11, 13)) { const big = f === 5 || f === 12; api.put(big ? FX.sparkBig : FX.spark, 36 + (big ? 0 : 2), 40 + (big ? 0 : 2)); api.put(big ? FX.sparkBig : FX.spark, 112, 30 + (big ? 0 : 2)); } } });
const FEEL_PROUD = E('proud', 'Proud: chest up, chin up, one flipper on the chest', [b(1, 'antic', 'blink'), b(3, 'perk', 'smile'), b(5, 'tall+chest', 'proud', { fy: -5 }), b(6, 'tall+chest', 'proud', { fy: -6, tail: 4 }), b(11, 'tall+chest', 'proud', { fy: -5, tail: 2 }), b(12, 'tall+chest', 'wink', { fy: -5, tail: 4 }),
  b(15, 'tall+chest', 'proud', { fy: -5, tail: 2 }), b(17, 'perk', 'proud', { rx: -6, ry: -4 }), b(19, 'rest', 'happy'), b(21, 'antic', 'glad'), b(22, 'rest', 'blink')], {
  ms: timing(24, 110, { 6: 360, 11: 160, 12: 300, 15: 200 }),
  over: (f, api) => { if (within(f, 6, 14)) api.put([FX.spark, FX.sparkBig, FX.sparkBig, FX.spark][(f - 6) % 4] ?? FX.spark, 106 + ((f - 6) % 4 === 0 || (f - 6) % 4 === 3 ? 2 : 0), 32 + ((f - 6) % 4 === 0 || (f - 6) % 4 === 3 ? 2 : 0)); } });
const FEEL_SLEEPY = E('sleepy', 'Sleepy: heavy lids, a long yawn behind a flipper, a droop', [b(2, 'rest', 'sleepy', { fy: 1 }), b(4, 'rest', 'sleepy', { fy: 3, sq: 1 }), b(6, 'perk', 'blink', { fy: -1, rx: -8, ry: -10 }), b(8, 'tall+mouth', 'yawn', { fy: -3 }), b(12, 'tall+mouth', 'yawn', { fy: -4, tail: 2 }),
  b(14, 'perk', 'blink', { rx: -10, ry: -10 }), b(16, 'slump', 'sleepy', { fy: 4 }), b(19, 'slump', 'asleep', { fy: 5 }), b(20, 'antic', 'sleepy', { fy: 2 }), b(22, 'rest', 'blink')], {
  ms: timing(24, 150, { 4: 260, 8: 200, 12: 320, 16: 220, 19: 420, 20: 180 }),
  over: (f, api) => { if (within(f, 17, 20)) api.put(f < 19 ? FX.z : FX.zBig, 108 + (f - 17) * 2, 44 - (f - 17) * 4); } });
const START = { lx: -6, ly: -8, rx: 6, ry: -8, tail: 4 };
const FEEL_SURPRISED = E('surprised', 'Surprised: a jump clear off the floor, a hard landing, a shiver, a look both ways', [b(1, 'crouch', 'blink'), b(2, 'tall', 'wow', { ...START, lift: 4 }, 'linear'), b(3, 'tall', 'wow', { ...START, lift: 8 }, 'linear'), b(4, 'perk', 'wow', { ...START, lift: 11 }, 'linear'), b(5, 'rest', 'wow', { ...START, lift: 12, tail: 2 }, 'linear'), b(6, 'perk', 'wow', { ...START, lift: 9, tail: 5 }, 'linear'), b(7, 'tall', 'wow', { ...START, lift: 5, tail: 5 }, 'linear'),
  b(8, 'crouch', 'wow', { tail: -2 }, 'linear'), b(9, 'tall', 'wow', { tail: 4, lx: -4, ly: -6, rx: 4, ry: -6 }, 'linear'), b(10, 'perk', 'wide', { x: -1, tail: 2, fy: -3 }, 'linear'), b(11, 'antic', 'wow', { x: 1, tail: 4 }, 'linear'), b(12, 'perk+lookL', 'wide'), b(14, 'tall+lookL', 'wide', { gx: -2, tail: 4 }), b(15, 'perk+lookL', 'wide'), b(17, 'perk+lookR', 'wide'), b(18, 'tall+lookR', 'oh', { gx: 2, tail: 4 }), b(19, 'perk+lookR', 'oh'), b(21, 'rest', 'blink'), b(22, 'rest')], {
  ms: timing(24, 90, { 1: 90, 2: 60, 3: 60, 4: 70, 5: 110, 6: 70, 7: 60, 8: 120, 9: 140, 10: 100, 11: 100, 12: 160, 15: 240, 17: 160, 19: 240 }),
  over: (f, api) => { if (within(f, 2, 11)) api.put(FX.bang, 114, f < 6 ? 28 - f * 2 : 18); if (within(f, 2, 7)) { api.put(FX.dash, 30, 46 - (f % 2) * 2); api.put(FX.dash, 114, 52 - (f % 2) * 2); } if (f === 8) { api.put(FX.dust, 36, 94); api.put(FX.dust, 106, 94); } } });
const FEEL_WORRIED = E('worried', 'Worried: brows up, flippers wrung, a bead of sweat', [b(2, 'rest', 'worry', { fy: 1 }), b(4, 'antic+paws', 'worry', { lx: 8, rx: -8 }), b(6, 'antic+paws+lookL', 'worry', { lx: 10, rx: -6 }), b(9, 'antic+paws+lookL', 'worryTalk', { lx: 6, rx: -10 }), b(11, 'antic+paws+lookR', 'worry', { lx: 10, rx: -6 }),
  b(14, 'antic+paws+lookR', 'worryTalk', { lx: 6, rx: -10 }), b(16, 'antic+paws', 'worry', { lx: 10, rx: -6, fy: 2 }), b(18, 'antic+paws', 'sad', { lx: 8, rx: -8, fy: 3 }), b(19, 'antic+paws', 'sad', { lx: 8, rx: -8, ly: -5, ry: -5, fy: 2 }), b(20, 'antic', 'worry'), b(22, 'rest', 'blink')], {
  ms: timing(24, 130, { 4: 200, 6: 220, 9: 220, 11: 200, 14: 220, 18: 320 }),
  over: (f, api) => { if (within(f, 5, 10)) api.put(f < 7 ? FX.dropSmall : FX.drop, 114, 46 + (f - 5) * 4); if (within(f, 13, 18)) api.put(f < 15 ? FX.dropSmall : FX.drop, 114, 46 + (f - 13) * 4); } });
const FUME = { brow: 'angry', eyes: 'half', mouth: 'frown' }, FUME_OPEN = { brow: 'angry', eyes: 'half', mouth: 'open' };
const FEEL_FRUSTRATED = E('frustrated', 'Frustrated: heavy brows, steam puffing off both sides, two thumps of a flipper, then a sulk', [b(1, 'antic', FUME), b(3, 'antic', FUME, { fy: 2 }), b(4, 'antic', FUME, { rx: 2, ry: -10, x: -1 }), b(5, 'antic', FUME_OPEN, { rx: 2, ry: 0 }), b(6, 'antic', FUME, { x: 1 }), b(7, 'antic', FUME, { rx: 2, ry: -10 }), b(8, 'antic', FUME_OPEN, { rx: 2, ry: 0, x: -1 }), b(9, 'antic', FUME), b(10, 'antic', FUME, { x: 1 }), b(11, 'antic', FUME),
  b(13, 'perk', FUME, { fy: -2 }), b(15, 'slump', 'sulk', { fy: 3 }), b(18, 'slump', 'sulk', { fy: 4 }), b(20, 'antic', 'sleepy'), b(22, 'rest', 'blink')], {
  ms: timing(24, 90, { 3: 220, 5: 120, 8: 120, 10: 200, 13: 240, 15: 200, 18: 360 }),
  over: (f, api) => { if (within(f, 2, 13)) { const up = (f - 2) % 4, s = up < 2 ? FX.huff : FX.huffSmall; if ((f - 2) % 8 < 4) api.put(s, 108 + up * 2, 36 - up * 4); else api.put(s, 34 - up * 2, 40 - up * 4, { flip: true }); } if (f === 5 || f === 8) api.put(FX.dust, 110, 88); if (within(f, 14, 17)) api.put(f < 16 ? FX.puffSmall : FX.puff, 110 + (f - 14) * 2, 72 - (f - 14) * 2); } });

// ============ locomotion: the cell holds the body; `travel` is how far the room has carried the cell ============
const cum = steps => steps.reduce((out, s) => [...out, (out.at(-1) ?? 0) + s], []);
const BOUND_ARC = [3, 6, 7, 6, 3, 0];
const BOUND = { id: 'bound', group: 'moves', frames: 24, title: 'Bound: three low hops along the floor', bounding: true,
  actors: solo([b(1, 'antic', 'rest', { fx: 2 }), ...hop(2, BOUND_ARC, 'rest', 'rest', { fx: 3, lx: -3, rx: 4 }), ...hop(8, BOUND_ARC, 'rest', 'glad', { fx: 3, lx: -3, rx: 4 }), ...hop(14, BOUND_ARC, 'rest', 'rest', { fx: 3, lx: -3, rx: 4 }), b(20, 'antic', 'blink', { fx: 2 }), b(22, 'rest')]),
  ms: timing(24, 70, { 0: 110, 1: 110, 7: 100, 13: 100, 19: 110, 20: 120, 23: 110 }),
  travel: cum([0, 0, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 1, 0, 0, 0]),
  over: (f, api) => { if ([7, 13, 19].includes(f)) api.put(FX.dust, 40, 94); } };
const BELLY_SLIDE = { id: 'belly-slide', group: 'moves', frames: 24, title: 'Belly slide: a flop, a long glide, a push back up', bounding: true,
  actors: solo([b(1, 'antic', 'blink'), b(2, 'perk', 'cheer', { lift: 3, fx: 2 }), b(3, 'rest', 'cheer', { lift: 2, sq: 1, wd: 1, fx: 3 }), b(4, 'rest', 'glad', { sq: 3, wd: 3, fx: 3, fy: 1, lx: -3, rx: 5 }), b(5, 'rest', 'glad', { sq: 5, wd: 5, fx: 4, fy: 2, lx: -5, rx: 7 }), b(6, 'flat', 'happy', { fx: 4, lx: -6, rx: 8, tail: 2 }),
    b(10, 'flat', 'happy', { fx: 4, lx: -6, rx: 8, tail: 3 }), b(14, 'flat', 'happy', { fx: 3, lx: -6, rx: 8, tail: 1 }), b(16, 'flat', 'glad', { fx: 2, lx: -4, rx: 6 }), b(17, 'rest', 'glad', { sq: 5, wd: 5, fy: 2, lx: -3, rx: 4 }), b(18, 'rest', 'rest', { sq: 3, wd: 3, fy: 1 }), b(19, 'rest', 'rest', { sq: 1, wd: 1 }), b(20, 'perk'), b(22, 'rest', 'blink')]),
  ms: timing(24, 80, { 0: 110, 1: 120, 16: 120, 17: 110, 18: 110, 19: 110, 20: 140, 23: 110 }),
  travel: cum([0, 0, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0]),
  over: (f, api) => { if (within(f, 6, 14)) { api.put(FX.swish, 6 + (f % 2) * 2, 80); if (f % 2) api.put(FX.dash, 10, 92); } } };
// Tiptoe: drawn up as tall as the body goes, one flipper lifted high and held, then a quick short step.
const UP = { sq: -8, wd: -3, fy: -4, tail: 5, gx: 2 }, DOWN = { sq: -3, wd: -1, fy: -1, tail: 2, gx: 2 }, SLY = { eyes: 'dot', mouth: 'flat' };
// One sneaking step: the leading flipper goes up and forward and hangs there, comes down, the body sinks onto it and draws up again.
const STEP = (at, side) => { const hi = side ? { rx: 12, ry: -24 } : { lx: 9, ly: -16 }, mid = side ? { rx: 13, ry: -12 } : { lx: 12, ly: -9 }, lo = side ? { rx: 12, ry: -2 } : { lx: 12, ly: -2 };
  return [b(at, 'rest', SLY, { ...UP, ...hi, fx: 2 }), b(at + 1, 'rest', SLY, { ...UP, ...hi, fx: 3 }), b(at + 2, 'rest', SLY, { ...UP, ...mid, fx: 3 }), b(at + 3, 'rest', { eyes: 'dot', mouth: 'o' }, { ...DOWN, ...lo, sq: 0, fx: 2 }), b(at + 4, 'rest', SLY, { ...DOWN, ...(side ? { rx: 5 } : { lx: 5 }) })]; };
const TIPTOE = { id: 'tiptoe', group: 'moves', frames: 36, title: 'Tiptoe: a hush, then drawn up tall, a flipper held high, a slow placed step, a freeze and a glance back',
  actors: solo([b(1, 'antic', 'blink'), b(2, 'perk+mouth', SLY, { gx: 2 }), b(4, 'perk+mouth', { eyes: 'wide', mouth: 'o' }, { gx: 3, fx: 3 }), b(5, 'rest', SLY, UP), ...STEP(6, 1), ...STEP(11, 0), b(16, 'rest', 'wide', { ...UP, fx: -8, gx: -2 }), b(18, 'rest', 'wide', { ...UP, fx: -8, gx: -2, tail: 3 }), b(19, 'rest', SLY, UP), ...STEP(20, 1), ...STEP(25, 0), b(30, 'rest', SLY, { ...UP, sq: -6, wd: -2, fy: -3 }), b(32, 'rest', 'dot', DOWN), b(33, 'perk', 'oh'), b(34, 'rest', 'blink')]),
  ms: timing(36, 90, { 0: 110, 3: 260, 4: 200, 7: 300, 12: 300, 17: 420, 21: 300, 26: 300, 31: 160, 35: 110 }),
  travel: cum(Array.from({ length: 36 }, (_, f) => [8, 9, 10, 13, 14, 15, 22, 23, 24, 27, 28, 29].includes(f) ? 2 : 0)),
  over: (f, api) => { if ([9, 14, 23, 28].includes(f)) api.put(FX.tick, 118, 96, { free: true }); if (within(f, 16, 18)) api.put(FX.bang, 112, 34); } };

// Run: a fast low galumph, stretched out and gathered in, flippers paddling, dust behind.
const STRIDE = [{ sq: 3, wd: 4, lift: 0, fx: 4, lx: -7, rx: 9, tail: -1 }, { sq: 0, wd: 1, lift: 3, fx: 4, lx: -3, rx: 4, tail: 2 }, { sq: -2, wd: -2, lift: 4, fx: 3, lx: 4, rx: -3, tail: 3 }, { sq: 0, wd: 0, lift: 2, fx: 4, lx: 0, rx: 3, tail: 1 }];
const KEEN = { brow: 'stern', mouth: 'open' };
const RUN = { id: 'run', group: 'moves', frames: 24, title: 'Run: a fast low galumph, stretched and gathered, with a skid to stop', bounding: true,
  actors: solo([b(1, 'antic', 'stern', { fx: -2 }), b(2, 'crouch', 'stern', { fx: 2 }), ...Array.from({ length: 16 }, (_, i) => b(3 + i, 'rest', KEEN, STRIDE[i % 4], 'linear')), b(19, 'crouch', 'effort', { fx: -3, tail: 3 }), b(20, 'antic', 'effort', { fx: -2, tail: 2 }), b(21, 'perk', 'glad'), b(22, 'rest', 'blink')]),
  ms: timing(24, 65, { 0: 110, 1: 120, 2: 100, 19: 130, 20: 130, 21: 130, 23: 110 }),
  travel: cum([0, 0, 1, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 1, 0, 0]),
  over: (f, api) => { if (within(f, 3, 18)) { api.put(FX.dash, 4 + (f % 2) * 4, 70 + (f % 3) * 8); if ((f - 3) % 4 === 0) api.put(FX.dust, 30, 94); } if (within(f, 19, 20)) api.put(FX.dust, 112, 94); } };

// Roll: a high tucked forward tumble, sixteen drawn steps of a full turn with the tail swinging round, then a dizzy wobble.
// The height is what lets the tail pass under the body: at three quarters of the turn it points straight down.
const TUCK = { sq: -3, wd: -5, lx: 6, rx: -6, tail: -2 }, SHUT = { eyes: 'tight', mouth: 'flat' };
// The heights are what the cell allows: enough for the front to clear the floor as it tips, low while the tail points up, high while it points down.
const TURN_LIFT = [12, 15, 13, 10, 10, 15, 20, 23, 23, 24, 24, 25, 24, 21, 18, 14], TURN_X = [0, 0, 0, -2, -4, -6, -6, -6, -6, -6, -4, -2, 0, 0, 0, 0], FALL = [10, 6, 3, 1];
const ROLL = { id: 'roll', group: 'moves', frames: 36, title: 'Roll: a high forward tumble, the tail swinging round, then a dizzy wobble', bounding: true,
  actors: solo([b(1, 'antic', 'blink'), b(2, 'crouch', SHUT), b(3, 'rest', SHUT, { ...TUCK, lift: 5 }, 'linear'), b(4, 'rest', SHUT, { ...TUCK, lift: 9 }, 'linear'), ...TURN_LIFT.map((lift, i) => b(5 + i, 'rest', { ...SHUT, angle: (i + 1) * 22.5 }, { ...TUCK, lift, x: TURN_X[i] }, 'linear')), ...FALL.map((lift, i) => b(21 + i, 'rest', 'wow', { lift, tail: 3, lx: -4, ly: -6, rx: 4, ry: -6 }, 'linear')),
    b(25, 'crouch', 'dot'), b(26, 'rest', 'dot', { x: 1, fx: 2 }), b(28, 'rest', 'dot', { x: -1, fx: -2 }), b(30, 'rest', 'dot', { x: 1, fx: 1 }), b(32, 'perk', 'oh'), b(34, 'antic', 'glad'), b(35, 'rest', 'blink')]),
  ms: timing(36, 70, { 0: 110, 1: 120, 2: 110, 25: 140, 27: 160, 29: 160, 31: 160, 32: 200, 35: 110 }),
  travel: cum([0, 0, 1, ...Array(22).fill(3), 2, 1, ...Array(9).fill(0)]),
  over: (f, api) => { if (f === 25) api.put(FX.dust, 40, 93); if (within(f, 26, 31)) { const p = [[60, 34], [84, 30], [100, 36]][(f - 26) % 3]; api.put(FX.spark, p[0], p[1]); } } };

// Climb: facing the viewer on a ladder, a flipper up, a pull, the other flipper up, a pull; the room carries the cell upward.
const RAIL = 'mm        mm', RUNG = 'mmmmmmmmmmmm';
const LADDER = px(Array.from({ length: 40 }, (_, r) => r % 4 === 0 ? RUNG : RAIL), { unit: 2, key: KEY });
const SHELF = px(['ssssssssssssssssssssssssssssssssssssssssssssssssss', 'ssssssssssssssssssssssssssssssssssssssssssssssssss', 'gggggggggggggggggggggggggggggggggggggggggggggggggg', ...Array(13).fill('  gg                                          gg  ')], { unit: 2, key: KEY });
const RISE = 32, FRONT = { front: true, eyes: 'open' }, ON = { fx: -12 };
const PULL = at => [b(at, 'rest', FRONT, { ...ON, lx: -4, ly: -26, rx: 6, ry: -8, sq: -2 }, 'linear'), b(at + 1, 'rest', { ...FRONT, eyes: 'line' }, { ...ON, lx: -4, ly: -16, rx: 6, ry: -14, sq: 1, fy: 1 }, 'linear'), b(at + 2, 'rest', FRONT, { ...ON, lx: -4, ly: -8, rx: 6, ry: -26, sq: -2 }, 'linear'), b(at + 3, 'rest', { ...FRONT, eyes: 'line' }, { ...ON, lx: -4, ly: -14, rx: 6, ry: -16, sq: 1, fy: 1 }, 'linear')];
const CLIMB_UP = cum(Array.from({ length: 32 }, (_, f) => f >= 6 && f < 22 ? 2 : 0));
const CLIMB = { id: 'climb', group: 'moves', frames: 32, title: 'Climb: up a ladder to a shelf, flipper over flipper', bounding: true,
  actors: solo([b(1, 'antic', 'blink'), b(2, 'rest', 'rest', { lift: 2, fx: -6 }), b(3, 'rest', FRONT, { ...ON, lift: 2 }), b(4, 'rest', FRONT, { ...ON, lx: -4, ly: -14, rx: 6, ry: -14 }), b(5, 'rest', FRONT, { ...ON, lx: -4, ly: -20, rx: 6, ry: -20, sq: 2 }), ...PULL(6), ...PULL(10), ...PULL(14), ...PULL(18),
    b(22, 'rest', { front: true, eyes: 'happy' }, { ...ON, lx: -6, ly: -24, rx: 8, ry: -24, sq: -2 }), b(23, 'rest', { front: true, eyes: 'happy', mouth: 'open' }, { ...ON, lx: -6, ly: -12, rx: 9, ry: -26, sq: -1 }), b(24, 'rest', { front: true, eyes: 'happy', mouth: 'open' }, { ...ON, lx: -6, ly: -8, rx: 6, ry: -22, sq: 1 }), b(25, 'rest', { front: true, eyes: 'happy' }, { ...ON, lx: -4, ly: -6, rx: 8, ry: -26 }), b(26, 'rest', 'rest', { lift: 2, fx: -6 }), b(27, 'perk', 'proud'), b(29, 'antic', 'glad'), b(30, 'rest', 'blink')]),
  ms: timing(32, 100, { 0: 110, 5: 200, 22: 200, 24: 200, 27: 300, 31: 110 }),
  travel: Array(32).fill(0), travelY: CLIMB_UP,
  scenery: [{ s: SHELF, x: 22, y: 100 - RISE }, { s: LADDER, x: 60, y: 20 }],
  // In the cell the ladder stops at the belly's lower edge, so no rail end shows between the lifted flippers; the room draws the whole ladder.
  under: (f, api) => { for (const { s, x, y } of CLIMB.scenery) api.put(s, x, y + CLIMB_UP[f], { clipY: s === LADDER ? 96 : 100 }); } };

const FLAP = f => ({ wings: [1, 0, 2, 0][f % 4] });
const FLUTTER = { id: 'flutter', group: 'moves', frames: 24, title: 'Flutter (Dragon Moru only): a short hover on small wings', bounding: true,
  actors: [{ name: 'm', ox: 0, costume: 'dragon', beats: [b(1, 'antic', { eyes: 'line', wings: 2 }), b(2, 'antic', { wings: 1 }, { sq: 3 }), b(3, 'tall', { wings: 2, mouth: 'open' }, { lift: 3 }), b(4, 'perk', { wings: 1 }, { lift: 6 }), b(5, 'perk', { wings: 0 }, { lift: 9 }), b(6, 'rest', { wings: 2 }, { lift: 10, tail: 2 }),
    ...Array.from({ length: 10 }, (_, i) => b(7 + i, 'rest', { ...FLAP(i), eyes: i > 5 ? 'happy' : 'open' }, { lift: 11 + [0, 1, 1, 0, -1, -1][i % 6], tail: 2 + (i % 2), fx: 2 }, 'linear')),
    b(17, 'rest', { wings: 1 }, { lift: 8 }), b(18, 'rest', { wings: 2 }, { lift: 5 }), b(19, 'perk', { wings: 1 }, { lift: 2 }), b(20, 'crouch', { eyes: 'line', wings: 2 }), b(21, 'antic', { wings: 0 }), b(22, 'rest', { eyes: 'line' })] }],
  ms: timing(24, 80, { 0: 110, 1: 130, 2: 110, 20: 130, 21: 110, 23: 110 }),
  travel: cum([0, 0, 0, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 0, 0, 0, 0]) };

// ============ interactions ============
const A = (beats, o = {}) => ({ name: 'a', ox: 0, beats, ...o });
const B = (beats, o = {}) => ({ name: 'b', ox: 104, flip: true, beats, ...o });
const SHRUG = { lx: -8, ly: -14, rx: 8, ry: -14, fy: -1 };
const HOP1 = [3, 6, 7, 6, 3, 0];

const IDEA_SHRUG_SULK = { id: 'idea-shrug-sulk', group: 'talk', W: 240, frames: 40, title: 'An idea, a shrug, a sulk',
  ms: timing(40, 110, { 5: 320, 16: 360, 20: 160, 28: 420, 33: 300 }),
  actors: [A([b(1, 'antic', 'blink'), b(3, 'perk+lookR', 'talk', { tail: 3 }), b(5, 'tall+lookR+pawR', 'cheer', { tail: 4 }), b(9, 'perk+lookR+pawR', 'happy', { tail: 2 }), b(12, 'perk+lookR', 'happy', { tail: 3 }), b(17, 'perk+lookR', 'rest'), b(18, 'lookR', 'dot'), b(20, 'lookR', 'dot'), b(22, 'slump+lookR', 'sulk'), b(25, 'slump+away', 'sulk', { tail: -3 }), b(34, 'slump+away', 'sulk', { tail: -3 }), b(36, 'antic', 'sleepy'), b(38, 'rest', 'blink')]),
    B([b(4, 'lookR', 'rest'), b(8, 'lookR+lookUp', 'rest'), b(12, 'lookR', 'blink'), b(14, 'lookR+perk', 'shrug', SHRUG), b(16, 'lookR', 'shrug', { ...SHRUG, ly: -12, ry: -12, fy: 1 }), b(21, 'lookR', 'shrug', { ...SHRUG, ly: -12, ry: -12, fy: 1 }), b(23, 'lookR', 'rest'), b(27, 'lookR', 'wide'), b(29, 'lookR', 'worry'), b(34, 'lookR+lookDown', 'worry'), b(36, 'rest', 'blink')])],
  bubbles: [{ who: 'a', from: 4, to: 13, style: 'speech', icon: 'bulb' }, { who: 'b', from: 14, to: 22, style: 'speech', icon: 'shrug' }, { who: 'a', from: 25, to: 35, style: 'thought', icon: 'storm' }],
  over: (f, api) => { if (within(f, 29, 33)) { const [x, y] = api.rest.b.crown; api.put(f < 31 ? FX.dropSmall : FX.drop, x - 34, y + 6 + (f - 29) * 3); } } };

/** A question and one reply out of a set. The reply decides both the bubble and how each of them takes it. */
const REPLIES = {
  fish: { icon: 'fish', style: 'speech', bFace: 'happy', aFace: 'cheer', aHop: true, after: 'heart' },
  idea: { icon: 'bulb', style: 'shout', bFace: 'cheer', aFace: 'wow', aHop: true, after: 'check' },
  shrug: { icon: 'shrug', style: 'speech', bFace: 'shrug', aFace: 'dot', aHop: false, after: 'dots', bPose: SHRUG },
  nap: { icon: 'zzz', style: 'thought', bFace: 'asleep', aFace: 'sulk', aHop: false, after: 'drop', bPose: { sq: 4, wd: 4, fy: 4 } },
};
const askReply = key => { const r = REPLIES[key]; return { id: 'ask-' + key, group: 'talk', W: 240, frames: 36, title: `A question, answered with ${key === 'idea' ? 'an idea' : key === 'nap' ? 'a nap' : 'a ' + key}`,
  ms: timing(36, 110, { 5: 320, 15: 360, 26: 360 }),
  actors: [A([b(1, 'antic', 'blink'), b(3, 'perk+lookR', 'talk'), b(5, 'perk+lookR+pawR', 'oh', { tail: 2 }), b(10, 'perk+lookR', 'rest'), b(13, 'lookR', 'rest'), b(15, 'lookR+perk', r.aFace === 'cheer' ? 'wow' : r.aFace), b(18, 'lookR', r.aFace),
      ...(r.aHop ? [b(19, 'antic+lookR', r.aFace), ...hop(20, HOP1, 'lookR', 'cheer', { lx: -3, ly: -5, rx: 3, ry: -5 }), b(26, 'lookR+perk', 'happy', { tail: 3 })] : [b(22, 'lookR+slump', r.aFace), b(26, 'lookR+slump', r.aFace === 'dot' ? 'blink' : r.aFace)]), b(31, 'lookR', r.aHop ? 'happy' : 'sleepy'), b(33, 'antic', 'blink')]),
    B([b(4, 'lookR', 'rest'), b(7, 'lookR', 'blink'), b(8, 'lookR+lookUp', 'rest'), b(11, 'lookR+lookUp', 'rest'), b(12, 'lookR', 'blink'), b(14, 'lookR+perk', r.bFace, r.bPose ?? { rx: 4, ry: -12, tail: 3 }), b(22, 'lookR', r.bFace, r.bPose ?? { rx: 4, ry: -12, tail: 2 }), b(24, 'lookR', r.bFace, r.bPose ?? {}), b(30, 'lookR', r.bFace === 'asleep' ? 'asleep' : 'happy', r.bFace === 'asleep' ? r.bPose : {}), b(33, 'antic', 'blink')])],
  bubbles: [{ who: 'a', from: 4, to: 12, style: 'speech', icon: 'question' }, { who: 'b', from: 14, to: 23, style: r.style, icon: r.icon }, { who: 'a', from: 25, to: 32, style: 'thought', icon: r.after }] }; };

const MIX_UP = { id: 'mix-up', group: 'talk', W: 240, frames: 44, title: 'A misunderstanding: asked for a wrench, handed a fish',
  ms: timing(44, 110, { 5: 320, 18: 380, 21: 420, 25: 320, 32: 360, 38: 300 }),
  actors: [A([b(1, 'antic', 'blink'), b(3, 'perk+lookR', 'talk'), b(5, 'perk+reach', 'talk', { tail: 2 }), b(10, 'lookR+reach', 'rest'), b(12, 'lookR', 'rest'), b(17, 'lookR+perk', 'happy', { rx: 10, ry: -8 }), b(19, 'lookR', 'dot'), b(22, 'lookR', 'dot'), b(23, 'antic+lookR', 'grr'), b(24, 'tall+lookR', 'grrOpen', { lx: -6, ly: -8, rx: 8, ry: -10 }), b(28, 'perk+lookR', 'grr', { lx: -4, ly: -4, rx: 8, ry: -8 }), b(30, 'lookR', 'stern'),
      b(34, 'lookR+slump', 'sulk'), b(37, 'lookR', 'shrug', SHRUG), b(40, 'lookR', 'smile'), b(42, 'rest', 'blink')]),
    B([b(4, 'lookR', 'rest'), b(8, 'lookR', 'blink'), b(9, 'lookR+bow', 'glad'), b(11, 'lookR', 'happy'), b(12, 'away', 'rest'), b(13, 'away+antic', 'blink'), b(14, 'away', 'rest'), b(15, 'away+antic', 'rest'), b(16, 'lookR+perk', 'proud', { rx: 12, ry: -18, tail: 3 }), b(22, 'lookR+perk', 'proud', { rx: 12, ry: -18, tail: 2 }), b(25, 'lookR+tall', 'wow', { rx: 12, ry: -14, tail: 4 }), b(28, 'lookR', 'worry', { rx: 10, ry: -8 }),
      b(31, 'lookR+antic', 'worry', { rx: 6, ry: -4 }), b(36, 'lookR+antic', 'sad'), b(39, 'lookR', 'worry'), b(41, 'rest', 'blink')])],
  bubbles: [{ who: 'a', from: 4, to: 11, style: 'speech', icon: 'wrench' }, { who: 'b', from: 16, to: 22, style: 'speech', icon: 'check' }, { who: 'a', from: 23, to: 30, style: 'shout', icon: 'cross' }, { who: 'b', from: 28, to: 36, style: 'thought', icon: 'spiral' }, { who: 'a', from: 33, to: 41, style: 'speech', icon: 'wrench' }],
  over: (f, api) => { if (within(f, 16, 32)) { const [x, y] = api.a.b.pawR; api.put(PROPS.fish, x - 16, y - 14, { flip: true }); api.paw('b', 'R'); } } };

// Three in a row, 104px apart: a body is 97px wide and a raised paddle reaches 3px past it, so neighbours keep at least 2px between them even when the middle one turns round.
const G = { a: 0, m: 104, b: 208 }, GW = 352;
const GROUP_CHEER = { id: 'group-cheer', group: 'talk', W: GW, frames: 36, title: 'A group cheer: one calls it, the hops go round',
  ms: timing(36, 90, { 4: 320, 10: 160, 22: 200, 31: 260 }),
  actors: [{ name: 'm', ox: G.m, z: 0, beats: [b(1, 'antic', 'blink'), b(3, 'tall', 'cheer', { lx: -6, ly: -18, rx: 6, ry: -18, tail: 4 }), b(9, 'perk', 'happy', { lx: -4, ly: -10, rx: 4, ry: -10 }), b(13, 'antic', 'happy'), ...hop(14, HOP1, 'rest', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(22, 'antic', 'happy'), ...hop(23, [3, 6, 8, 6, 3, 0], 'rest', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(30, 'perk', 'happy', { tail: 3 }), b(33, 'antic', 'glad')] },
    { name: 'a', ox: G.a, z: 1, costume: 'rabbit', beats: [b(4, 'lookR', 'wide'), b(6, 'lookR+perk', 'wow', { tail: 3 }), b(10, 'antic+lookR', 'happy'), ...hop(11, HOP1, 'lookR', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(18, 'lookR', 'happy'), b(22, 'antic+lookR', 'happy'), ...hop(23, [3, 6, 8, 6, 3, 0], 'lookR', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(30, 'lookR+perk', 'happy', { tail: 3 }), b(33, 'antic', 'glad')] },
    { name: 'b', ox: G.b, flip: true, z: 1, costume: 'horn', beats: [b(4, 'lookR', 'wide'), b(7, 'lookR+perk', 'wow', { tail: 3 }), b(16, 'antic+lookR', 'happy'), ...hop(17, HOP1, 'lookR', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(23, 'antic+lookR', 'happy').pose && b(22, 'antic+lookR', 'happy'), ...hop(23, [3, 6, 8, 6, 3, 0], 'lookR', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(30, 'lookR+perk', 'happy', { tail: 3 }), b(33, 'antic', 'glad')] }],
  bubbles: [{ who: 'm', from: 3, to: 10, style: 'shout', icon: 'check' }, { who: 'a', from: 28, to: 34, style: 'speech', icon: 'star' }, { who: 'b', from: 29, to: 34, style: 'speech', icon: 'heart' }],
  over: (f, api) => { if (within(f, 24, 27)) for (const x of [70, 172, 274]) api.put(f === 25 || f === 26 ? FX.sparkBig : FX.spark, x, 24 + (f % 2) * 2); } };

const HI = { rx: 13, ry: -24, fx: 3, fy: -1 };
// A turn: the tail swings in behind the body over two poses, the face comes round to the front, and the tail swings out on the other side.
const SWING = (at, side) => [b(at, 'rest', { ...side, eyes: 'happy' }, { lift: 1, fx: -4, tx: 7, tail: 2 }, 'linear'), b(at + 1, 'rest', { ...side, eyes: 'happy' }, { lift: 2, fx: -8, tx: 14, tail: 4, wd: -2 }, 'linear')];
const front = (at, extra = {}) => b(at, 'rest', { front: true, eyes: 'happy' }, { fx: -12, lift: 3, ...extra });
const MERGE_HIGH_FIVE = { id: 'merge-high-five', group: 'talk', W: GW, frames: 44, title: 'A merge: the middle one high-fives both sides, then all three jump',
  ms: timing(44, 90, { 3: 300, 11: 220, 16: 110, 17: 150, 18: 110, 23: 220, 28: 110, 29: 150, 30: 110, 36: 110, 40: 240 }),
  actors: [{ name: 'm', ox: G.m, z: 0, costume: 'builder', beats: [b(1, 'antic', 'blink'), b(3, 'perk', 'cheer', { tail: 3 }), b(7, 'antic+lookR', 'happy'), b(9, 'lookR', 'cheer', { rx: 6, ry: -14 }), b(10, 'lookR+perk', 'cheer', HI), b(11, 'lookR+perk', 'cheer', { ...HI, rx: 18 }), b(13, 'lookR', 'happy', { rx: 6, ry: -10 }), b(14, 'antic', 'happy'), ...SWING(15, {}), front(17, { wd: -2 }),
      ...SWING(19, { flip: true }).reverse().map((k, i) => ({ ...k, at: 18 + i })), b(20, 'antic+lookR', { flip: true, eyes: 'happy' }), b(21, 'lookR', { flip: true, eyes: 'happy', mouth: 'open' }, { rx: 6, ry: -14 }), b(22, 'lookR+perk', { flip: true, eyes: 'happy', mouth: 'open' }, HI), b(23, 'lookR+perk', { flip: true, eyes: 'happy', mouth: 'open' }, { ...HI, rx: 18 }), b(25, 'lookR', { flip: true, eyes: 'happy', mouth: 'smile' }, { rx: 6, ry: -10 }), b(26, 'antic', { flip: true, eyes: 'happy' }), ...SWING(27, { flip: true }), front(29, { wd: -2 }), ...SWING(31, {}).reverse().map((k, i) => ({ ...k, at: 30 + i })),
      ...hop(32, [3, 6, 8, 6, 3, 0], 'rest', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(39, 'perk', 'happy', { tail: 3 }), b(42, 'rest', 'blink')] },
    { name: 'b', ox: G.b, flip: true, z: 1, costume: 'scholar', beats: [b(4, 'lookR', 'wide'), b(7, 'antic+lookR', 'happy'), b(9, 'lookR', 'cheer', { rx: 6, ry: -14 }), b(10, 'lookR+perk', 'cheer', HI), b(11, 'lookR+perk', 'cheer', { ...HI, rx: 18 }), b(13, 'lookR', 'happy', { rx: 6, ry: -10 }), b(16, 'lookR', 'happy'), b(31, 'antic+lookR', 'happy'), ...hop(32, [3, 6, 8, 6, 3, 0], 'lookR', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(39, 'lookR+perk', 'happy', { tail: 3 }), b(42, 'rest', 'blink')] },
    { name: 'a', ox: G.a, z: 1, costume: 'dragon', beats: [b(4, 'lookR', 'wide'), b(12, 'lookR', 'happy'), b(19, 'antic+lookR', 'happy'), b(21, 'lookR', 'cheer', { rx: 6, ry: -14 }), b(22, 'lookR+perk', { eyes: 'happy', mouth: 'open', wings: 1 }, HI), b(23, 'lookR+perk', { eyes: 'happy', mouth: 'open', wings: 2 }, { ...HI, rx: 18 }), b(25, 'lookR', 'happy', { rx: 6, ry: -10 }), b(28, 'lookR', 'happy'), b(31, 'antic+lookR', 'happy'), ...hop(32, [3, 6, 8, 6, 3, 0], 'lookR', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }).map((k, i) => ({ ...k, shapes: { ...k.shapes, wings: [1, 0, 2, 0, 1, 0][i] } })), b(39, 'lookR+perk', 'happy', { tail: 3 }), b(42, 'rest', 'blink')] }],
  bubbles: [{ who: 'm', from: 2, to: 8, style: 'shout', icon: 'flag' }],
  over: (f, api) => { if (f === 11 || f === 12) api.put(f === 11 ? FX.sparkBig : FX.spark, 224 + (f === 12 ? 2 : 0), 44 + (f === 12 ? 2 : 0)); if (f === 23 || f === 24) api.put(f === 23 ? FX.sparkBig : FX.spark, 122 + (f === 24 ? 2 : 0), 44 + (f === 24 ? 2 : 0)); if (within(f, 34, 36)) for (const x of [70, 172, 274]) api.put(f === 35 ? FX.sparkBig : FX.spark, x, 22); } };

const CRATE_PASS = { id: 'crate-pass', group: 'talk', W: 272, frames: 40, title: 'Passing a crate: a shove along the floor, a catch, a thank-you',
  ms: timing(40, 100, { 6: 200, 9: 140, 20: 240, 26: 360, 33: 200 }),
  actors: [A([b(1, 'antic', 'blink'), b(3, 'lookR', 'rest'), b(6, 'lookR+lookDown', 'rest'), b(8, 'antic+lookR', 'effort', { rx: -4, ry: -6 }), b(10, 'lookR+perk', 'effort', { rx: 12, ry: -6, tail: 3 }), b(12, 'lookR', 'rest', { rx: 10, ry: -6 }), b(15, 'lookR', 'rest'), b(22, 'lookR+perk', 'happy', { tail: 3 }), b(27, 'lookR+tall+chest', 'proud', { fy: -5, tail: 4 }), b(33, 'lookR+perk', 'happy'), b(37, 'antic', 'glad')], { costume: 'builder' }),
    { name: 'b', ox: 136, flip: true, costume: 'horn', beats: [b(8, 'lookR', 'wide'), b(12, 'lookR+lookDown', 'wide', { rx: 6, ry: -6 }), b(17, 'lookR+lookDown', 'effort', { rx: 12, ry: -4 }), b(18, 'lookR+lookDown+antic', 'blink', { rx: 10, ry: -4 }), b(21, 'lookR+lookDown', 'happy', { rx: 8, ry: -16 }), b(22, 'lookR+lookDown', 'happy', { rx: 8, ry: -10 }), b(23, 'lookR+lookDown', 'happy', { rx: 8, ry: -16 }), b(24, 'lookR+lookDown', 'happy', { rx: 8, ry: -10 }), b(26, 'lookR+perk', 'cheer', { tail: 3 }), b(32, 'lookR', 'happy'), b(37, 'antic', 'glad')] }],
  bubbles: [{ who: 'b', from: 25, to: 33, style: 'speech', icon: 'heart' }],
  under: (f, api) => {
    const s = PROPS.crate, x = f < 9 ? 112 : tw(f, 9, 18, 112, 150), t = f < 3 ? 0 : f < 6 ? (f - 2) / 4 : f < 33 ? 1 : f < 37 ? 1 - (f - 32) / 5 : 0;
    if (t > 0) api.put(s, x, FLOORY - s.h * t, { clipY: FLOORY });
    if (within(f, 10, 16) && f % 2 === 0) api.put(FX.dash, x - 10, 94);
  } };

const TEACH = { id: 'teach', group: 'talk', W: 240, frames: 44, title: 'Teaching: a branch explained, a blank look, the book, then it lands',
  ms: timing(44, 110, { 5: 320, 14: 360, 21: 320, 26: 200, 31: 360, 37: 300 }),
  actors: [A([b(1, 'antic', 'blink'), b(3, 'perk+lookR', 'talk'), b(5, 'perk+reach', 'talk', { tail: 2 }), b(8, 'lookR+reach', 'happy'), b(11, 'lookR', 'rest'), b(15, 'lookR', 'blink'), b(17, 'lookR+lookDown', 'rest', { rx: 8, ry: -8 }), b(19, 'lookR+lookDown', 'talk', { rx: 10, ry: -4 }), b(21, 'lookR', 'talk', { rx: 10, ry: -4 }), b(24, 'lookR', 'rest'), b(31, 'lookR+perk', 'wow', { tail: 3 }), b(34, 'lookR+tall+chest', 'proud', { fy: -5, tail: 4 }), b(39, 'lookR', 'happy'), b(41, 'antic', 'glad')], { costume: 'scholar' }),
    B([b(4, 'lookR', 'rest'), b(7, 'lookR+lookUp', 'rest'), b(12, 'lookR', 'blink'), b(13, 'lookR', 'worry'), b(16, 'lookR', 'worry', { fx: 2 }), b(20, 'lookR+lookDown', 'rest'), b(23, 'lookR+lookDown', 'rest', { gx: 2 }), b(24, 'lookR+lookDown', 'blink'), b(26, 'lookR+lookDown', 'rest', { gx: -1 }), b(28, 'lookR+lookDown', 'wide'), b(29, 'antic+lookR', 'wow'), ...hop(30, HOP1, 'lookR', 'cheer', { lx: -5, ly: -8, rx: 5, ry: -8 }), b(36, 'lookR+perk', 'happy', { tail: 3 }), b(41, 'antic', 'glad')], { costume: 'rabbit' })],
  bubbles: [{ who: 'a', from: 4, to: 12, style: 'speech', icon: 'branch' }, { who: 'b', from: 13, to: 19, style: 'thought', icon: 'question' }, { who: 'a', from: 19, to: 25, style: 'speech', icon: 'book' }, { who: 'b', from: 29, to: 36, style: 'shout', icon: 'bulb' }, { who: 'a', from: 33, to: 40, style: 'speech', icon: 'check' }],
  under: (f, api) => { risen(api, PROPS.bookOpen, 110, 15, 38); } };

const BREATH = (at, n, face = 'asleep') => Array.from({ length: n }, (_, i) => b(at + i * 3, 'rest', face, { sq: i % 2 ? 5 : 6, wd: i % 2 ? 4 : 5, fy: 5, tail: -2 }, 'inOut'));
const NAP_TOGETHER = { id: 'nap-together', group: 'talk', W: 224, frames: 44, title: 'A nap together: one yawn sets off the other',
  ms: timing(44, 150, { 6: 300, 13: 300, 35: 200, 38: 240 }),
  actors: [A([b(2, 'rest', 'sleepy', { fy: 2 }), b(4, 'perk', 'blink', { rx: -8, ry: -10 }), b(6, 'tall+mouth', 'yawn', { fy: -3 }), b(9, 'tall+mouth', 'yawn', { fy: -4 }), b(11, 'rest', 'sleepy', { fy: 2 }), b(14, 'slump', 'sleepy', { fy: 4 }), ...BREATH(17, 6), b(36, 'antic', 'sleepy', { fy: 2 }), b(38, 'perk', 'blink'), b(40, 'rest', 'happy'), b(42, 'rest', 'blink')]),
    { name: 'b', ox: 88, flip: true, costume: 'unicorn', beats: [b(5, 'lookR', 'rest'), b(9, 'lookR', 'sleepy'), b(11, 'perk', 'blink', { rx: -8, ry: -10 }), b(13, 'tall+mouth', 'yawn', { fy: -3 }), b(16, 'tall+mouth', 'yawn', { fy: -4 }), b(18, 'rest', 'sleepy', { fy: 2 }), b(20, 'slump', 'asleep', { fy: 4 }), ...BREATH(22, 5), b(37, 'antic', 'sleepy', { fy: 2 }), b(39, 'perk', 'blink'), b(41, 'rest', 'happy')] }],
  bubbles: [{ who: 'a', from: 18, to: 24, style: 'thought', icon: 'zzz' }, { who: 'b', from: 23, to: 29, style: 'thought', icon: 'fish' }, { who: 'a', from: 28, to: 34, style: 'thought', icon: 'zzz' }] };

const CONSOLE = { id: 'console-stuck', group: 'talk', W: 240, frames: 44, title: 'Consoling a stuck one: a spiral, a worried look, a fish held out',
  ms: timing(44, 110, { 3: 360, 12: 300, 21: 360, 29: 360, 36: 300 }),
  actors: [A([b(2, 'slump', 'sad', { tail: -3 }), b(4, 'slump+lookDown', 'sad', { tail: -3 }), b(12, 'slump+lookDown', 'sulk', { tail: -3 }), b(16, 'slump+lookR', 'sad', { tail: -2 }), b(22, 'slump+lookR', 'wide'), b(24, 'lookR', 'wide'), b(26, 'lookR+perk', 'wow', { tail: 2 }), b(28, 'lookR+perk', 'happy', { rx: 10, ry: -10, tail: 3 }), b(33, 'lookR', 'happy', { rx: 6, ry: -14 }), b(38, 'lookR', 'happy', { tail: 3 }), b(41, 'antic', 'glad')]),
    B([b(5, 'lookR', 'rest'), b(8, 'lookR', 'wide'), b(10, 'lookR+perk', 'worry'), b(15, 'lookR', 'worry'), b(16, 'away', 'rest'), b(17, 'away+antic', 'blink'), b(18, 'away', 'rest'), b(20, 'lookR+perk', 'smile', { rx: 12, ry: -14, tail: 2 }), b(27, 'lookR+perk', 'happy', { rx: 14, ry: -12, tail: 3 }), b(29, 'lookR', 'happy', { rx: 10, ry: -8 }), b(31, 'lookR', 'happy'), b(36, 'lookR+perk', 'wink', { tail: 3 }), b(41, 'antic', 'glad')], { costume: 'scholar' })],
  bubbles: [{ who: 'a', from: 3, to: 13, style: 'thought', icon: 'spiral' }, { who: 'b', from: 9, to: 15, style: 'speech', icon: 'question' }, { who: 'a', from: 30, to: 38, style: 'speech', icon: 'heart' }],
  over: (f, api) => {
    if (within(f, 20, 28)) { const [x, y] = api.a.b.pawR; api.put(PROPS.fish, x - 16, y - 14, { flip: true }); api.paw('b', 'R'); }
    if (within(f, 29, 35)) { const [x, y] = api.a.a.pawR; api.put(PROPS.fish, x - 6, y - 14); api.paw('a', 'R'); }
  } };

const WRENCH_HANDOFF = { id: 'wrench-handoff', group: 'talk', W: 224, frames: 36, title: 'A tool hand-off (Harness): the wrench changes flippers',
  ms: timing(36, 100, { 5: 300, 12: 200, 17: 200, 22: 360, 28: 240 }),
  actors: [A([b(1, 'antic', 'blink'), b(3, 'lookR+perk', 'talk', { rx: 6, ry: -22 }), b(5, 'lookR+perk', 'happy', { rx: 8, ry: -26, tail: 3 }), b(11, 'lookR', 'rest', { rx: 5, ry: -22 }), b(14, 'lookR', 'effort', { rx: 11, ry: -18 }), b(16, 'lookR', 'happy', { rx: 8, ry: -16 }), b(19, 'lookR', 'happy'), b(23, 'lookR+perk', 'wink', { tail: 3 }), b(30, 'lookR', 'happy'), b(33, 'antic', 'glad')], { costume: 'builder' }),
    { name: 'b', ox: 88, flip: true, beats: [b(4, 'lookR', 'wide'), b(8, 'lookR+perk', 'cheer', { tail: 3 }), b(12, 'lookR', 'happy', { rx: 5, ry: -14 }), b(14, 'lookR', 'effort', { rx: 11, ry: -18 }), b(16, 'lookR', 'happy', { rx: 8, ry: -18 }), b(19, 'lookR+perk', 'happy', { rx: 6, ry: -26, tail: 3 }), b(22, 'lookR+tall', 'proud', { rx: 6, ry: -30, fy: -5, tail: 4 }), b(27, 'lookR+perk', 'happy', { rx: 6, ry: -24 }), b(30, 'lookR', 'happy', { rx: 2, ry: -8 }), b(33, 'antic', 'glad')] }],
  bubbles: [{ who: 'b', from: 7, to: 13, style: 'speech', icon: 'wrench' }, { who: 'a', from: 21, to: 28, style: 'speech', icon: 'check' }],
  over: (f, api) => {
    if (!within(f, 3, 29)) return;
    const holder = f < 15 ? 'a' : 'b', [x, y] = api.a[holder].pawR;
    api.put(PROPS.wrenchUp, x - (holder === 'a' ? 6 : 12), y - 18, { flip: holder === 'b' }); api.paw(holder, 'R');
    if (f === 15 || f === 16) api.put(FX.spark, 110, 58);
    if (within(f, 22, 24)) api.put(f === 23 ? FX.sparkBig : FX.spark, 112, 34);
  } };

/** Any clip in any costume: the costume is only layers, so nothing about the clip is redrawn. */
const dressed = (clip, costume) => ({ ...clip, id: `${clip.id}+${costume}`, group: 'cast', costume, title: `${clip.title} — in the ${costume} costume`, actors: clip.actors.map(a => ({ ...a, costume })) });
export const CLIPS = [...TOOLS, FEEL_HAPPY, FEEL_PROUD, FEEL_SLEEPY, FEEL_SURPRISED, FEEL_WORRIED, FEEL_FRUSTRATED, BOUND, BELLY_SLIDE, TIPTOE, RUN, ROLL, CLIMB, FLUTTER,
  dressed(FEEL_PROUD, 'horn'), dressed(FEEL_HAPPY, 'unicorn'), dressed(FEEL_SURPRISED, 'dragon'), dressed(FEEL_WORRIED, 'rabbit'), dressed(HOOK_WRENCH, 'builder'), dressed(BOOK_STACK, 'scholar'),
  IDEA_SHRUG_SULK, askReply('fish'), askReply('idea'), askReply('shrug'), askReply('nap'), MIX_UP, GROUP_CHEER, MERGE_HIGH_FIVE, CRATE_PASS, TEACH, NAP_TOGETHER, CONSOLE, WRENCH_HANDOFF];

/** The same travel to the left: a turn through a pose facing the viewer, the mirrored cycle, and a turn back. */
export function leftOf(clip, solved) {
  const right = solved ?? timeline(clip.actors[0].beats, clip.frames), n = clip.frames;
  const SLIDE = -8;
  // The tail swings in behind the body as the face comes round, and out again on the other side.
  const TURN_IN = [{ pose: { sq: 2, wd: 2, fy: 1, tx: 4, tail: 1 }, shapes: { eyes: 'line' } }, { pose: { lift: 2, fx: -6, sq: -1, x: -2, tx: 10, tail: 3 }, shapes: {} }, { pose: { lift: 3, fx: -12, x: -6 }, shapes: { front: true, eyes: 'line' } }, { pose: { lift: 3, fx: -6, x: -6, tx: 10, tail: 3 }, shapes: { flip: true } }, { pose: { lift: 1, fx: -2, x: SLIDE, tx: 4, tail: 1 }, shapes: { flip: true } }];
  const mid = right.slice(1, n - 1).map(({ pose, shapes }) => ({ pose: { ...pose, x: SLIDE }, shapes: { ...shapes, flip: true } }));
  const poses = [{ pose: {}, shapes: {} }, ...TURN_IN, ...mid, ...[...TURN_IN].reverse(), { pose: {}, shapes: {} }];
  const ms = [110, 110, 80, 80, 80, 80, ...clip.ms.slice(1, n - 1), 80, 80, 80, 80, 110, 110], pad = [0, 0, 0, 0, 0, 0];
  const travel = [...pad, ...clip.travel.slice(1, n - 1), ...Array(6).fill(clip.travel[n - 2])].map(v => -v);
  const travelY = clip.travelY && [...pad, ...clip.travelY.slice(1, n - 1), ...Array(6).fill(clip.travelY[n - 2])];
  const flipFx = api => ({ ...api, put: (s, x, y, opt = {}) => api.put(s, Math.min(124 - s.w, 144 + SLIDE - x - s.w), y, { ...opt, flip: !opt.flip }) });
  return { ...clip, id: clip.id + '-left', title: clip.title + ' (to the left)', frames: poses.length, ms, travel, travelY, mirrored: true,
    under: clip.under && ((f, api) => { const g = Math.max(1, Math.min(n - 2, f - 5)); clip.under(g, flipFx({ ...api, f: g })); }),
    actors: [{ ...clip.actors[0], beats: undefined, poses }],
    over: clip.over && ((f, api) => { if (f >= 6 && f < poses.length - 6) clip.over(f - 5, flipFx({ ...api, f: f - 5 })); }) };
}
