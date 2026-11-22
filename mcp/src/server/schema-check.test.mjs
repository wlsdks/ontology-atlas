import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA } from '../construction/construction-qualification.mjs';
import { analyzeRepoStructureTool } from '../tools/repo-analysis/analyze-structure.mjs';
import { checkAgainstSchema, exampleOf } from './schema-check.mjs';
import { MEANING_PROPOSAL_INPUT_SCHEMA } from './tool-schemas/meaning-construction.mjs';

/**
 * analyze_repo_structure advertises a shallow `proposal` and `qualification`;
 * the server holds the full contracts and must refuse every input they reject,
 * naming the field and showing a valid example of it.
 */

const QUALIFIED = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../../../tests/fixtures/construction-qualification/qualified.json'),
  'utf8',
));

function proposal(overrides = {}) {
  const answer = (concept) => ({
    answer: 'Answered from the README.',
    status: 'answered',
    witnesses: { concepts: [concept], relations: [], evidence: ['README.md'], paths: [] },
  });
  return {
    project: { slug: 'claims', title: 'Claims', definition: 'Publishes reviewed claims.', evidence: ['README.md'], confidence: 0.9 },
    domains: [],
    capabilities: [],
    elements: [],
    relations: [],
    competencyAnswers: {
      scope: answer('claims'),
      domains: answer('claims'),
      abilities: answer('claims'),
      evidence: answer('claims'),
      impact: answer('claims'),
    },
    ...overrides,
  };
}

function refusal(args) {
  assert.throws(() => analyzeRepoStructureTool({ rootPath: '/nonexistent-root', ...args }), (error) => {
    refusal.message = error.message;
    return true;
  });
  return refusal.message;
}

test('the full contracts accept the valid fixtures they are checked against', () => {
  checkAgainstSchema(proposal(), MEANING_PROPOSAL_INPUT_SCHEMA, 'proposal');
  checkAgainstSchema(QUALIFIED, CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA, 'qualification');
});

test('every generated example passes the contract it illustrates', () => {
  checkAgainstSchema(exampleOf(MEANING_PROPOSAL_INPUT_SCHEMA), MEANING_PROPOSAL_INPUT_SCHEMA, 'proposal');
  checkAgainstSchema(exampleOf(CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA), CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA, 'qualification');
});

const INVALID_PROPOSALS = [
  ['a wrong type', [], /^proposal must be an object; received an array\..*Example proposal: \{"project"/],
  ['a missing required field', proposal({ project: { slug: 'claims' } }),
    /^proposal\.project is missing required field "title"; required: slug, title, definition, evidence, confidence\..*Example proposal\.project\.title: "<title>"/],
  ['an unknown key', proposal({ owner: 'me' }), /^Unknown field "owner" in proposal\..*Allowed fields: project, domains/],
  ['an enum value outside the list',
    proposal({ relations: [{ from: 'claims', to: 'domains/review', type: 'dependsOn', why: 'Wired.', evidence: ['README.md'], confidence: 0.5 }] }),
    /^proposal\.relations\[0\]\.type must be one of: .*Did you mean "depends_on"\?/],
  ['a number above its maximum', proposal({ project: { ...proposal().project, confidence: 2 } }),
    /^proposal\.project\.confidence must be <= 1; received 2\. Example proposal\.project\.confidence: 0\.8\./],
  ['a missing nested answer', proposal({ competencyAnswers: {} }),
    /^proposal\.competencyAnswers is missing required field "scope".*Example proposal\.competencyAnswers\.scope: \{"answer"/],
  ['a blank evidence item', proposal({ project: { ...proposal().project, evidence: [' README.md'] } }),
    /^proposal\.project\.evidence\[0\] must be a non-empty single-line string without leading or trailing whitespace/],
];

for (const [name, value, expected] of INVALID_PROPOSALS) {
  test(`analyze_repo_structure refuses a proposal with ${name}`, () => {
    assert.match(refusal({ proposal: value }), expected);
  });
}

function qualification(mutate) {
  const value = structuredClone(QUALIFIED);
  mutate(value);
  return value;
}

const INVALID_QUALIFICATIONS = [
  ['a wrong type', 'packet', /^qualification must be an object; received a string\..*Example qualification\.subject: \{"projectSlug"/],
  ['a missing required field', qualification((value) => { delete value.acceptance; }),
    /^qualification is missing required field "acceptance".*Example qualification\.acceptance: \{"decision":"accepted"/],
  ['an unknown key', qualification((value) => { value.reviewer = 'me'; }), /^Unknown field "reviewer" in qualification\./],
  ['a contract outside the enum', qualification((value) => { value.contract = 'constructionQualification:v2'; }),
    /^qualification\.contract must be one of: constructionQualification:v1\./],
  ['too few scenarios', qualification((value) => { value.scenarios = value.scenarios.slice(0, 1); }),
    /^qualification\.scenarios must contain at least 4 items; received 1\..*Example qualification\.scenarios\[0\]: \{"id".*executive, employee, and agent audiences/],
  ['a malformed digest', qualification((value) => { value.subject.graphDigest = 'sha256:abc'; }),
    /^qualification\.subject\.graphDigest must be a digest "sha256:" followed by 64 lowercase hex digits\. Example qualification\.subject\.graphDigest: "sha256:0{64}"/],
  ['a malformed timestamp', qualification((value) => { value.acceptance.decidedAt = 'yesterday'; }),
    /^qualification\.acceptance\.decidedAt must be an RFC 3339 date-time\. Example qualification\.acceptance\.decidedAt: "2026-01-31T09:00:00\.000Z"/],
];

for (const [name, value, expected] of INVALID_QUALIFICATIONS) {
  test(`analyze_repo_structure refuses a qualification with ${name}`, () => {
    assert.match(refusal({ qualification: value }), expected);
  });
}

test('a null proposal or qualification still means the route is not taken', () => {
  assert.doesNotThrow(() => checkAgainstSchema(proposal(), MEANING_PROPOSAL_INPUT_SCHEMA, 'proposal'));
  assert.throws(
    () => analyzeRepoStructureTool({ rootPath: '/nonexistent-root', proposal: null, qualification: null }),
    (error) => !/^proposal|^qualification/.test(error.message),
  );
});
