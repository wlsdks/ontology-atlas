import { useEffect, useMemo, useState } from "react";
import { hexFonts } from "../../render/hex-board";
import { productFontFamily } from "../../render/labels";
import { loadProductGlyphs, productGlyphsLoaded } from "../../render/product-glyphs";
import type { HexMeasure, HexTextRole } from "./hex-board";

let measureContext: CanvasRenderingContext2D | null = null;
function measureText(text: string, role: HexTextRole): number {
  if (typeof document === "undefined") return text.length * 7;
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 7;
  measureContext.font = hexFonts()[role];
  return measureContext.measureText(text).width;
}

/**
 * The board's text measure, as a new function once the product faces its text draws from have
 * loaded (see `hexFonts`, `product-glyphs.ts`). Until then the names are measured in the system
 * stack behind it; the new identity re-measures the names floor and repaints, so the band is
 * decided in the face drawn. A text with new characters loads their faces the same way.
 */
export function useHexMeasure(text: string): HexMeasure {
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    const family = productFontFamily();
    if (family === null || typeof document === "undefined" || !document.fonts || productGlyphsLoaded(family, ` ${text}`)) return;
    let live = true;
    const done = () => {
      if (live) setLoaded((count) => count + 1);
    };
    void loadProductGlyphs(family, ` ${text}`).then(done, done);
    return () => {
      live = false;
    };
  }, [text]);
  return useMemo<HexMeasure>(() => (loaded > 0 ? (text, role) => measureText(text, role) : measureText), [loaded]);
}
