import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRepoStructure } from './analyze.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpusRoot = join(here, '../../tests/fixtures/meaning-corpus');

function loadCorpus() {
  return readdirSync(corpusRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const root = join(corpusRoot, entry.name);
      const golden = JSON.parse(readFileSync(join(root, 'golden.json'), 'utf8'));
      return { root, golden };
    });
}

function candidateEvidenceSources(analysis) {
  return new Set([
    ...analysis.semanticEvidence.map((row) => row.source),
    ...analysis.domains.map((row) => row.evidence?.source),
    ...analysis.capabilities.map((row) => row.evidence?.source),
    ...analysis.elements.map((row) => row.evidence?.source),
  ].filter(Boolean));
}

test('meaning corpus spans distinct architectures with unique, complete gold records', () => {
  const corpus = loadCorpus();
  assert.equal(corpus.length, 3);
  assert.equal(new Set(corpus.map(({ golden }) => golden.id)).size, corpus.length);
  assert.equal(
    new Set(corpus.map(({ golden }) => golden.architecture)).size,
    corpus.length,
  );

  for (const { root, golden } of corpus) {
    const { expected } = golden;
    assert.ok(expected.project.slug);
    assert.ok(expected.project.title);
    assert.ok(expected.project.definition);
    assert.equal(Object.keys(expected.competencyAnswers).length, 5);
    for (const concept of [...expected.domains, ...expected.capabilities]) {
      assert.ok(concept.slug, `${golden.id}: concept slug`);
      assert.ok(concept.title, `${golden.id}: concept title`);
      assert.ok(concept.definition, `${golden.id}: concept definition`);
      assert.ok(concept.evidence.length >= 2, `${golden.id}: triangulated evidence`);
      for (const source of concept.evidence) {
        assert.ok(existsSync(join(root, source)), `${golden.id}: missing ${source}`);
      }
    }
  }
});

test('analyzer preserves project identity and exposes every gold evidence source', () => {
  for (const { root, golden } of loadCorpus()) {
    const analysis = analyzeRepoStructure(root);
    const sources = candidateEvidenceSources(analysis);
    assert.equal(analysis.project.slug, golden.expected.project.slug, golden.id);
    assert.equal(analysis.project.title, golden.expected.project.title, golden.id);
    for (const source of new Set(
      [...golden.expected.domains, ...golden.expected.capabilities]
        .flatMap((concept) => concept.evidence),
    )) {
      assert.ok(sources.has(source), `${golden.id}: analyzer omitted ${source}`);
    }
    for (const source of golden.expected.implementationEvidence) {
      assert.ok(sources.has(source), `${golden.id}: analyzer omitted ${source}`);
    }
    assert.equal(analysis.extractionContract.assertionPolicy.automaticBusinessAssertions, 0);
    assert.equal(analysis.extractionContract.qualityGates.uncertaintyExplicit, true);
  }
});

test('implementation-shaped names stay out of shared business ontology', () => {
  for (const { root, golden } of loadCorpus()) {
    const analysis = analyzeRepoStructure(root);
    const shared = new Set(analysis.meaningGate.businessOntology.capabilities);
    for (const slug of golden.expected.forbiddenBusinessConcepts) {
      assert.equal(shared.has(slug), false, `${golden.id}: ${slug} became shared meaning`);
    }
  }
});
