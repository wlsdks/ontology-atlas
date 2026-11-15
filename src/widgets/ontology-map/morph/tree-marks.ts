import type { MapLayoutMark } from "@/shared/lib/map-canvas/map-layout-morph-store";
import { createTreeProjector, TREE_POSE_REST } from "../model/tree-view/tree-camera";
import { layoutTree } from "../model/tree-view/tree-layout";
import { buildTreeModel } from "../model/tree-view/tree-model";
import { trunkBlockReservePx } from "../model/tree-view/tree-names";
import type { TreeDrawList, TreeDrawMark, TreeModel } from "../model/tree-view/types";
import { readTreeTokens, type TreeTokens } from "../tokens/read-tree-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { cutTreeAtPose, readTreeFreeArea, treeFitRect } from "../ui/tree-view/use-tree-frame";
import type { MapLayoutTarget } from "./MapLayoutMorphOverlay";

function treeMark(id: string, mark: TreeDrawMark, model: TreeModel, tokens: TreeTokens): MapLayoutMark {
  const kind = model.kinds[mark.node];
  const fill = (kind === "project" ? tokens.tones.project : tokens.tones.mark)[mark.tone]!;
  return {
    id,
    x: mark.x,
    y: mark.y,
    size: mark.radius,
    shape: "disc",
    fill,
    stroke: kind === "domain" ? fill : tokens.inks.discFill,
    alpha: 1,
  };
}

/**
 * One mark per concept the tree shows: its own drawn mark, or the closed mark it is folded in, so
 * positions never outnumber the draw list. A concept culled from view has none. O(model.count).
 */
export function treeMarks(list: TreeDrawList, model: TreeModel, tokens: TreeTokens): MapLayoutMark[] {
  const holder = new Int32Array(model.count).fill(-1);
  for (let i = 0; i < list.count; i += 1) holder[list.marks[i]!.node] = i;
  const out: MapLayoutMark[] = [];
  for (let node = 0; node < model.count; node += 1) {
    const own = holder[node]!;
    const parent = model.parent[node]!;
    if (own < 0 && parent >= 0) holder[node] = holder[parent]!;
    const at = holder[node]!;
    const id = model.ids[node];
    if (at < 0 || id == null) continue;
    const mark = list.marks[at]!;
    if (own >= 0 || mark.closed) out.push(treeMark(id, mark, model, tokens));
  }
  return out;
}

function readTreeTokensOrNull(): TreeTokens | null {
  try {
    return readTreeTokens();
  } catch {
    return null;
  }
}

/** The tree's footer band from the canvas bottom: its 16 px inset and the 48 px its footer keeps for a one- or two-line legend. */
const TREE_FOOTER_BAND_PX = 64;
/** The mounted tree always gives a named trunk a meta line; only its presence sizes the reserve. */
const trunkMetaPresent = (node: number) => (node === 0 ? "meta" : null);

/**
 * The marks the tree draws at its rest pose over `host`, through the tree's own pipeline. Its
 * legend is not mounted yet, so the footer band stands in for the legend's measured top.
 */
export function predictTreeTarget(
  nodes: readonly OntologyMapNode[],
  edges: readonly OntologyMapEdge[],
  host: HTMLCanvasElement,
): MapLayoutTarget | null {
  const tokens = readTreeTokensOrNull();
  const box = host.getBoundingClientRect();
  if (!tokens || box.width <= 0 || box.height <= 0) return null;
  const free = readTreeFreeArea(host, host, box.height - TREE_FOOTER_BAND_PX);
  if (!free) return null;
  const model = buildTreeModel(nodes, edges);
  const layout = layoutTree(model);
  const list: TreeDrawList = { marks: [], count: 0, visited: 0, folded: 0 };
  const fit = treeFitRect(free, trunkBlockReservePx(model, trunkMetaPresent, tokens.names, tokens.marks.project));
  cutTreeAtPose(layout, tokens, TREE_POSE_REST, { width: box.width, height: box.height }, fit, [], createTreeProjector(), list);
  return { marks: treeMarks(list, model, tokens), ground: tokens.inks.ground };
}
