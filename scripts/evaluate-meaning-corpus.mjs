import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRepoStructure } from '../mcp/src/analyze.mjs';
import {
  candidateProposalFromAnalysis,
  evaluateMeaningProposal,
  proposalFromGolden,
} from '../mcp/src/meaning-evaluation.mjs';

const corpusRoot = join(process.cwd(), 'tests/fixtures/meaning-corpus');

export function evaluateMeaningCorpus(rootPath = corpusRoot) {
  const rows = readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const root = join(rootPath, entry.name);
      const golden = JSON.parse(readFileSync(join(root, 'golden.json'), 'utf8'));
      const analysis = analyzeRepoStructure(root);
      const candidate = evaluateMeaningProposal(
        golden.expected,
        candidateProposalFromAnalysis(analysis),
        {
          definitionCoverage: 0,
          citationRecall: 0,
          competencyCoverage: 0,
          maximumForbiddenLeakage: 0,
        },
      );
      const oracle = evaluateMeaningProposal(
        golden.expected,
        proposalFromGolden(golden.expected),
      );
      return {
        id: golden.id,
        architecture: golden.architecture,
        candidateCoverage: candidate,
        oracleContract: oracle,
      };
    });

  if (rows.length === 0) {
    throw new Error(`meaning corpus is empty: ${rootPath}`);
  }

  const totals = rows.reduce(
    (acc, row) => ({
      expected: acc.expected + row.candidateCoverage.counts.expectedConcepts,
      proposed: acc.proposed + row.candidateCoverage.counts.proposedConcepts,
      matched: acc.matched + row.candidateCoverage.counts.matchedConcepts,
    }),
    { expected: 0, proposed: 0, matched: 0 },
  );
  const summary = {
    corpusSize: rows.length,
    candidatePrecision: ratio(totals.matched, totals.proposed),
    candidateRecall: ratio(totals.matched, totals.expected),
    oracleContractsPassed: rows.filter((row) => row.oracleContract.passed).length,
    totals,
  };
  return { summary, rows };
}

export function passesMeaningCorpus(result) {
  const { summary, rows } = result;
  return rows.length > 0 &&
    rows.every((row) => row.candidateCoverage.passed && row.oracleContract.passed) &&
    summary.candidatePrecision >= 0.8 &&
    summary.candidateRecall >= 0.75 &&
    summary.oracleContractsPassed === summary.corpusSize;
}

function run() {
  const json = process.argv.includes('--json');
  const result = evaluateMeaningCorpus();
  const { summary, rows } = result;

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log('meaning extraction evaluation');
    for (const row of rows) {
      const { metrics, failures } = row.candidateCoverage;
      console.log(
        `  ${row.id} (${row.architecture}) — candidate precision ${format(metrics.conceptPrecision)}, recall ${format(metrics.conceptRecall)}; candidate ${row.candidateCoverage.passed ? 'PASS' : 'FAIL'}; oracle ${row.oracleContract.passed ? 'PASS' : 'FAIL'}`,
      );
      for (const failure of failures) {
        console.log(`    ${failure.gate}: ${failure.actual} ${failure.expected}`);
      }
    }
    console.log(
      `  aggregate — precision ${format(summary.candidatePrecision)}, recall ${format(summary.candidateRecall)}, oracle ${summary.oracleContractsPassed}/${summary.corpusSize}`,
    );
  }

  if (!passesMeaningCorpus(result)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

function format(value) {
  return `${(value * 100).toFixed(1)}%`;
}
