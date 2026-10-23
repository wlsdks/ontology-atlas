import { createMeasureText } from "../../../dial/fit";
import { branchMemberCount } from "../../../dial/branches/member-disclosure";
import { branchNameLines, branchTextStyle } from "../../../dial/branches/text";
import { readDialTokens } from "../../../dial/tokens";
import type { DialWorld } from "../../../dial/types";
import { SELECTION_NUDGE_MARGIN_PX } from "../../../model/camera/flat-selection-camera";
import type { TopologyWorld } from "../../world/topology-world";

/** Reserve the intended label positions, before collision handling clamps their painted boxes. */
export function branchSelectionMargin(world: TopologyWorld, dial: DialWorld | null | undefined, id: string, scale: number, freeWidth: number) {
  const focus = world.nodeById.get(id);
  const cluster = dial?.scene.branches ? dial.scene.clusterByDomain.get(dial.model.domainOf.get(id) ?? id) : null;
  if (!dial || !cluster || !focus) return SELECTION_NUDGE_MARGIN_PX;
  const tokens = readDialTokens();
  const measure = createMeasureText();
  const { font } = branchTextStyle("capability", "capability", tokens.labelScale);
  const count = branchMemberCount(dial.scene, cluster.domainId);
  const members = cluster.items.filter(item => !item.direct).slice(0, count);
  const ids = new Set([cluster.domainId, id, ...members.map(item => item.id)]);
  const ranges: { id: string; left: number; right: number }[] = [];
  for (const member of ids) {
    const node = world.nodeById.get(member);
    if (!node) continue;
    const x = (node.x - focus.x) * scale;
    if (member === cluster.domainId) {
      const half = (tokens.nameMaxPx + tokens.ledgerGapPx) / 2;
      ranges.push({ id: member, left: x - half, right: x + half });
    } else {
      const lines = branchNameLines(node.label, font, tokens.nameMaxPx, measure);
      const name = Math.max(...lines.map(line => measure(line, font)));
      const gap = tokens.discGlyphPx * 2 + tokens.chipMinPx;
      ranges.push({ id: member, left: x - (cluster.branchSide === -1 ? gap + name : gap), right: x + (cluster.branchSide === -1 ? gap : gap + name) });
    }
  }
  const margins = (items: typeof ranges, air = SELECTION_NUDGE_MARGIN_PX) => ({
    left: Math.max(air, -Math.min(...items.map(p => p.left)) + air),
    right: Math.max(air, Math.max(...items.map(p => p.right)) + air),
  });
  const whole = margins(ranges);
  return whole.left + whole.right <= freeWidth ? whole : margins(ranges.filter(p => p.id === id), freeWidth >= 400 ? SELECTION_NUDGE_MARGIN_PX : 24);
}
