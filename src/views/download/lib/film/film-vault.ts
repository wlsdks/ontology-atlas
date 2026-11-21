import { isContainmentRelation, isDirectionalRelation } from '@/entities/knowledge-graph';

import type { StageGraph } from '../stage-graph';

export type FilmKind = 'project' | 'domain' | 'capability' | 'element';

/** One concept as the film draws it: its file, the domain it sits in and what it holds. */
export interface FilmConcept {
  id: string;
  kind: FilmKind;
  label: string;
  /** The vault path's last part, `vault-graph-query`. */
  slug: string;
  /** `<kind>s/<slug>.md`, the file's path under `docs/ontology/`. */
  path: string;
  /** The domain it sits in; null for the project, its own id for a domain. */
  domain: string | null;
  /** The capability that holds an element; null otherwise. */
  capability: string | null;
  /** A capability's elements, in the order the vault lists them. */
  elements: string[];
}

/** The bundled vault reduced to what the film draws: who holds whom, and the relations between them. */
export interface FilmVault {
  project: FilmConcept | null;
  /** Each kind sorted by id, so every build draws the same picture. */
  domains: FilmConcept[];
  capabilities: FilmConcept[];
  elements: FilmConcept[];
  byId: ReadonlyMap<string, FilmConcept>;
  /** `[from, to]`: `from` depends on `to`. */
  dependencies: readonly (readonly [string, string])[];
  /** Undirected `relates` pairs. */
  relates: readonly (readonly [string, string])[];
  /** Every relation the vault writes, containment included. */
  relationCount: number;
}

const KIND_DIR: Record<FilmKind, string> = {
  project: 'projects',
  domain: 'domains',
  capability: 'capabilities',
  element: 'elements',
};

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function readFilmVault(graph: StageGraph): FilmVault {
  const concepts = new Map<string, FilmConcept>();
  for (const node of graph.nodes) {
    const slug = node.id.split(/[:/]/).pop() ?? node.id;
    concepts.set(node.id, {
      id: node.id,
      kind: node.kind as FilmKind,
      label: node.label,
      slug,
      path: `${KIND_DIR[node.kind as FilmKind] ?? `${node.kind}s`}/${slug}.md`,
      domain: node.kind === 'domain' ? node.id : null,
      capability: null,
      elements: [],
    });
  }
  const dependencies: [string, string][] = [];
  const relates: [string, string][] = [];
  for (const edge of graph.edges) {
    const from = concepts.get(edge.source);
    const to = concepts.get(edge.target);
    if (!from || !to || from === to) continue;
    if (isContainmentRelation(edge.relationType)) {
      if (from.kind === 'domain' && to.kind !== 'domain' && to.kind !== 'project' && to.domain === null) to.domain = from.id;
      if (from.kind === 'capability' && to.kind === 'element' && to.capability === null) {
        to.capability = from.id;
        from.elements.push(to.id);
      }
    } else if (isDirectionalRelation(edge.relationType)) dependencies.push([from.id, to.id]);
    else relates.push([from.id, to.id]);
  }
  /* An element held only by a capability takes that capability's domain. */
  for (const concept of concepts.values()) {
    if (concept.kind === 'element' && concept.domain === null && concept.capability) {
      concept.domain = concepts.get(concept.capability)?.domain ?? null;
    }
  }
  const all = [...concepts.values()].sort(byId);
  return {
    project: all.find((c) => c.kind === 'project') ?? null,
    domains: all.filter((c) => c.kind === 'domain'),
    capabilities: all.filter((c) => c.kind === 'capability' && c.domain !== null),
    elements: all.filter((c) => c.kind === 'element' && c.domain !== null),
    byId: concepts,
    dependencies,
    relates,
    relationCount: graph.edges.length,
  };
}

/** What one concept's relations reach: the film's lit lines when it is selected. */
export interface FilmReach {
  /** Everything it depends on, in the vault's order. */
  needs: string[];
  /** Everything that depends on it. */
  neededBy: string[];
  relates: string[];
  /** Its own elements it depends on: answered inside its own fan, without a long line. */
  ownNeeds: string[];
}

export function reachOf(vault: FilmVault, id: string): FilmReach {
  const own = new Set(vault.byId.get(id)?.elements ?? []);
  const needs = vault.dependencies.filter(([from]) => from === id).map(([, to]) => to);
  return {
    needs,
    neededBy: vault.dependencies.filter(([, to]) => to === id).map(([from]) => from),
    relates: vault.relates.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a)),
    ownNeeds: needs.filter((to) => own.has(to)),
  };
}

/** Lines that leave the pick's own fan: more than this reads as a broom, so the next concept is taken. */
const MAX_LEAVING_LINES = 9;

/**
 * The capability the film opens and selects: its relations reach the most other domains; ties go
 * to one with a user, then more elements, then the lower id. Null when no capability relates to
 * anything, and the film then holds on the map at rest.
 */
export function pickFilmConcept(vault: FilmVault): string | null {
  const ranked = vault.capabilities
    .map((cap) => {
      const reach = reachOf(vault, cap.id);
      const ends = [...reach.needs, ...reach.neededBy, ...reach.relates];
      const domains = new Set(ends.map((end) => vault.byId.get(end)?.domain).filter((d) => d && d !== cap.domain));
      const leaving = ends.length - reach.ownNeeds.length;
      return { cap, domains: domains.size, used: reach.neededBy.length > 0 ? 1 : 0, leaving, ends: ends.length };
    })
    .filter((row) => row.ends > 0)
    .sort(
      (a, b) =>
        b.domains - a.domains ||
        b.used - a.used ||
        b.cap.elements.length - a.cap.elements.length ||
        byId(a.cap, b.cap),
    );
  return (ranked.find((row) => row.leaving <= MAX_LEAVING_LINES) ?? null)?.cap.id ?? null;
}

/** Dependencies that cross a domain border, rolled up to their ordered domain pair. */
export function domainFlows(vault: FilmVault): { from: string; to: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const [a, b] of vault.dependencies) {
    const da = vault.byId.get(a)?.domain;
    const db = vault.byId.get(b)?.domain;
    if (!da || !db || da === db) continue;
    const key = `${da}\n${db}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split('\n') as [string, string];
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count || (a.from + a.to < b.from + b.to ? -1 : 1));
}
