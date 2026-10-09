import { judgeRaw } from "./ui-audit-checks.mjs";

const INTERACTIVE = 'a[href],button,input,select,textarea,[role=button],[role=tab],[tabindex]:not([tabindex="-1"])';
export const FREEZE_CSS = "*,*::before,*::after{transition:none!important;animation:none!important}";

function uiAuditProbe({ rampNames, interactive }) {
  const chain = (el) => {
    const out = [];
    for (let n = el; n && out.length < 4 && n !== document.documentElement; n = n.parentElement) {
      const cls = typeof n.className === "string" ? n.className.trim().split(/\s+/).filter(Boolean) : [];
      out.push({ tag: n.tagName.toLowerCase(), id: n.id || "", classes: cls });
    }
    return out;
  };
  const cache = new Map();
  const painted = (el) => {
    if (cache.has(el)) return cache.get(el);
    const c = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    let ok = b.width >= 1 && b.height >= 1 && c.visibility !== "hidden" && c.display !== "none" && Number(c.opacity) >= 0.05;
    if (ok && el.closest("details:not([open])")) ok = false;
    for (let n = el.parentElement; ok && n && n !== document.body; n = n.parentElement) {
      const nc = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (nc.overflow !== "visible" && (b.bottom < r.top || b.top > r.bottom)) ok = false;
      if (nc.contentVisibility === "hidden" || n.hasAttribute("inert") || Number(nc.opacity) < 0.05) ok = false;
    }
    ok = ok && b.top < innerHeight && b.bottom > 0 && b.left < innerWidth && b.right > 0;
    cache.set(el, ok);
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

  const all = [...document.body.querySelectorAll("*")].filter((el) => !["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName));
  const visible = all.filter(painted);
  const visibleSet = new Set(visible);

  const docOverflow = document.documentElement.scrollWidth - innerWidth;
  const overflow = [];
  if (docOverflow > 0) overflow.push({ selector: "document", px: docOverflow });
  const scrollsX = (n) => ["auto", "scroll"].includes(getComputedStyle(n).overflowX);
  for (const el of visible) {
    const right = el.getBoundingClientRect().right;
    if (right <= innerWidth + 0.5) continue;
    const parent = el.parentElement;
    if (parent && visibleSet.has(parent) && parent.getBoundingClientRect().right > innerWidth + 0.5) continue;
    let scrolled = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (scrollsX(n)) scrolled = true;
    if (!scrolled) overflow.push({ selector: chain(el), px: r1(right - innerWidth) });
  }

  const controls = [...document.querySelectorAll(interactive)].filter(painted);
  const occluded = [];
  const targets = [];
  for (const el of controls) {
    const b = el.getBoundingClientRect();
    if (b.width < 44 || b.height < 44) targets.push({ selector: chain(el), size: `${r1(b.width)}x${r1(b.height)}` });
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || (hit !== el && !el.contains(hit))) {
      occluded.push({ selector: chain(el), by: hit ? chain(hit).slice(0, 1) : "nothing", at: `${Math.round(cx)},${Math.round(cy)}` });
    }
  }
  const overlap = [];
  const surfaces = controls.filter((el) => el.tagName !== "CANVAS");
  for (let i = 0; i < surfaces.length; i += 1) {
    const a = surfaces[i];
    const ra = a.getBoundingClientRect();
    for (let j = i + 1; j < surfaces.length; j += 1) {
      const b = surfaces[j];
      if (a.contains(b) || b.contains(a)) continue;
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 0 && h > 0 && w * h > 4) overlap.push({ selector: chain(a), with: chain(b).slice(0, 1), areaPx2: Math.round(w * h) });
    }
  }

  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
  const canvas = rootStyle.getPropertyValue("--color-canvas").trim() || "rgb(255, 255, 255)";
  const styled = [];
  const texts = [];
  const seen = new Set();
  for (const el of visible) {
    const c = getComputedStyle(el);
    const text = ownText(el);
    const sample = { selector: chain(el) };
    if (text) {
      sample.fontSize = c.fontSize;
      sample.lineHeight = c.lineHeight;
    }
    sample.radii = [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius];
    sample.boxShadow = c.boxShadow;
    styled.push(sample);
    if (!text) continue;
    const bgStack = [];
    for (let n = el; n; n = n.parentElement) {
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
  for (const el of visible) {
    const kids = [...el.children].filter((k) => visibleSet.has(k));
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
  for (const el of visible) {
    const c = getComputedStyle(el);
    if (!["auto", "scroll"].includes(c.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
    const kids = [...el.children].filter((k) => k.getBoundingClientRect().height >= 1);
    if (!kids.length) continue;
    const before = el.scrollTop;
    el.scrollTop = el.scrollHeight;
    const last = kids.reduce((m, k) => (k.getBoundingClientRect().bottom > m.getBoundingClientRect().bottom ? k : m));
    const bottom = el.getBoundingClientRect().bottom - parseFloat(c.borderBottomWidth);
    const gap = bottom - last.getBoundingClientRect().bottom;
    el.scrollTop = before;
    if (gap < 8) scrollEnd.push({ selector: chain(el), gapPx: r1(gap) });
  }

  return { ramps, overflow, occluded, overlap, targets, styled, texts, canvas, siblingSets, scrollEnd };
}

export async function auditPage(page, { width, rampNames }) {
  const raw = await page.evaluate(uiAuditProbe, { rampNames, interactive: INTERACTIVE });
  return judgeRaw(raw, { width });
}
