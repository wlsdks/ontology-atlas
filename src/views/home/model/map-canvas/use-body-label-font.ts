import { useEffect, useState } from "react";

import { adoptBodyLabelFont, bodyLabelFontAdopted, bodyLabelFontSettled, type DialLabels, type OntologyMapNode } from "@/widgets/ontology-map";

export const LABEL_FONT_WAIT_MS = 1_000;

export interface BodyLabelFont {
  ready: boolean;
  adopted: boolean;
}

export function mapLabelText(nodes: readonly Pick<OntologyMapNode, "label">[], dialLabels?: DialLabels | null): string {
  const phrases = Object.values(dialLabels ?? {}).map((phrase: unknown) => (typeof phrase === "function" ? String(phrase(1, 2)) : ""));
  return [...nodes.map((node) => node.label), ...phrases].join(" ");
}

/**
 * Holds the map until the label font settles. Names size the Flat layout, and a layout measured in
 * another face is laid out again, so a map drawn before the font arrived would move every mark
 * after its first frame. A return visit finds the font settled and opens at once. `text` is what
 * the map will draw: the font loads only the faces its characters need, and the faces of
 * characters a later `text` adds.
 */
export function useBodyLabelFont(text = ""): BodyLabelFont {
  const [font, setFont] = useState<BodyLabelFont>(() => ({ ready: bodyLabelFontSettled(), adopted: bodyLabelFontAdopted() }));
  useEffect(() => {
    void adoptBodyLabelFont(text);
  }, [text]);
  useEffect(() => {
    if (bodyLabelFontSettled()) return;
    let live = true;
    const cap = setTimeout(() => {
      if (live) setFont((was) => (was.ready ? was : { ...was, ready: true }));
    }, LABEL_FONT_WAIT_MS);
    void adoptBodyLabelFont().then((adopted) => {
      clearTimeout(cap);
      if (live) setFont({ ready: true, adopted });
    });
    return () => {
      live = false;
      clearTimeout(cap);
    };
  }, []);
  return font;
}
