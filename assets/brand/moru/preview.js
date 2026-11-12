const data = globalThis.moruManifest;
const hero = document.querySelector('#hero'), holder = document.querySelector('#motions');
const images = {}, canvases = {}, buttons = {}, visible = new Set();
const pref = matchMedia('(prefers-reduced-motion: reduce)');
const elapsedByKey = Object.fromEntries(Object.keys(data.clips).map(key => [key, 0]));
let selected = 'wave', wantsPlayback = true, playing = !pref.matches, size = 128, raf = 0, cycles = 0, lastTick = performance.now(), overview = false;
const observer = new IntersectionObserver(entries => { for (const e of entries) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); } schedule(); });
observer.observe(hero);
for (const [key, clip] of Object.entries(data.clips)) {
  const image = new Image(); image.src = clip.sprite; images[key] = { 128: image };
  const button = document.createElement('button'); button.className = 'motion'; button.dataset.key = key;
  button.setAttribute('aria-pressed', String(key === selected)); button.setAttribute('aria-label', clip.label);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; canvas.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.className = 'label'; label.textContent = clip.label;
  const kind = document.createElement('span'); kind.className = 'kind'; kind.textContent = clip.kind === 'authored' ? 'AUTHORED' : 'COMPOSED';
  button.append(canvas, label, kind); holder.append(button); canvases[key] = canvas; buttons[key] = button; observer.observe(canvas);
  button.onclick = () => { selected = key; elapsedByKey[key] = 0; if (overview) document.querySelector('#overview').click(); update(); schedule(); hero.scrollIntoView({ block: 'center', behavior: 'instant' }); };
}
for (const [name, pose] of Object.entries(data.poses)) {
  const tile = document.createElement('a'); tile.className = 'pose'; tile.href = pose.path; tile.download = '';
  const img = new Image(); img.src = pose.path; img.alt = `Moru: ${name.replaceAll('-', ' ')}`; img.width = img.height = 128;
  const label = document.createElement('span'); label.className = 'label'; label.textContent = name.replaceAll('-', ' ');
  const native = document.createElement('span'); native.className = 'kind'; native.textContent = `${pose.nativeSize}px MASTER`;
  tile.append(img, label, native); document.querySelector('#poses').append(tile);
}
function frameAt(key) {
  const times = data.clips[key].durationsMs; let t = elapsedByKey[key] % times.reduce((a, b) => a + b, 0);
  for (let i = 0; i < times.length; i++) { if (t < times[i]) return i; t -= times[i]; } return 0;
}
function draw(canvas, key, index) {
  const image = images[key][size]; if (!image?.complete || !image.naturalWidth) return;
  const h = size;
  if (canvas.width === size && canvas.height === h && canvas.dataset.frame === String(index) && canvas.dataset.motion === key) return;
  canvas.width = size; canvas.height = h;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, size, h);
  ctx.drawImage(image, index * size, (size - h) / 2, size, h, 0, 0, size, h); canvas.dataset.frame = index; canvas.dataset.motion = key;
}
function tick(now) {
  raf = 0; if (document.hidden) return;
  const delta = Math.max(0, now - lastTick); lastTick = now;
  for (const [key, canvas] of Object.entries(canvases)) {
    if (playing && (visible.has(canvas) || key === selected && visible.has(hero))) elapsedByKey[key] += delta;
    if (visible.has(canvas)) draw(canvas, key, frameAt(key));
  }
  if (visible.has(hero)) draw(hero, selected, frameAt(selected));
  const current = frameAt(selected), max = data.clips[selected].frames;
  document.querySelector('#frame').value = current + 1; document.querySelector('#frameNumber').value = `${current + 1} / ${max}`;
  cycles++; if (playing && visible.size) raf = requestAnimationFrame(tick);
}
function schedule() { if (!raf && !document.hidden) { lastTick = performance.now(); raf = requestAnimationFrame(tick); } }
function update() {
  const clip = data.clips[selected];
  document.querySelector('#stageName').textContent = clip.label;
  document.querySelector('#context').textContent = clip.context;
  document.querySelector('#download').href = clip.gif;
  document.querySelector('#source').href = clip.source ?? 'moru-source.json';
  document.querySelector('#source').textContent = clip.source ? 'Authored source' : `Composed: ${clip.constituents.join(' → ')}`;
  document.querySelector('#frame').max = clip.frames;
  document.querySelector('#play').textContent = pref.matches ? 'Motion reduced' : playing ? 'Pause motion' : 'Play motion';
  document.querySelector('#play').disabled = pref.matches;
  document.querySelector('#motionState').textContent = `${Object.values(data.clips).filter(c => c.kind === 'authored').length} authored + ${Object.values(data.clips).filter(c => c.kind === 'composed').length} composed · ${playing ? 'playing' : 'paused'}`;
  hero.setAttribute('aria-label', `Moru: ${clip.label}`);
  if (!overview) document.querySelector('#overview').textContent = `All ${Object.keys(data.clips).length} motions`;
  for (const [key, button] of Object.entries(buttons)) button.setAttribute('aria-pressed', String(key === selected));
}
document.querySelector('#play').onclick = () => { if (pref.matches) return; wantsPlayback = !playing; playing = wantsPlayback; update(); schedule(); };
document.querySelector('#frame').oninput = e => { wantsPlayback = playing = false; const index = Number(e.target.value) - 1, times = data.clips[selected].durationsMs; elapsedByKey[selected] = times.slice(0, index).reduce((a, b) => a + b, 0) + times[index] / 2; update(); schedule(); };
document.querySelector('#theme').onclick = e => { const light = document.body.classList.toggle('light'); e.currentTarget.setAttribute('aria-pressed', String(light)); e.currentTarget.textContent = light ? 'Dark background' : 'Light background'; };
document.querySelector('#resolution').onclick = async e => {
  const button = e.currentTarget;
  size = size === 128 ? 64 : 128;
  for (const [key, clip] of Object.entries(data.clips)) if (!images[key][size]) { const img = new Image(); img.src = clip.sprite64; images[key][size] = img; }
  await Promise.all(Object.values(images).map(im => im[size].decode()));
  button.textContent = `Native ${size}px`; button.setAttribute('aria-pressed', String(size === 64)); schedule();
};
document.querySelector('#overview').onclick = e => { overview = !overview; document.body.classList.toggle('overview', overview); e.currentTarget.setAttribute('aria-pressed', String(overview)); e.currentTarget.textContent = overview ? 'Detailed view' : `All ${Object.keys(data.clips).length} motions`; window.scrollTo(0, 0); schedule(); };
pref.addEventListener('change', e => { playing = wantsPlayback && !e.matches; if (e.matches) for (const key of Object.keys(elapsedByKey)) elapsedByKey[key] = 0; update(); schedule(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else schedule(); });
globalThis.moruPreview = { get state() { return { selected, playing, size, cycles, frames: Object.fromEntries(Object.entries(canvases).map(([k, c]) => [k, Number(c.dataset.frame ?? 0)])) }; } };
Promise.all(Object.values(images).map(im => im[128].decode())).then(() => { for (const key of Object.keys(canvases)) draw(canvases[key], key, 0); draw(hero, selected, 0); document.body.dataset.ready = 'true'; update(); schedule(); }).catch(error => { document.querySelector('#motionState').textContent = 'A local asset failed to load.'; console.error(error); });
