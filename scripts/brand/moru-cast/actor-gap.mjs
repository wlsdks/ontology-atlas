// Smallest gap between any two actors' pixels on each frame of a clip (bodies as drawn, costumes included by tint-free render).
import { renderClip } from './scene.mjs';
import { CLIPS } from './clips.mjs';
import { drawMoru, blitMoru, makeRig } from './engine.mjs';
import { costumeLayers } from './art.mjs';
const rig = await makeRig();
for (const id of process.argv.slice(2)) {
  const clip = CLIPS.find(c => c.id === id), r = await renderClip({ ...clip, limits: { ground: 1.3745, air: 4.538 } }), W = r.W, H = 128, close = [];
  for (let f = 0; f < clip.frames; f++) {
    const layers = clip.actors.map(a => { const k = r.tracks[a.name][f], sc = new Uint8Array(W * H); blitMoru(sc, W, drawMoru(rig, k.pose, k.shapes, costumeLayers(a.costume)), a.ox, { flip: !!a.flip !== !!k.shapes.flip }); return sc; });
    let min = 99, where;
    for (let i = 0; i < layers.length; i++) for (let j = i + 1; j < layers.length; j++) for (let y = 0; y < H; y++) { let lastI = -99, lastJ = -99; for (let x = 0; x < W; x++) { const p = y * W + x; if (layers[i][p]) { lastI = x; if (x - lastJ - 1 < min) { min = x - lastJ - 1; where = [clip.actors[i].name, clip.actors[j].name, x, y]; } } if (layers[j][p]) { lastJ = x; if (x - lastI - 1 < min) { min = x - lastI - 1; where = [clip.actors[j].name, clip.actors[i].name, x, y]; } } } }
    if (min < 2) close.push(`${f}:${min}@${where}`);
  }
  console.log(id, 'frames with a row gap under 2px:', close.join(' ') || 'none');
}
