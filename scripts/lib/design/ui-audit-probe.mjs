import { judgeRaw } from "./ui-audit-checks.mjs";

const INTERACTIVE = 'a[href],button,input,select,textarea,[role=button],[role=tab],[tabindex]:not([tabindex="-1"])';
export const FREEZE_CSS = "*,*::before,*::after{transition:none!important;animation:none!important}";

function uiAuditProbe({ rampNames, interactive, scope }) {
  const chain = (element) => {
    const out = [];
    for (let n = element; n && out.length < 4 && n !== document.documentElement; n = n.parentElement) {
      const cls = typeof n.className === "string" ? n.className.trim().split(/\s+/).filter(Boolean) : [];
      out.push({ tag: n.tagName.toLowerCase(), id: n.id || "", classes: cls });
    }
    return out;
  };
  const cache = new Map();
  const painted = (element) => {
    if (cache.has(element)) return cache.get(element) !== null;
    const c = getComputedStyle(element);
    const b = element.getBoundingClientRect();
    const area = { left: Math.max(0, b.left), top: Math.max(0, b.top), right: Math.min(innerWidth, b.right), bottom: Math.min(innerHeight, b.bottom) };
    const boundary = (node, style) => node instanceof HTMLElement && ["absolute", "fixed"].includes(style.position)
      ? node.offsetParent ?? document.documentElement : null;
    let containingBlock = boundary(element, c);
    let ok = !element.hasAttribute("inert") && b.width >= 1 && b.height >= 1 && c.visibility !== "hidden" && c.display !== "none" && Number(c.opacity) >= 0.05;
    if (ok && element.closest("details:not([open])")) ok = false;
    for (let n = element.parentElement; ok && n && n !== document.body; n = n.parentElement) {
      const nc = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (n === containingBlock) containingBlock = null;
      const scaleX = n.offsetWidth ? r.width / n.offsetWidth : 1;
      const scaleY = n.offsetHeight ? r.height / n.offsetHeight : 1;
      if (!containingBlock && ["auto", "scroll", "hidden", "clip"].includes(nc.overflowX)) {
        area.left = Math.max(area.left, r.left + n.clientLeft * scaleX);
        area.right = Math.min(area.right, r.left + (n.clientLeft + n.clientWidth) * scaleX);
      }
      if (!containingBlock && ["auto", "scroll", "hidden", "clip"].includes(nc.overflowY)) {
        area.top = Math.max(area.top, r.top + n.clientTop * scaleY);
        area.bottom = Math.min(area.bottom, r.top + (n.clientTop + n.clientHeight) * scaleY);
      }
      if (!containingBlock) containingBlock = boundary(n, nc);
      if (nc.contentVisibility === "hidden" || n.hasAttribute("inert") || Number(nc.opacity) < 0.05) ok = false;
    }
    ok = ok && area.right - area.left >= 1 && area.bottom - area.top >= 1;
    cache.set(element, ok ? area : null);
    return ok;
  };
  const r1 = (v) => Math.round(v * 10) / 10;

  const resolve = (names, prop, read) =>
    names.map((name) => {
      const probe = document.createElement("div");
      probe.style.cssText = "transition:none;position:absolute;visibility:hidden;pointer-events:none";
      probe.style[prop] = `var(${name})`;
      document.body.appendChild(probe);
      const value = read(getComputedStyle(probe), name);
      probe.remove();
      return value;
    });
  const rootStyle = getComputedStyle(document.documentElement);
  const ramps = {
    text: resolve(rampNames.text, "fontSize", (s) => s.fontSize),
    leading: resolve(rampNames.leading, "lineHeight", (s, name) => {
      const raw = rootStyle.getPropertyValue(name).trim();
      return /^[\d.]+$/.test(raw) ? raw : s.lineHeight;
    }),
    radius: resolve(rampNames.radius, "borderTopLeftRadius", (s) => s.borderTopLeftRadius),
    shadow: resolve(rampNames.shadow, "boxShadow", (s) => s.boxShadow),
  };

  const roots = scope ? [...document.querySelectorAll(scope)] : [document.body];
  if (roots.length !== 1) throw new Error(`Audit scope must match exactly one element; found ${roots.length}: ${scope}`);
  const root = roots[0];
  if (scope && !painted(root)) throw new Error(`Audit scope is not visible: ${scope}`);
  const subjects = [...root.querySelectorAll("*")];
  if (scope) subjects.unshift(root);
  const all = subjects.filter((element) => !["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(element.tagName));
  const visible = all.filter(painted);
  if (!visible.length) throw new Error("Audit measured no visible elements");
  const visibleSet = new Set(visible);

  const docOverflow = document.documentElement.scrollWidth - innerWidth;
  const overflow = [];
  if (!scope && docOverflow > 0) overflow.push({ selector: "document", px: docOverflow });
  const scrollsX = (n) => ["auto", "scroll"].includes(getComputedStyle(n).overflowX);
  for (const element of visible) {
    const right = element.getBoundingClientRect().right;
    if (right <= innerWidth + 0.5) continue;
    const parent = element.parentElement;
    if (parent && visibleSet.has(parent) && parent.getBoundingClientRect().right > innerWidth + 0.5) continue;
    let scrolled = false;
    for (let n = element.parentElement; n && n !== document.body; n = n.parentElement) if (scrollsX(n)) scrolled = true;
    if (!scrolled) overflow.push({ selector: chain(element), px: r1(right - innerWidth) });
  }

  const controls = (scope ? [root, ...root.querySelectorAll(interactive)].filter(element => element.matches(interactive)) : [...document.querySelectorAll(interactive)]).filter(painted);
  const occluded = [];
  const targets = [];
  for (const element of controls) {
    const b = element.getBoundingClientRect();
    const area = cache.get(element);
    const width = area.right - area.left, height = area.bottom - area.top;
    if (b.width < 44 || b.height < 44) targets.push({ selector: chain(element), intrinsicSize: `${r1(b.width)}x${r1(b.height)}`, availableSize: `${r1(width)}x${r1(height)}`, clipped: width < b.width - 0.5 || height < b.height - 0.5 });
    const cx = Math.min((area.left + area.right) / 2, innerWidth - 1);
    const cy = Math.min((area.top + area.bottom) / 2, innerHeight - 1);
    const hit = document.elementFromPoint(cx, cy);
    const canvasReachable = element.tagName === "CANVAS" && [0.1, 0.5, 0.9].some((x) =>
      [0.1, 0.5, 0.9].some((y) => document.elementFromPoint(area.left + width * x, area.top + height * y) === element));
    if (!canvasReachable && (!hit || (hit !== element && !element.contains(hit)))) {
      occluded.push({ selector: chain(element), by: hit ? chain(hit).slice(0, 1) : "nothing", at: `${Math.round(cx)},${Math.round(cy)}` });
    }
  }
  const overlap = [];
  const surfaces = controls.filter((element) => element.tagName !== "CANVAS");
  for (let i = 0; i < surfaces.length; i += 1) {
    const a = surfaces[i];
    const ra = cache.get(a);
    for (let j = i + 1; j < surfaces.length; j += 1) {
      const b = surfaces[j];
      if (a.contains(b) || b.contains(a)) continue;
      const rb = cache.get(b);
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 0 && h > 0 && w * h > 4) overlap.push({ selector: chain(a), with: chain(b).slice(0, 1), areaPx2: Math.round(w * h) });
    }
  }

  const ownText = (element) => [...element.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
  const canvas = rootStyle.getPropertyValue("--color-canvas").trim() || "rgb(255, 255, 255)";
  const styled = [];
  const texts = [];
  const seen = new Set();
  for (const element of visible) {
    const c = getComputedStyle(element);
    const text = ownText(element);
    const sample = { selector: chain(element) };
    if (text) {
      sample.fontSize = c.fontSize;
      sample.lineHeight = c.lineHeight;
    }
    sample.radii = [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius];
    sample.boxShadow = c.boxShadow;
    styled.push(sample);
    if (!text) continue;
    const bgStack = [];
    for (let n = element; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = /^rgba?\(([^)]+)\)$/.exec(bg);
      if (!m) {
        bgStack.push(bg);
        break;
      }
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const alpha = p.length > 3 ? p[3] : 1;
      if (alpha <= 0) continue;
      bgStack.push(bg);
      if (alpha >= 1) break;
    }
    const key = `${c.color}|${c.fontSize}|${c.fontWeight}|${bgStack.join("/")}|${JSON.stringify(sample.selector)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    texts.push({ selector: sample.selector, fg: c.color, bgStack, fontSizePx: parseFloat(c.fontSize), fontWeight: c.fontWeight, sample: text.slice(0, 40) });
  }

  const siblingSets = [];
  for (const element of visible) {
    const kids = [...element.children].filter((k) => visibleSet.has(k));
    if (kids.length < 3) continue;
    siblingSets.push(
      kids.map((k) => {
        const b = k.getBoundingClientRect();
        const classes = typeof k.className === "string" ? k.className.trim().split(/\s+/).filter(Boolean).sort().join(" ") : "";
        return { selector: chain(k), classes: classes ? `${k.tagName}:${classes}` : "", top: b.top, height: b.height };
      }),
    );
  }

  const scrollEnd = [];
  for (const element of visible) {
    const c = getComputedStyle(element);
    if (!["auto", "scroll"].includes(c.overflowY) || element.scrollHeight <= element.clientHeight + 1) continue;
    const kids = [...element.children].filter((k) => k.getBoundingClientRect().height >= 1);
    if (!kids.length) continue;
    const before = element.scrollTop;
    element.scrollTop = element.scrollHeight;
    const last = kids.reduce((m, k) => (k.getBoundingClientRect().bottom > m.getBoundingClientRect().bottom ? k : m));
    const bottom = element.getBoundingClientRect().bottom - parseFloat(c.borderBottomWidth);
    const gap = bottom - last.getBoundingClientRect().bottom;
    element.scrollTop = before;
    if (gap < 8) scrollEnd.push({ selector: chain(element), gapPx: r1(gap) });
  }

  return { ramps, overflow, occluded, overlap, targets, styled, texts, canvas, siblingSets, scrollEnd, measuredElements: visible.length };
}

export async function auditPage(page, { width, rampNames, scope = "" }) {
  const raw = await page.evaluate(uiAuditProbe, { rampNames, interactive: INTERACTIVE, scope });
  return { ...judgeRaw(raw, { width }), measuredElements: raw.measuredElements };
}
