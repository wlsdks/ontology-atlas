/**
 * Loads the web font faces a canvas text needs from a CSS family list, and no others.
 *
 * `document.fonts.load(font, text)` loads every face of every listed family whose
 * `unicode-range` meets the text, so a stack that ends in the whole Pretendard file (no range)
 * would fetch its 2 MB for any text. Canvas text follows the browser's per-character fallback
 * instead: for each character, the first listed family with a face whose range holds it, and only
 * that family's covering faces. A family with no web face is an installed one, which ends the walk.
 */

type Range = readonly [number, number];

export interface GlyphFace {
  readonly family: string;
  readonly unicodeRange: string;
  readonly status: FontFaceLoadStatus;
  load(): Promise<unknown>;
}

const rangeCache = new WeakMap<GlyphFace, readonly Range[]>();

/** Parses a `unicode-range` value (`U+0-FF, U+131, U+4??`) into inclusive code point ranges. */
export function parseUnicodeRange(value: string): Range[] {
  const ranges: Range[] = [];
  for (const part of value.split(",")) {
    const match = /^\s*U\+([0-9a-f?]+)(?:-([0-9a-f]+))?\s*$/i.exec(part);
    if (!match) continue;
    const [, from, to] = match;
    if (from!.includes("?")) {
      ranges.push([parseInt(from!.replace(/\?/g, "0"), 16), parseInt(from!.replace(/\?/g, "f"), 16)]);
    } else {
      ranges.push([parseInt(from!, 16), parseInt(to ?? from!, 16)]);
    }
  }
  return ranges;
}

function rangesOf(face: GlyphFace): readonly Range[] {
  let ranges = rangeCache.get(face);
  if (!ranges) {
    ranges = parseUnicodeRange(face.unicodeRange || "U+0-10FFFF");
    rangeCache.set(face, ranges);
  }
  return ranges;
}

function unquote(name: string): string {
  return name.trim().replace(/^(["'])(.*)\1$/, "$2");
}

/** The faces a text draws from, per character the first listed family whose web faces cover it. */
export function facesForText(familyList: string, faces: Iterable<GlyphFace>, text: string): GlyphFace[] {
  const byFamily = new Map<string, GlyphFace[]>();
  for (const face of faces) {
    const family = unquote(face.family);
    const list = byFamily.get(family);
    if (list) list.push(face);
    else byFamily.set(family, [face]);
  }
  const families = familyList.split(",").map(unquote).filter(Boolean);
  const needed = new Set<GlyphFace>();
  const seen = new Set<number>();
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (seen.has(code)) continue;
    seen.add(code);
    for (const family of families) {
      const own = byFamily.get(family);
      if (!own) break;
      const covering = own.filter((face) => rangesOf(face).some(([from, to]) => code >= from && code <= to));
      if (covering.length === 0) continue;
      for (const face of covering) needed.add(face);
      break;
    }
  }
  return [...needed];
}

function documentFaces(): GlyphFace[] {
  const faces: GlyphFace[] = [];
  document.fonts.forEach((face) => faces.push(face));
  return faces;
}

/** Whether every face the text draws from has already loaded, so a measure now is final. */
export function productGlyphsLoaded(familyList: string, text: string): boolean {
  if (typeof document === "undefined" || !document.fonts) return true;
  return facesForText(familyList, documentFaces(), text).every((face) => face.status === "loaded");
}

/**
 * Loads the faces the text draws from and resolves whether all of them loaded. Pretendard's faces
 * are variable (`font-weight: 45 920`), so one face serves every weight on the ladder.
 */
export async function loadProductGlyphs(familyList: string, text: string): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;
  const faces = facesForText(familyList, documentFaces(), text);
  try {
    await Promise.all(faces.map((face) => (face.status === "loaded" ? null : face.load())));
  } catch {
    return false;
  }
  return faces.every((face) => face.status === "loaded");
}
