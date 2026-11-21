import {
  readContainmentTree,
  directRelations,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesCapabilityPairs,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../../../model/containment-tree";
import { buildDialModel } from "../../../dial/dial-model";
import { dialOverviewPad } from "../../../dial/fit";
import { layoutDial } from "../../../dial/layout";
import { circularDomainOrder, rememberDialOrder, rememberedDialOrder } from "../../../dial/order";
import type { DialModel, DialWorld, DialWorldInput } from "../../../dial/types";
import { domainTitleBlocks, hubBlockReachPx } from "../../../flat-graph/names/titles";
import type { LayoutSteps } from "../../../flat-graph/layout";
import { buildFlatGraphSceneSteps, flatGraphPins } from "../../../flat-graph/scene";
import { labelFontFamily } from "../../../render/labels";
import type { OntologyMapEdge, OntologyMapNode } from "../../OntologyMap";

const DIAL_KINDS: ReadonlySet<string> = new Set(["project", "domain", "capability", "element"]);

export function* buildDialWorld(
  nodes: readonly OntologyMapNode[],
  edges: readonly OntologyMapEdge[],
  input: DialWorldInput,
  placeDial: ((model: DialModel) => DialModel) | null): LayoutSteps<DialWorld | null> {
  const treeNodes: TreeInputNode[] = [];
  for (const n of nodes) if (DIAL_KINDS.has(n.kind)) treeNodes.push({ id: n.id, label: n.label, kind: n.kind });
  if (!treeNodes.some((n) => n.kind === "domain")) return null;
  const treeEdges: TreeInputEdge[] = edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType }));
  const tree = readContainmentTree(treeNodes, treeEdges);
  yield;
  const dependencies = rollDomainDependencies(tree, treeEdges);
  const flows = rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges));
  const elementIds = treeNodes.filter((n) => n.kind === "element").map((n) => n.id);
  yield;
  const built = buildDialModel({ tree, dependencies, flows, elementIds, relates: rollRelatesCapabilityPairs(tree, treeEdges), direct: directRelations(treeEdges) });
  const model = placeDial ? placeDial(built) : built;
  const remember = input.rememberOrder && model.domains.length > 0;
  if (input.graph) {
    yield;
    const paint = input.graph.paint;
    const face = labelFontFamily();
    const title = { model, tokens: paint, labels: input.labels, measureText: input.measureText, fontFamily: face };
    const titles = domainTitleBlocks(title);
    yield;
    const compactTitles = domainTitleBlocks(title, "name");
    yield;
    const scene = yield* buildFlatGraphSceneSteps(model, input.graph.layout, flatGraphPins(model, face), { areaPx: input.graphAreaPx ?? null, titles, compactTitles, capDiscPx: paint.capDiscMaxPx, hubPx: hubBlockReachPx({ model, tokens: paint }) });
    if (remember) rememberDialOrder(scene.order);
    const pad = paint.domainNamePx;
    return { model, scene, overviewPadPx: { left: pad, right: pad, top: pad, bottom: pad }, labels: input.labels };
  }
  const { order } = circularDomainOrder(model, input.memory?.order ?? rememberedDialOrder());
  if (remember) rememberDialOrder(order);
  const scene = layoutDial(model, order, input.tokens, input.memory);
  return { model, scene, overviewPadPx: dialOverviewPad(scene, model, input.labels, input.measureText, input.tokens) };
}
