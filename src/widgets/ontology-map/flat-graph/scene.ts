import type { DialPlacementState } from "../dial/placement";
import type { DialCluster, DialItem, DialModel, DialScene, Point } from "../dial/types";
import { directItemId, layoutFlatGraph } from "./layout";
import { byId } from "./seed";
import type { FlatGraphFrame, FlatGraphLayout, FlatGraphLayoutTokens, FlatGraphMemory, FlatGraphPins } from "./types";

let remembered: FlatGraphMemory | null = null;
let rememberedFolder: string | null = null;

/**
 * A different folder forgets the session's positions, so one folder never pins another; that
 * includes the bundled map shown before any folder was claimed.
 */
export function claimFlatGraphFolder(folder: string): void {
  if (rememberedFolder !== folder) remembered = null;
  rememberedFolder = folder;
}

function domainSignature(model: DialModel, domainId: string): string {
  const d = model.domainById.get(domainId)!;
  const caps = [...d.capabilityIds].sort(byId).map((id) => `${id}(${[...(model.capabilityById.get(id)?.elementIds ?? [])].sort(byId).join(",")})`);
  return `${caps.join(";")}|${[...d.directElementIds].sort(byId).join(",")}`;
}

/**
 * Positions this session already showed: an unchanged domain keeps its own and its members'
 * places, a changed one starts its single re-run from where it stood. Pins are not stored yet.
 */
export function flatGraphPins(model: DialModel): FlatGraphPins | null {
  const memory = remembered;
  if (memory === null) return null;
  const positions = new Map<string, Point>();
  const seeds = new Map<string, Point>();
  for (const d of model.domains) {
    const was = memory.positions.get(d.id);
    const signature = memory.signatureByDomain.get(d.id);
    if (!was || signature === undefined) continue;
    if (signature !== domainSignature(model, d.id)) {
      seeds.set(d.id, was);
      continue;
    }
    positions.set(d.id, was);
    for (const id of d.capabilityIds) {
      const at = memory.positions.get(id);
      if (at) positions.set(id, at);
    }
    const direct = memory.positions.get(directItemId(d.id));
    if (direct) positions.set(directItemId(d.id), direct);
  }
  return { positions, seeds, hueByDomain: memory.hueByDomain };
}

/**
 * Remembers a graph only once its folder has settled: a provisional build mid-read never pins the
 * next one, so a streamed read and a one-shot open of the same folder land on the same picture.
 */
export function settleFlatGraph(model: DialModel, layout: FlatGraphLayout, state: DialPlacementState): void {
  if (state === "settled") rememberFlatGraph(model, layout);
}

function rememberFlatGraph(model: DialModel, layout: FlatGraphLayout): void {
  const positions = new Map([...layout.positions, ...layout.itemAt]);
  remembered = {
    positions,
    signatureByDomain: new Map(model.domains.map((d) => [d.id, domainSignature(model, d.id)])),
    hueByDomain: layout.hueByDomain,
  };
}

export function buildFlatGraphScene(model: DialModel, order: readonly string[], tokens: FlatGraphLayoutTokens, pins: FlatGraphPins | null, frame: FlatGraphFrame | null = null): DialScene {
  const graph = layoutFlatGraph(model, order, tokens, pins, frame);
  const itemById = new Map<string, DialItem>();
  const clusters: DialCluster[] = graph.clusters.map((c) => {
    const items = c.items.map((it) => {
      const at = graph.itemAt.get(it.id)!;
      const item: DialItem = { id: it.id, direct: it.direct, x: at.x, y: at.y, elementIds: [...it.elementIds], elementPitch: tokens.elementPitch };
      itemById.set(it.id, item);
      return item;
    });
    return { domainId: c.domainId, step: 0, angle: Math.atan2(c.centre.y, c.centre.x), chip: c.centre, footprint: c.footprint, items };
  });
  const orphanCentre = graph.orphanIds.length > 0 ? graph.positions.get(graph.orphanIds[0]!)! : { x: 0, y: 0 };
  return {
    graph,
    order: [...order],
    rings: [],
    clusters,
    clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])),
    itemById,
    orphans: { ids: [...graph.orphanIds], centre: orphanCentre, pitch: tokens.orphanPitch, radius: tokens.orphanPitch * Math.sqrt(graph.orphanIds.length) },
    axisAngle: 0,
    extent: graph.extent,
    positions: graph.positions,
    medianElementPitch: tokens.elementPitch,
    memory: { order: [...order], radiusByStep: new Map(), angleById: new Map(), itemOrder: new Map() },
  };
}
