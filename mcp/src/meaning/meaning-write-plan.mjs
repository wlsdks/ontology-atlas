import { parseTaskNavigationEvidenceSource } from '../agent-brief/task-navigation-evidence.mjs';
import { renderProjectCompetencyMarkdown } from '../project-meaning/project-meaning-receipt.mjs';
import { MEANING_COMPETENCY_QUESTIONS } from './meaning-assessment.mjs';
import { nonEmpty } from './proposal-review/shape.mjs';

export function buildWritePlan(proposal) {
  const typedConcepts = [
    ['project', proposal.project],
    ...proposal.domains.map((row) => ['domain', row]),
    ...proposal.capabilities.map((row) => ['capability', row]),
    ...proposal.elements.map((row) => ['element', row]),
  ];
  const outgoing = new Map();
  for (const relation of proposal.relations) {
    const rows = outgoing.get(relation.from) ?? [];
    rows.push(relation);
    outgoing.set(relation.from, rows);
  }
  return {
    concepts: typedConcepts.map(([kind, concept]) => ({
      slug: concept.slug,
      kind,
      title: concept.title,
      ...(nonEmpty(concept.domain) ? { domain: concept.domain } : {}),
      ...(nonEmpty(concept.path) ? { path: concept.path } : {}),
      body: buildConceptBody(
        concept,
        outgoing.get(concept.slug) ?? [],
        kind === 'project' ? proposal.competencyAnswers : null,
      ),
    })),
    relations: proposal.relations.map(({ from, to, type, why }) => ({
      from,
      to,
      type,
      why,
    })),
    competencyAnswers: normalizeCompetencyAnswers(proposal.competencyAnswers),
  };
}

function renderConceptEvidenceSource(source) {
  const parsed = parseTaskNavigationEvidenceSource(source);
  if (!parsed?.ok) return `- \`${source}\``;
  const labels = {
    primary: 'Primary implementation',
    supporting: 'Supporting implementation',
    test: 'Focused test',
  };
  const coordinate = parsed.coordinate;
  return `- ${labels[coordinate.role]}: \`${coordinate.path}#${coordinate.symbol}\``;
}

function buildConceptBody(concept, relations, competencyAnswers = null) {
  const sections = [
    ['Definition', concept.definition],
    ['Evidence', concept.evidence.map(renderConceptEvidenceSource).join('\n')],
    ['Confidence', String(concept.confidence)],
  ];
  if (concept.includes?.length) {
    sections.push(['Includes', concept.includes.map((row) => `- ${row}`).join('\n')]);
  }
  if (concept.excludes?.length) {
    sections.push(['Excludes', concept.excludes.map((row) => `- ${row}`).join('\n')]);
  }
  if (nonEmpty(concept.uncertainty)) {
    sections.push(['Uncertainty', concept.uncertainty]);
  }
  if (relations.length > 0) {
    sections.push(['Relations', relations.map((relation) => [
      `- \`${relation.type}\` → \`${relation.to}\`: ${relation.why}`,
      `  - Evidence: ${relation.evidence.map((source) => `\`${source}\``).join(', ')}`,
      `  - Confidence: ${relation.confidence}`,
    ].join('\n')).join('\n')]);
  }
  const rendered = sections.map(([heading, body]) => `## ${heading}\n\n${body}`).join('\n\n');
  const body = competencyAnswers
    ? `${rendered}\n\n${renderProjectCompetencyMarkdown(competencyAnswers)}`
    : `${rendered}\n`;
  // `parseFrontmatter(buildMarkdown({ body })).body` is the canonical body: the
  // separator adds exactly one leading newline, so reviewed bytes, writer input
  // and a later full-body read stay identical.
  return `\n${body}`;
}

function normalizeCompetencyAnswers(answers) {
  return Object.fromEntries(
    MEANING_COMPETENCY_QUESTIONS.map(({ id }) => {
      const row = answers[id];
      return [id, {
        answer: row.answer,
        status: row.status,
        ...(nonEmpty(row.gap) ? { gap: row.gap } : {}),
        witnesses: {
          concepts: [...row.witnesses.concepts],
          relations: row.witnesses.relations.map(({ from, to, type }) => ({
            from,
            to,
            type,
          })),
          evidence: [...row.witnesses.evidence],
          paths: [...row.witnesses.paths],
        },
      }];
    }),
  );
}
