import { createMeasureText } from "../../../dial/fit";
import { branchMemberCount } from "../../../dial/branches/member-disclosure";
import { branchNameLines, branchTextStyle } from "../../../dial/branches/text";
import { readDialTokens } from "../../../dial/tokens";
import type { DialWorld } from "../../../dial/types";
import { SELECTION_NUDGE_MARGIN_PX } from "../../../model/camera/flat-selection-camera";
import type { TopologyWorld } from "../../world/topology-world";
import { capabilityLines, reachCounts } from "../../../flat-graph/attention";
import { selectedBlockReachPx, selectedDiscRadius } from "../../../flat-graph/names";
import { readFlatGraphTokens } from "../../../flat-graph/tokens";
import { labelFontFamily } from "../../../render/labels";

const GRAPH_SELECTION_AIR_PX = 16;

/**
 * On the Flat graph a selected capability, element or orphan is named large beside its disc with
 * its reach beneath, on either side; the slide leaves room for that block on both.
 */
function graphSelectionMargin(world: TopologyWorld, dial: DialWorld, id: string) {
  const { model } = dial;
  const node = world.nodeById.get(id);
  if (!node || id === model.projectId || model.domainById.has(id)) return SELECTION_NUDGE_MARGIN_PX;
  const paint = readFlatGraphTokens().paint;
  const reach = model.capabilityById.has(id) ? reachCounts(capabilityLines(model, id)) : null;
  const disc = selectedDiscRadius(0, paint, paint.growthMax);
  const side = selectedBlockReachPx({ tokens: paint, labels: dial.labels ?? null, measureText: createMeasureText(), fontFamily: labelFontFamily() }, node.label, reach, disc);
  const margin = Math.max(SELECTION_NUDGE_MARGIN_PX, side + GRAPH_SELECTION_AIR_PX);
  return { left: margin, right: margin };
}

/** Reserve the intended label positions, before collision handling clamps their painted boxes. */
export function branchSelectionMargin(world: TopologyWorld, dial: DialWorld | null | undefined, id: string, scale: number, freeWidth: number) {
  if (dial?.scene.graph) return graphSelectionMargin(world, dial, id);
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
