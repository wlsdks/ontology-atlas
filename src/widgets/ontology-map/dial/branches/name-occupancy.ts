import type { DialFrameMarks, DialMarksInput } from "../frame/marks";
import { overlaps } from "../label-marks";
import type { Box, DialRowPick, TextMark } from "../types";

const isName = (text: TextMark) => text.role === "project" || text.role === "domain" || text.role === "capability" || text.role === "element";

// Claim text room independently of world row spacing.
export function settleBranchNames(input: DialMarksInput, out: DialFrameMarks, nameBoxes: Map<string, Box>, rows: DialRowPick[]): void {
  const active = new Set([input.focusedNodeId, input.attention.capabilityId ?? input.attention.domainId, input.hoveredNodeId, input.agentFocusNodeId, input.selectionPulse?.nodeId]);
  const priority = (text: TextMark) => active.has(text.id) ? 0 : text.role === "project" ? 1 : text.id === input.attention.domainId ? 2 : text.role === "domain" ? 3 : 4;
  const names = out.texts.filter(isName).sort((a, b) => priority(a) - priority(b));
  const accepted = new Set<TextMark>();
  const occupied: Box[] = [];
  const oldBoxes = new Set(names.map((text) => text.box));
  const inside = (box: Box) => box.minX >= input.freeRect.minX && box.maxX <= input.freeRect.maxX && box.minY >= input.freeRect.minY && box.maxY <= input.freeRect.maxY;
  for (const text of names) {
    const height = text.box.maxY - text.box.minY;
    const required = active.has(text.id) || text.role === "project";
    const original = { x: text.x, y: text.y };
    if (required) {
      const dx = Math.max(0, input.freeRect.minX - text.box.minX) - Math.max(0, text.box.maxX - input.freeRect.maxX);
      const dy = Math.max(0, input.freeRect.minY - text.box.minY) - Math.max(0, text.box.maxY - input.freeRect.maxY);
      text.x += dx;
      text.y += dy;
      text.box = { minX: text.box.minX + dx, maxX: text.box.maxX + dx, minY: text.box.minY + dy, maxY: text.box.maxY + dy };
    } else if (!inside(text.box)) continue;
    const offsets = required ? [0, ...Array.from({ length: Math.ceil(input.viewportHeight / height) }, (_, i) => [-(i + 1) * height, (i + 1) * height]).flat()] : [0];
    const offset = offsets.find((y) => {
      const candidate = { ...text.box, minY: text.box.minY + y, maxY: text.box.maxY + y };
      return inside(candidate) && !occupied.some((box) => overlaps(box, candidate));
    });
    if (offset === undefined && !required) continue;
    const dy = offset ?? 0;
    if (dy) {
      text.y += dy;
      text.box = { ...text.box, minY: text.box.minY + dy, maxY: text.box.maxY + dy };
    }
    if (text.x !== original.x || text.y !== original.y) out.leaders.push({ id: text.id!, x0: original.x, y0: original.y, x1: text.x, y1: text.y, ink: text.ink });
    accepted.add(text);
    occupied.push(text.box);
  }
  out.texts = out.texts.filter((text) => {
    if (isName(text)) return accepted.has(text);
    if (text.role === "units" || text.role === "more") return !names.some((name) => accepted.has(name) && name.id !== text.id && overlaps(name.box, text.box));
    return true;
  });
  nameBoxes.clear();
  for (const text of accepted) if (text.id) nameBoxes.set(text.id, text.box);
  const kept = rows.filter((row) => !oldBoxes.has(row.box));
  for (const text of accepted) if (text.id) kept.push({ id: text.id, box: text.box });
  rows.splice(0, rows.length, ...kept);
}
