import { useEffect, useState } from "react";

import { adoptBodyLabelFont, bodyLabelFontAdopted, bodyLabelFontSettled } from "@/widgets/ontology-map";

/** A font fetch that stalls past this lets the map open in the fallback face rather than stay blank. */
export const LABEL_FONT_WAIT_MS = 1_000;

export interface BodyLabelFont {
  /** The map may build: a layout measured now is the one it keeps. */
  ready: boolean;
  /** Names are measured in the product family. */
  adopted: boolean;
}

/**
 * Holds the map until the label font settles. Names size the Flat layout, and a layout measured in
 * another face is laid out again, so a map drawn before the font arrived would move every mark
 * after its first frame. A return visit finds the font settled and opens at once.
 */
export function useBodyLabelFont(): BodyLabelFont {
  const [font, setFont] = useState<BodyLabelFont>(() => ({ ready: bodyLabelFontSettled(), adopted: bodyLabelFontAdopted() }));
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
