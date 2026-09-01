import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MEANING_COMPETENCY_CONTRACT,
  MEANING_COMPETENCY_EVALUATOR,
  MEANING_COMPETENCY_QUESTIONS,
  MEANING_WITNESS_INVENTORY_CONTRACT,
  deriveMeaningAssessment,
} from './meaning-assessment.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(
  join(here, '../../tests/fixtures/source-hidden-field-trial/v1.json'),
  'utf8',
));

const PHASES = ['build', 'citation', 'handoff', 'hallucination'];
const QUESTION_STATUSES = new Set(['answered', 'partial', 'unanswered']);
const CLAIM_STATUSES = new Set(['verified', 'partial', 'unsupported']);

function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

test('source-hidden assessment keeps unavailable currentness and visible gaps without inventing source details', () => {
  const graphHash = 'project-graph-v1:a1b2c3d4';
  const sourceFingerprint = 'hidden:unavailable';
  const assessment = deriveMeaningAssessment({
    projectSlug: 'sample-product',
    graphHash,
    structure: { status: 'ready' },
    competency: {
      contract: MEANING_COMPETENCY_CONTRACT,
      receiptVersion: 1,
      evaluator: MEANING_COMPETENCY_EVALUATOR,
      graphHash,
      inventory: {
        contract: MEANING_WITNESS_INVENTORY_CONTRACT,
        graphHash,
        sourceFingerprint,
        concepts: ['sample-product'],
        relations: [],
        evidence: [],
        paths: [],
      },
      questions: MEANING_COMPETENCY_QUESTIONS.map(({ id }) => ({
        id,
        status: 'visible-gap',
        witnesses: { concepts: [], relations: [], evidence: [], paths: [] },
        unresolvedWitnesses: [`${id}-source-hidden`],
      })),
    },
    source: {
      status: 'not_measured',
      currentness: 'unavailable',
      topGapId: 'source_unbound',
      sourcePath: '/private/should-not-be-guessed/repository',
      sourceText: 'private source text must not enter the handoff',
    },
  });

  assert.equal(assessment.status, 'needs_evidence');
  assert.deepEqual(assessment.dimensions.source, {
    status: 'not_measured',
    currentness: 'unavailable',
  });
  assert.deepEqual(assessment.topGap, {
    dimension: 'source',
    id: 'source_unbound',
  });
  assert.equal(assessment.nextAction.id, 'measure_source');
  assert.ok(assessment.dimensions.competency.questions.every(({ status, witnessStatus }) => (
    status === 'visible-gap' && witnessStatus === 'missing'
  )));
  assert.ok(!collectStrings(assessment).some((value) => (
    value.includes('/private/should-not-be-guessed')
      || value.includes('private source text')
  )));
  assert.equal('sourcePath' in assessment, false);
  assert.equal('sourceText' in assessment, false);
});

test('the source-hidden fixture fixes a precommitted, repository-agnostic 20-CQ question set', () => {
  assert.equal(fixture.contract, 'ontologyFieldTrial:v1');
  assert.deepEqual(fixture.phaseOrder, PHASES);
  assert.equal(fixture.questionSet.fixedBeforeBuild, true);
  assert.equal(fixture.questionSet.revision, 1);

  const questions = fixture.questionSet.questions;
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length);
  assert.deepEqual(
    [...new Set(questions.map(({ audience }) => audience))].sort(),
    ['agent', 'employee', 'executive'],
  );
  for (const question of questions) {
    assert.match(question.id, /^cq\d{2}-[a-z-]+$/);
    assert.ok(question.question.length > 10);
  }
});

test('the four phases expose independent, derived measurements without a quality score', () => {
  const { build, citation, handoff, hallucination } = fixture.phases;

  assert.equal(build.status, 'measured');
  assert.equal(build.sourceAccess, true);
  assert.equal(build.vaultWrites.evaluator, 0);
  assert.equal(build.humanApproval.required, true);
  assert.equal(build.humanApproval.recorded, false);

  assert.equal(citation.status, 'measured');
  assert.equal(citation.citedPaths.length, citation.pathChecks.length);
  assert.deepEqual(
    citation.pathChecks.map(({ path }) => path),
    citation.citedPaths,
  );
  assert.ok(citation.pathChecks.every(({ exists }) => exists === true));
  assert.equal(citation.validatorIssues, 0);
  assert.ok(citation.pathChecks.every(({ path }) => (
    !path.startsWith('/') && !path.includes('\\')
  )));

  assert.equal(handoff.status, 'measured');
  assert.equal(handoff.sourceAccess, false);
  assert.equal(handoff.questions.length, fixture.questionSet.questions.length);
  assert.equal(handoff.summaryReads, 20);
  assert.equal(
    handoff.fullBodyFollowUpCount,
    handoff.questions.filter(({ fullBodySlugs }) => fullBodySlugs.length > 0).length,
  );
  assert.deepEqual(
    handoff.questions.map(({ id }) => id),
    fixture.questionSet.questions.map(({ id }) => id),
  );
  assert.ok(handoff.questions.every(({ id, status, fullBodySlugs }) => (
    fixture.questionSet.questions.some((question) => question.id === id)
      && QUESTION_STATUSES.has(status)
      && fullBodySlugs.length > 0
  )));
  assert.deepEqual(
    handoff.unansweredQuestionIds,
    handoff.questions.filter(({ status }) => status === 'unanswered').map(({ id }) => id),
  );
  assert.deepEqual(
    handoff.partialQuestionIds,
    handoff.questions.filter(({ status }) => status === 'partial').map(({ id }) => id),
  );

  assert.equal(hallucination.status, 'measured');
  assert.equal(hallucination.claims.length, 20);
  assert.deepEqual(
    hallucination.claims.map(({ questionId }) => questionId),
    fixture.questionSet.questions.map(({ id }) => id),
  );
  assert.ok(hallucination.claims.every(({ questionId, status }) => (
    fixture.questionSet.questions.some((question) => question.id === questionId)
      && CLAIM_STATUSES.has(status)
  )));
  assert.deepEqual(
    hallucination.failedClaimIds,
    hallucination.claims
      .filter(({ status }) => status === 'unsupported')
      .map(({ id }) => id),
  );
  assert.equal(hallucination.unsupportedPresentedAsFact, 0);

  // A fixture must not smuggle in the very source or private coordinates that
  // phase 3 is meant to remove. It also must not accidentally become a pass
  // certificate for the construction lifecycle.
  assert.ok(collectStrings(fixture).every((value) => (
    !value.includes('/Users/')
      && !value.includes('/private/')
      && !value.startsWith('file://')
  )));
  assert.equal(fixture.evaluationStatus, 'fixture_only');
  assert.equal(fixture.qualificationStatus, 'not_assessed');
  assert.equal('overallScore' in fixture, false);
  assert.equal('score' in fixture, false);
});
