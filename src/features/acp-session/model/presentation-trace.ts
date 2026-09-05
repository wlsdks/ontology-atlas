import { parseAtlasToolCall } from './atlas-tool-call';
import { linkSlugs } from './link-slugs';
import type { AcpEvent, AcpSessionStatus } from './use-acp-session';

export type AcpPresentationIntent = 'business-flow';
type AcpPresentationQualification = 'cited' | 'limited';

export interface AcpPresentationScene {
  id: string;
  title: string | null;
  body: string;
  citations: string[];
  citationReads: Array<{ slug: string; toolCallId: string }>;
  qualification: AcpPresentationQualification;
  focus: { slug: string; toolCallId: string };
}

export interface AcpPresentationTrace {
  status: 'ready';
  intent: AcpPresentationIntent;
  scenes: AcpPresentationScene[];
  sourceHidden: {
    proven: true;
    atlasReadCalls: number;
    fullBodyConcepts: number;
    toolDiscoveryCalls: number;
    nonAtlasSourceCalls: 0;
  };
}

type AcpPresentationBlockReason =
  | 'intent_inactive'
  | 'turn_incomplete'
  | 'no_answer'
  | 'source_hidden_unproven'
  | 'no_full_body_reads'
  | 'full_body_read_budget_exceeded'
  | 'scene_count_out_of_range'
  | 'scene_uncited'
  | 'citation_not_read'
  | 'relation_not_in_graph';

interface AcpPresentationBlocked {
  status: 'blocked';
  reason: AcpPresentationBlockReason;
  target?: string;
}

export type AcpPresentationResult = AcpPresentationTrace | AcpPresentationBlocked;

interface BuildAcpPresentationTraceInput {
  intent: AcpPresentationIntent | null;
  /** Exact app-authored request that activates this projection for one turn. */
  expectedUserText: string | null;
  sessionStatus: AcpSessionStatus;
  events: readonly AcpEvent[];
  knownSlugs: ReadonlySet<string>;
  knownRelations: ReadonlySet<string>;
}

const MIN_SCENES = 3;
const MAX_SCENES = 7;
const FULL_BODY_CONCEPT_LIMIT = 12;

/**
 * A presentation may use only Atlas reads whose results describe the vault. A
 * general filesystem/source tool would make "ontology only" a prompt request,
 * not an observed property of the turn.
 */
const PRESENTATION_READ_TOOLS = new Set([
  'connection_info',
  'list_concepts',
  'get_concept',
  'get_concepts',
  'find_evidence',
  'find_backlinks',
  'find_neighbors',
  'find_path',
  'list_kinds',
  'find_orphans',
  'query_concepts',
  'compile_ontology',
  'query_ontology',
]);
const PRESENTATION_DISCOVERY_TOOLS = new Set(['ToolSearch', 'tool_search']);

const LIMITED_PATTERN = /\b(?:partial|visible-gap|unknown)\b|부분적|부분만|미확인|불확실|알 수 없|근거(?:가|는)? 부족/iu;
const HEADING_PATTERN = /^#{1,3}\s+(.+?)\s*$/;
const RELATION_PATTERN = /`?([a-z0-9][a-z0-9/_-]*)`?\s+--([a-z_]+)-->\s+`?([a-z0-9][a-z0-9/_-]*)`?/giu;

export function presentationRelationKey(from: string, to: string, type: string): string {
  return `${from}\0${type}\0${to}`;
}

/**
 * The rendered graph intentionally folds the authoring fields `capabilities:`
 * and `elements:` into one containment edge. Preserve those exact authoring
 * names for presentation verification only when the contained node kind proves
 * which alias it is; a project→domain `contains` edge must never pass as a
 * capability or element relation.
 */
