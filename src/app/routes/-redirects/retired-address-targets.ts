import {
  buildTopologyMeaningCreateHref,
  buildTopologyMeaningEditorNodeHref,
  ONTOLOGY_DEEPLINK_ASK_KEY,
  translateOntologyDeeplinkToTopologyParam,
} from '@/entities/knowledge-graph';
import { firstSearchText, type SearchText } from '@/shared/lib/navigation/search-text';

/** A query as the router reads it; the retired addresses take whatever keys old links carried. */
export type RetiredAddressSearch = Record<string, unknown>;

const text = (search: RetiredAddressSearch, key: string): string | undefined => firstSearchText(search[key] as SearchText);

/** Every pair of the query in arrival order, a repeated key once per value. */
function pairsOf(search: RetiredAddressSearch): [string, string][] {
  return Object.entries(search).flatMap(([key, value]): [string, string][] =>
    typeof value === 'string'
      ? [[key, value]]
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string').map((item): [string, string] => [key, item])
        : [],
  );
}

/**
 * Keeps every `/ontology/?node=X` link (`buildOntologyNodeHref`) resolving by translating it to the
 * /topology form. An unknown node is diagnosed only by the map, the one "not found" surface.
 */
export function ontologyTarget(search: RetiredAddressSearch): string {
  const params = new URLSearchParams();
  params.set('index', 'expanded');
  const node = text(search, 'node');
  if (node) params.set('p', translateOntologyDeeplinkToTopologyParam(node));
  // Only the request kind, never a message sent on the person's behalf; the map validates it.
  const ask = text(search, ONTOLOGY_DEEPLINK_ASK_KEY);
  if (ask) params.set(ONTOLOGY_DEEPLINK_ASK_KEY, ask);
  return `/topology/?${params.toString()}`;
}

export function ontologyEditTarget(search: RetiredAddressSearch): string {
  if (text(search, 'mode') === 'create' || text(search, 'workbench') === 'create') {
    return buildTopologyMeaningCreateHref();
  }
  const node = text(search, 'node') ?? text(search, 'p');
  if (!node) return '/topology/';
  const base = buildTopologyMeaningEditorNodeHref(node);
  const query = new URLSearchParams(base.slice(base.indexOf('?') + 1));
  const edit = text(search, 'edit');
  if (edit) query.set('edit', edit);
  return `/topology/?${query.toString()}`;
}

const ANALYSIS_REVIEW_PREFIX = 'analysis:';

function namedConcept(search: RetiredAddressSearch): string | null {
  const review = text(search, 'review');
  const raw = review?.startsWith(ANALYSIS_REVIEW_PREFIX) ? review.slice(ANALYSIS_REVIEW_PREFIX.length) : text(search, 'node');
  const canonical = raw ? translateOntologyDeeplinkToTopologyParam(raw) : '';
  return canonical || null;
}

export function insightsTarget(search: RetiredAddressSearch): string {
  const tab = text(search, 'tab');
  if (tab === 'harness') {
    const query = new URLSearchParams(pairsOf(search));
    query.delete('tab');
    query.set('view', 'overview');
    return `/architecture/?${query.toString()}`;
  }
  if (tab === 'library') return '/library/?tab=wiki';
  const concept = namedConcept(search);
  if (concept) return `/topology/?${new URLSearchParams({ p: concept }).toString()}`;
  return '/topology/';
}

/**
 * Other parameters travel unchanged, or the app's public deep link (`ontology-atlas://mcp?install=…`)
 * no longer reaches the connectors dialog.
 */
export function mcpTarget(search: RetiredAddressSearch): string {
  const query = new URLSearchParams();
  query.set('tab', 'mcp');
  const section = text(search, 'tab');
  if (section && section !== 'share') query.set('mcp', section);
  for (const [key, value] of pairsOf(search)) {
    if (key === 'tab' || key === 'mcp') continue;
    query.append(key, value);
  }
  return `/agents/?${query.toString()}`;
}
