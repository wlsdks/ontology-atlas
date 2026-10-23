import type { DialScene } from "../types";
import type { FlowMarksInput } from "../flow-marks";
import { domainOfEnd } from "../links";

const branchPorts = new WeakMap<DialScene, Map<string, Map<string, number>>>();

export function branchPortFraction(input: FlowMarksInput, id: string, other: string): number {
  let ports = branchPorts.get(input.scene);
  if (!ports) {
    const peers = new Map<string, string[]>();
    for (const flow of input.model.flows) for (const [from, to] of [[flow.a, flow.b], [flow.b, flow.a]] as const) {
      const list = peers.get(from) ?? [];
      list.push(to);
      peers.set(from, list);
    }
    ports = new Map([...peers].map(([domain, list]) => {
      list.sort((a, b) => (input.scene.positions.get(a)?.y ?? 0) - (input.scene.positions.get(b)?.y ?? 0) || a.localeCompare(b));
      return [domain, new Map(list.map((peer, i) => [peer, list.length < 2 ? 0.5 : (i + 1) / (list.length + 1)]))];
    }));
    branchPorts.set(input.scene, ports);
  }
  return ports.get(id)?.get(domainOfEnd(input.model, other)) ?? 0.5;
}