export function presentationRelationKeysForGraphEdge({
  from,
  to,
  type,
  toKind,
}: {
  from: string;
  to: string;
  type: string;
  toKind: string | null;
}): string[] {
  const keys = [presentationRelationKey(from, to, type)];
  if (type === 'contains' && toKind === 'capability') {
    keys.push(presentationRelationKey(from, to, 'capabilities'));
  }
  if (type === 'contains' && toKind === 'element') {
    keys.push(presentationRelationKey(from, to, 'elements'));
  }
  return keys;
}

function fullBodyReadSlugs(
  toolName: string,
  input: Record<string, unknown> | null,
  knownSlugs: ReadonlySet<string>,
): string[] {
  if (toolName !== 'get_concept' && toolName !== 'get_concepts') return [];
  if (!input || input.body !== 'full') return [];
  const candidates = toolName === 'get_concept'
    ? [input.slug]
    : Array.isArray(input.slugs) ? input.slugs : [];
  return candidates.filter((value): value is string => (
    typeof value === 'string' && knownSlugs.has(value)
  ));
}

interface NarrativeSection {
  title: string | null;
  body: string;
}

/** Headings name scenes; otherwise blank-line paragraphs are the fallback. */
function narrativeSections(text: string): NarrativeSection[] {
  const normalized = text.replaceAll('\r\n', '\n').trim();
  if (!normalized) return [];

  const sections: NarrativeSection[] = [];
  let title: string | null = null;
  let body: string[] = [];
  let sawHeading = false;
  const flush = () => {
    const joined = body.join('\n').trim();
    if (joined) sections.push({ title, body: joined });
    body = [];
  };

  for (const line of normalized.split('\n')) {
    const heading = HEADING_PATTERN.exec(line.trim());
    if (heading) {
      // ACP may precede the requested deck with one conversational sentence.
      // It remains visible in chat, but only explicitly headed sections become
      // presentation scenes; silently promoting that preamble would create an
      // unrequested, usually uncited seventh scene.
      if (sawHeading) flush();
      else body = [];
      sawHeading = true;
      title = heading[1].replace(/^\*\*|\*\*$/g, '').trim();
      continue;
    }
    body.push(line);
  }
  flush();

  if (sawHeading) return sections;
  return normalized
    .split(/\n{2,}/)
    .map((block) => ({ title: null, body: block.trim() }))
    .filter(({ body: block }) => block.length > 0);
}

function citedSlugs(body: string, knownSlugs: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const segment of linkSlugs(body, knownSlugs)) {
    if (!('slug' in segment) || found.includes(segment.slug)) continue;
    found.push(segment.slug);
  }
  return found;
}

function firstUnknownRelation(
  body: string,
  knownRelations: ReadonlySet<string>,
): string | null {
  for (const match of body.matchAll(RELATION_PATTERN)) {
    const [, from, type, to] = match;
    if (!knownRelations.has(presentationRelationKey(from, to, type))) {
      return `${from} --${type}--> ${to}`;
    }
  }
  return null;
}

/**
 * Turns the latest completed, source-hidden ACP answer into an ephemeral guided
 * trace. This does not judge prose as true: it only proves that every scene is
 * anchored to a full body read from this turn and that any typed relation it
 * spells out exists in the current graph.
 */
