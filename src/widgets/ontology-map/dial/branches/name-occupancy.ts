import type { DialFrameMarks, DialMarksInput } from "../frame/marks";
import { crossesBox, overlaps } from "../label-marks";
import type { Box, DialRowPick, Point, TextMark } from "../types";

const isName = (text: TextMark) => text.role === "project" || text.role === "domain" || text.role === "capability" || text.role === "element";

const centreOf = (box: Box) => ({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
const shifted = (box: Box, x: number, y: number): Box => ({ minX: x, maxX: box.maxX + (x - box.minX), minY: y, maxY: box.maxY + (y - box.minY) });
function edgeToward(box: Box, target: Point): Point {
  const centre = centreOf(box);
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  const t = Math.min((box.maxX - box.minX) / 2 / Math.max(1e-6, Math.abs(dx)), (box.maxY - box.minY) / 2 / Math.max(1e-6, Math.abs(dy)));
  return { x: centre.x + dx * t, y: centre.y + dy * t };
}

// Claim text room independently of world row spacing.
export function settleBranchNames(input: DialMarksInput, out: DialFrameMarks, nameBoxes: Map<string, Box>, rows: DialRowPick[]): void {
  const partners = input.attention.capabilityId === null ? [] : [...input.attention.needsCaps, ...input.attention.usedByCaps, ...input.attention.relatesCaps];
  const active = new Set([...(input.requiredBranchIds ?? []), ...partners, input.focusedNodeId, input.attention.capabilityId ?? input.attention.domainId, input.hoveredNodeId, input.agentFocusNodeId, input.selectionPulse?.nodeId]);
  const members = new Set(out.texts.filter((text) => text.role === "capability" && input.attention.domainId != null && input.model?.capabilityById.get(text.id!)?.domainId === input.attention.domainId));
  const children = new Set(out.texts.filter((text) => {
    if (text.role !== "element") return false;
    const domain = input.model?.domainOf.get(text.id!);
    return domain != null && (domain === input.attention.domainId || !input.model.capabilityOf.has(text.id!));
  }));
  const actionRows = new Map(rows.filter((row) => row.action?.domainId === input.attention.domainId).map((row) => [row.box, row]));
  const controls = new Set(out.texts.filter((text) => text.role === "more" && actionRows.has(text.box)));
  const priority = (text: TextMark) => active.has(text.id) && !controls.has(text) ? 0 : text.role === "project" ? 1 : controls.has(text) || text.id === input.attention.domainId ? 2 : members.has(text) ? 3 : text.role === "domain" ? 4 : children.has(text) ? 5 : 6;
  const names = out.texts.filter(isName);
  const placing = [...names, ...controls].sort((a, b) => priority(a) - priority(b));
  const accepted = new Set<TextMark>();
  const occupied: Box[] = [];
  const bodies = [
    ...out.glyphs.map((mark) => {
      const radius = mark.r + (mark.egoState === "center" || mark.agentFocus ? input.tokens.chipMinPx : 0);
      return { id: mark.id, box: { minX: mark.x - radius, maxX: mark.x + radius, minY: mark.y - radius, maxY: mark.y + radius } };
    }),
    ...out.discs.map((mark) => ({ id: mark.id, box: { minX: mark.x - mark.r, maxX: mark.x + mark.r, minY: mark.y - mark.r, maxY: mark.y + mark.r } })),
    ...out.squares.map((mark) => ({ id: mark.id, box: { minX: mark.x - mark.half, maxX: mark.x + mark.half, minY: mark.y - mark.half, maxY: mark.y + mark.half } })),
  ];
  const containment = (out.stems ?? []).map(({ a, c, b }) => {
    const points = Array.from({ length: 33 }, (_, i) => {
      const t = i / 32;
      return { x: (1 - t) ** 2 * a.x + 2 * t * (1 - t) * c.x + t ** 2 * b.x, y: (1 - t) ** 2 * a.y + 2 * t * (1 - t) * c.y + t ** 2 * b.y };
    });
    return { points, box: { minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)) } };
  });
  const cards = (out.blocks ?? []).filter((block) => block.alpha > 0.01);
  const oldBoxes = new Set(names.map((text) => text.box));
  const inside = (box: Box) => box.minX >= input.freeRect.minX && box.maxX <= input.freeRect.maxX && box.minY >= input.freeRect.minY && box.maxY <= input.freeRect.maxY;
  for (const text of placing) {
    const height = text.box.maxY - text.box.minY;
    const width = text.box.maxX - text.box.minX;
    const control = controls.has(text);
    const required = !control && (active.has(text.id) || text.role === "project");
    const movable = required || members.has(text) || children.has(text) || control || text.role === "domain";
    const original = { x: text.x, y: text.y };
    const originalBox = text.box;
    const clamp = (box: Box) => shifted(box,
      Math.max(input.freeRect.minX, Math.min(input.freeRect.maxX - width, box.minX)),
      Math.max(input.freeRect.minY, Math.min(input.freeRect.maxY - height, box.minY)));
    const initial = required || control ? clamp(originalBox) : originalBox;
    if (!required && !members.has(text) && !children.has(text) && !control && (!inside(initial) || occupied.some((box) => overlaps(box, initial)))) continue;
    const body = control ? undefined : bodies.find((mark) => mark.id === text.id)?.box;
    const gap = input.tokens.chipMinPx;
    const side = text.role === "domain" && !cards.some((card) => card.id === text.id && card.alpha >= 0.5) ? input.scene?.clusterByDomain.get(text.id!)?.branchSide : undefined;
    const clear = (box: Box) => inside(box)
      && (!side || !body || (side < 0 ? box.maxX <= body.minX - gap : box.minX >= body.maxX + gap))
      && (text.role !== "element" || !containment.some((stem) => overlaps(stem.box, box) && crossesBox([stem.points], box)))
      && !occupied.some((other) => overlaps(other, box))
      && !bodies.some((mark) => overlaps(mark.box, box))
      && !cards.some((card) => {
        if (!overlaps(card.box, box)) return false;
        const own = card.id === text.id && (text.role === "domain" || text.role === "project");
        return !own || box.minX < card.box.minX || box.maxX > card.box.maxX || box.minY < card.box.minY || box.maxY > card.box.maxY;
      });
    function* candidates(): Generator<Box> {
      yield initial;
      if (!movable) return;
      const anchors = [initial];
      if (body) {
        const left = shifted(initial, body.minX - gap - width, initial.minY);
        const right = shifted(initial, body.maxX + gap, initial.minY);
        const preferred = centreOf(originalBox).x < centreOf(body).x ? [left, right] : [right, left];
        yield* preferred;
        const centre = clamp(shifted(initial, centreOf(body).x - width / 2, initial.minY));
        const vertical = [shifted(centre, centre.minX, body.minY - gap - height), shifted(centre, centre.minX, body.maxY + gap)];
        yield* vertical;
        anchors.push(...preferred, ...vertical);
      }
      anchors.push(shifted(initial, input.freeRect.minX, initial.minY), shifted(initial, input.freeRect.maxX - width, initial.minY));
      const steps = required || text.role === "domain" ? Math.ceil(input.viewportHeight / height) : Math.min(12, Math.ceil(input.viewportHeight / height));
      for (let step = 1; step <= steps; step++) {
        for (const anchor of anchors) {
          yield shifted(anchor, anchor.minX, anchor.minY - step * height);
          yield shifted(anchor, anchor.minX, anchor.minY + step * height);
        }
      }
    }
    let chosen: Box | undefined;
    for (const candidate of candidates()) if (clear(candidate)) { chosen = candidate; break; }
    if (!chosen && !required) continue;
    const box = chosen ?? initial;
    text.x += box.minX - originalBox.minX;
    text.y += box.minY - originalBox.minY;
    text.box = box;
    if (control) actionRows.get(originalBox)!.box = box;
    if (text.x !== original.x || text.y !== original.y) {
      const start = body ? edgeToward(body, centreOf(box)) : original;
      const end = edgeToward(box, start);
      out.leaders.push({ id: text.id!, x0: start.x, y0: start.y, x1: end.x, y1: end.y, ink: text.ink });
    }
    accepted.add(text);
    occupied.push(text.box);
  }
  out.texts = out.texts.filter((text) => {
    if (isName(text) || controls.has(text)) return accepted.has(text);
    if ((text.role === "units" || text.role === "more" || text.role === "status") && !inside(text.box)) return false;
    if (text.role === "units" || text.role === "more") return !names.some((name) => accepted.has(name) && name.id !== text.id && overlaps(name.box, text.box));
    return true;
  });
  nameBoxes.clear();
  for (const text of names) if (accepted.has(text) && text.id) nameBoxes.set(text.id, text.box);
  const actions = rows.filter((row) => row.action && out.texts.some((text) => text.box === row.box));
  const kept = rows.filter((row) => !row.action && !oldBoxes.has(row.box));
  for (const text of names) if (accepted.has(text) && text.id) kept.push({ id: text.id, box: text.box });
  rows.splice(0, rows.length, ...kept, ...actions);
}
