import { labelFontAt, scaledLabelFontSize } from "../../render/labels";
import type { DialKind, TextMark } from "../types";

const BODY_LG_PX = 14;

export function branchTextStyle(role: TextMark["role"], kind: DialKind, scale: number): { font: string; height: number } {
  const typeKind = role === "domain" ? "project" : role === "units" ? "capability" : kind;
  const height = role === "capability" || role === "more" ? BODY_LG_PX * scale : scaledLabelFontSize(typeKind, scale);
  return { font: labelFontAt(typeKind, height), height };
}
