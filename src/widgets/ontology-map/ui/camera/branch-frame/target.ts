import type { DialWorld } from "../../../dial/types";
import { branchMemberCount } from "../../../dial/branches/member-disclosure";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import type { TopologyWorld } from "../../world/topology-world";
import { realmCameraTarget } from "../../world/topology-realm-runtime";

/** Frame the disclosed branch, including room for its next action, without fitting hidden members. */
export function branchFocusTarget(world: TopologyWorld, dial: DialWorld | null | undefined, id: string, tokens: OntologyMapTokens, width: number, height: number) {
  const cluster = dial?.scene.branches ? dial.scene.clusterByDomain.get(id) : null;
  if (!dial || !cluster) return null;
  const count = branchMemberCount(dial.scene, id);
  const members = cluster.items.filter(item => !item.direct).slice(0, count);
  const points = [world.nodeById.get(id), ...members.map(item => world.nodeById.get(item.id))].filter(p => p !== undefined);
  if (!points.length) return null;
  const margin = tokens.radiusDomain * 2;
  const bounds = {
    minX: Math.min(...points.map(p => p.x)) - margin,
    maxX: Math.max(...points.map(p => p.x)) + margin,
    minY: Math.min(...points.map(p => p.y)) - margin,
    maxY: Math.max(...points.map(p => p.y)) + margin,
  };
  return realmCameraTarget(bounds, { ...tokens, cameraScaleMin: Math.min(tokens.cameraScaleMin, 0.02) }, width, height,
    { ...dial.overviewPadPx, bottom: dial.overviewPadPx.bottom + tokens.radiusCapability * 6 });
}
