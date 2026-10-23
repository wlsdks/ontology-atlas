import { labelFontAt, scaledLabelFontSize } from "../../render/labels";
import type { DialKind, TextMark } from "../types";

const BODY_LG_PX = 14;
const wrapped = new Map<string, readonly string[]>();

export function branchNameLines(value: string, font: string, width: number, measure: (text: string, font: string) => number): readonly string[] {
  const key = `${font}|${width}|${value}`;
  const hit = wrapped.get(key);
  if (hit) return hit;
  const lines: string[] = [];
  let line = "";
  for (const char of value) {
    if (line && measure(line + char, font) > width) {
      if (lines.length === 1) {
        while (line && measure(line + "…", font) > width) line = [...line].slice(0, -1).join("");
        line += "…";
        break;
      }
      const space = line.lastIndexOf(" ");
      if (space > line.length / 2) { lines.push(line.slice(0, space)); line = line.slice(space + 1) + char; }
      else { lines.push(line.trim()); line = char.trimStart(); }
    } else line += char;
  }
  if (line) lines.push(line);
  if (wrapped.size >= 512) wrapped.clear();
  wrapped.set(key, lines);
  return lines;
}

export function branchTextStyle(role: TextMark["role"], kind: DialKind, scale: number): { font: string; height: number } {
  const typeKind = role === "domain" ? "project" : role === "units" ? "capability" : kind;
  const height = role === "capability" || role === "more" ? BODY_LG_PX * scale : scaledLabelFontSize(typeKind, scale);
  return { font: labelFontAt(typeKind, height), height };
}
