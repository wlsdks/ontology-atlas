// The wardrobe: pieces in three slots (head, body, accessory) that combine freely with any body palette.
// A piece is one to three small sprites, each tied to an anchor (crown, face, chest, back) and a layer:
// behind the body, on the skin (kept inside the body's silhouette), or in front. Flippers always draw over them.
import { px, KEY } from '../engine.mjs';
import { COSTUMES } from '../art.mjs';
const u2 = rows => px(rows, { unit: 2, ring: 2, key: KEY }), flat = rows => px(rows, { unit: 2, key: KEY });
/** The sprites a costume of the first round draws, taken at rest so they can be worn piece by piece. */
function from(costume, pick, shapes = {}, pose = {}) {
  const out = [];
  for (const layer of COSTUMES[costume].layers) { const ctx = { shift: () => [0, 0], faceShift: () => [0, 0], shapes, pose, onBody: () => true, canvas: [], L: () => 0, put: (s, x, y) => out.push({ s, x, y, layer: layer.layer }) }; try { layer.draw(ctx); } catch { /* a layer painted straight onto the canvas has a sprite of its own below */ } }
  return pick(out);
}
// `soft` is how far a piece trails its anchor (0 rigid, 1 a hat settling, 2 cloth, hair and ears); `alts` are the same piece in another state.
const part = (s, x, y, anchor, layer = 'front', tint = false, soft = 1, alts = null) => ({ s, x, y, anchor, layer, tint, soft, alts });
const soft = (p, n, alts = null) => ({ ...p, soft: n, alts });
const crown = o => part(o.s, o.x, o.y, 'crown');
const RIM = ['iiiiiiii', 'i      i', 'i      i', 'i      i', 'i      i', 'iiiiiiii'];
const GLASSES = px(RIM.map((r, i) => r + (i === 2 ? 'iiii' : '    ') + r), { unit: 2, key: KEY });
// The cape hangs in folds: a shadow runs down each valley and leans back as it falls, a light edge leads, and the hem is cut in scallops.
const CAPE = Array.from({ length: 23 }, (_, r) => { const w = 17 - Math.floor(r / 4), lean = Math.floor(r / 5); return Array.from({ length: w + 1 }, (_, c) => { if (c === w) return 'l'; const k = (c + lean) % 5; if (r >= 21 && k === 0) return ' '; if (r === 20 && k === 0) return 'm'; return r >= 3 && k === 0 ? 'm' : r >= 3 && k === 1 && r % 6 < 3 ? 'l' : 'i'; }).join(''); });
export const WARDROBE = [
  // ---- head ----
  { id: 'horns', slot: 'head', title: 'Horns', parts: from('horn', o => o.map(crown)) },
  { id: 'unicorn-horn', slot: 'head', title: 'Horn and mane', parts: from('unicorn', o => o.map((p, i) => soft(crown(p), i === 0 ? 2 : 0))) },
  { id: 'dragon-horns', slot: 'head', title: 'Small horns', parts: from('dragon', o => o.filter(p => p.layer === 'front' && p.y < 40).map(crown)) },
  // The ears fall in three pictures (up, bent, down) and the wing beats in five; the runtime steps one picture a pose On a turned pose the wing is its full leaf.
  { id: 'ears', slot: 'head', title: 'Long ears', parts: (() => { const at = level => from('rabbit', o => o.map(p => ({ ...crown(p), tint: true })), { earLevel: level }), bent = at(1), down = at(2); return at(0).map((p, i) => soft(p, 2, { bent: bent[i], droop: down[i] })); })() },
  { id: 'hard-hat', slot: 'head', title: 'Hard hat', parts: from('builder', o => o.filter(p => p.layer !== 'skin').map(crown)) },
  { id: 'beanie', slot: 'head', title: 'Beanie', parts: [part(u2(['    ..    ', '   ....   ', '  llllll  ', ' iiiiiiii ', 'iiiiiiiiii', 'iiiiiiiiii', 'mlmlmlmlml']), 68, 31, 'crown')] },
  { id: 'straw-hat', slot: 'head', title: 'Sun hat', parts: [part(u2(['      ssssss      ', '     ssssssss     ', '     ssssssss     ', '     iiiiiiii     ', ' ssssssssssssssss ', 'gggggggggggggggggg']), 62, 34, 'crown')] },
  { id: 'party-hat', slot: 'head', title: 'Party hat', parts: [part(u2(['   .   ', '   p   ', '  ppl  ', '  plp  ', ' plppl ', ' lpplp ', 'pplpplp']), 72, 29, 'crown')] },
  { id: 'bow', slot: 'head', title: 'Bow', parts: [part(u2(['pp   pp', 'ppp ppp', 'pppipp ', 'ppp ppp', 'pp   pp']), 84, 34, 'crown')] },
  { id: 'flower-crown', slot: 'head', title: 'Flower crown', parts: [part(u2(['  p     p     p  ', ' p.p   p.p   p.p ', '  p  l  p  l  p  ', 'lillillillillilli']), 62, 36, 'crown')] },
  // ---- body ----
  { id: 'vest', slot: 'body', title: 'Work vest', parts: from('builder', o => o.filter(p => p.layer === 'skin').map(p => part(p.s, p.x, p.y, 'chest', 'skin'))) },
  { id: 'scarf', slot: 'body', title: 'Scarf', parts: [part(flat(Array.from({ length: 4 }, (_, r) => (r === 3 ? 'm' : 'i').repeat(31))), 52, 79, 'chest', 'skin'), part(u2(['iii ', 'iiii', ' iii', ' iii', ' i i']), 44, 80, 'chest')] },
  { id: 'cape', slot: 'body', title: 'Cape', parts: [part(flat(CAPE), 34, 50, 'back', 'skin'), part(u2(['ii ', 'imi', ' ii', '  i']), 28, 84, 'back', 'behind'), part(flat(['...', '.l.', '...']), 62, 50, 'back', 'skin')] },
  { id: 'apron', slot: 'body', title: 'Apron', parts: [part(flat(['  llllllllllll  ', ' llllllllllllll ', 'llllllllllllllll', 'llll......llllll', 'llll......llllll', 'llll......llllll', 'llllllllllllllll', 'llllllllllllllll']), 66, 78, 'chest', 'skin')] },
  { id: 'neckerchief', slot: 'body', title: 'Neckerchief', parts: [part(flat(['ppppppppppp', ' ppppppppp ', '  ppppppp  ', '   ppppp   ', '    ppp    ', '     p     ']), 72, 76, 'chest', 'skin')] },
  { id: 'wing', slot: 'body', title: 'Small wing', parts: (() => { const wing = level => from('dragon', o => o.filter(p => p.layer === 'behind').map(p => part(p.s, p.x, p.y, 'back', 'behind')), { wingLevel: level })[0]; return [soft(wing(0), 0, { up: wing(2), halfUp: wing(1), halfDown: wing(-1), down: wing(-2), turned: from('dragon', o => o.filter(p => p.layer === 'behind').map(p => part(p.s, p.x, p.y, 'back', 'behind')), { angle: 90 })[0] })]; })() },
  { id: 'back-plates', slot: 'body', title: 'Back plates', parts: from('dragon', o => o.filter(p => p.layer === 'front' && p.y >= 40).map(p => part(p.s, p.x + 6, p.y - 6, 'back'))) },
  // ---- accessory ----
  { id: 'glasses', slot: 'accessory', title: 'Square glasses', parts: [part(GLASSES, 62, 58, 'face')] },
  { id: 'satchel', slot: 'accessory', title: 'Satchel', parts: [part(u2(['mmmmmmm', 'm.....m', 'mmmlmmm', 'mmmmmmm', 'mmmmmmm']), 66, 86, 'chest')] },
  { id: 'badge', slot: 'accessory', title: 'Badge', parts: [part(flat(['  i  ', ' iii ', 'ii.ii', ' iii ', '  i  ']), 72, 76, 'chest', 'skin')] },
  { id: 'bell', slot: 'accessory', title: 'Bell collar', parts: [part(flat(Array.from({ length: 2 }, () => 'm'.repeat(24))), 60, 81, 'chest', 'skin'), part(u2(['..', '..', ' l']), 80, 83, 'chest')] },
  { id: 'backpack', slot: 'accessory', title: 'Backpack', parts: [part(u2([' mmmm ', 'mmmmmm', 'mllllm', 'mmmmmm', 'mm..mm', ' mmmm ']), 44, 47, 'back')] },
];

// Only what is bone stays rigid (horns). Plates, the wing and glasses settle a pixel behind the body, so a landing or a stop reads on the outfit too.
const SOFT = {"scarf": [1, 2], "cape": [1, 2], "neckerchief": [1], "bow": [2], "bell": [0, 2], "satchel": [2], "backpack": [1], "flower-crown": [0], "horns": [0, 0], "dragon-horns": [0, 0], "back-plates": [1, 1], "glasses": [1], "wing": [1], "badge": [0], "vest": [0], "apron": [1]};
for (const piece of WARDROBE) if (SOFT[piece.id]) piece.parts.forEach((p, i) => { p.soft = SOFT[piece.id][i] ?? p.soft; });