export function buildAcpPresentationTrace({
  intent,
  expectedUserText,
  sessionStatus,
  events,
  knownSlugs,
  knownRelations,
}: BuildAcpPresentationTraceInput): AcpPresentationResult {
  if (intent === null) return { status: 'blocked', reason: 'intent_inactive' };
  if (sessionStatus !== 'ready') return { status: 'blocked', reason: 'turn_incomplete' };

  let turnStart = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.kind !== 'user') continue;
    turnStart = index;
    break;
  }
  if (turnStart < 0) return { status: 'blocked', reason: 'no_answer' };
  const userEvent = events[turnStart];
  if (
    userEvent?.kind !== 'user'
    || expectedUserText === null
    || userEvent.text.trim() !== expectedUserText.trim()
  ) {
    return { status: 'blocked', reason: 'intent_inactive' };
  }
  const turn = events.slice(turnStart + 1);
  const answer = [...turn].reverse().find((event) => event.kind === 'agent');
  if (!answer || answer.kind !== 'agent' || answer.text.trim().length === 0) {
    return { status: 'blocked', reason: 'no_answer' };
  }

  const tools = turn.filter((event): event is Extract<AcpEvent, { kind: 'tool' }> => (
    event.kind === 'tool'
  ));
  const readBySlug = new Map<string, string>();
  let atlasReadCalls = 0;
  let toolDiscoveryCalls = 0;
  for (const tool of tools) {
    if (PRESENTATION_DISCOVERY_TOOLS.has(tool.title)) {
      if (!new Set(['completed', 'failed']).has(tool.status)) {
        return {
          status: 'blocked',
          reason: 'source_hidden_unproven',
          target: tool.title,
        };
      }
      toolDiscoveryCalls += 1;
      continue;
    }
    const call = parseAtlasToolCall(tool.title, tool.rawInput);
    const observedReadKind = tool.toolKind === 'read' || tool.toolKind === 'search';
    const observedCodexMcpKind = call?.titleStyle === 'dotted' && tool.toolKind === 'execute';
    if (
      !call
      || !PRESENTATION_READ_TOOLS.has(call.name)
      || (!observedReadKind && !observedCodexMcpKind)
      || !new Set(['completed', 'failed']).has(tool.status)
    ) {
      return {
        status: 'blocked',
        reason: 'source_hidden_unproven',
        target: tool.title || tool.id,
      };
    }
    atlasReadCalls += 1;
    if (tool.status !== 'completed') continue;
    for (const slug of fullBodyReadSlugs(call.name, call.input, knownSlugs)) {
      if (!readBySlug.has(slug)) readBySlug.set(slug, tool.id);
    }
  }
  if (readBySlug.size === 0) return { status: 'blocked', reason: 'no_full_body_reads' };
  if (readBySlug.size > FULL_BODY_CONCEPT_LIMIT) {
    return {
      status: 'blocked',
      reason: 'full_body_read_budget_exceeded',
      target: String(readBySlug.size),
    };
  }

  const sections = narrativeSections(answer.text);
  if (sections.length < MIN_SCENES || sections.length > MAX_SCENES) {
    return { status: 'blocked', reason: 'scene_count_out_of_range' };
  }

  const scenes: AcpPresentationScene[] = [];
  for (const [index, section] of sections.entries()) {
    const mentionedSlugs = citedSlugs(section.body, knownSlugs);
    if (mentionedSlugs.length === 0) {
      return { status: 'blocked', reason: 'scene_uncited', target: section.title ?? `${index + 1}` };
    }
    // A scene needs at least one full-body anchor. Other known slugs may be
    // discussed as neighbours or dependency endpoints exposed by that anchor;
    // they are not promoted to citation chips unless their own body was read.
    const citations = mentionedSlugs.filter((slug) => readBySlug.has(slug));
    if (citations.length === 0) {
      return {
        status: 'blocked',
        reason: 'citation_not_read',
        target: mentionedSlugs[0],
      };
    }
    const unknownRelation = firstUnknownRelation(section.body, knownRelations);
    if (unknownRelation) {
      return { status: 'blocked', reason: 'relation_not_in_graph', target: unknownRelation };
    }
    const focusSlug = citations[0];
    scenes.push({
      id: `scene-${index + 1}-${focusSlug}`,
      title: section.title,
      body: section.body,
      citations,
      citationReads: citations.map((slug) => ({ slug, toolCallId: readBySlug.get(slug)! })),
      qualification: LIMITED_PATTERN.test(section.body) ? 'limited' : 'cited',
      focus: { slug: focusSlug, toolCallId: readBySlug.get(focusSlug)! },
    });
  }

  return {
    status: 'ready',
    intent,
    scenes,
    sourceHidden: {
      proven: true,
      atlasReadCalls,
      fullBodyConcepts: readBySlug.size,
      toolDiscoveryCalls,
      nonAtlasSourceCalls: 0,
    },
  };
}
