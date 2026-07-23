import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeRepoStructure } from '../mcp/src/analyze.mjs';
import {
  candidateProposalFromAnalysis,
  evaluateMeaningProposal,
  proposalFromGolden,
} from '../mcp/src/meaning-evaluation.mjs';

const corpusRoot = join(process.cwd(), 'tests/fixtures/meaning-corpus');
const json = process.argv.includes('--json');
const rows = readdirSync(corpusRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const root = join(corpusRoot, entry.name);
    const golden = JSON.parse(readFileSync(join(root, 'golden.json'), 'utf8'));
    const analysis = analyzeRepoStructure(root);
    const candidate = evaluateMeaningProposal(
      golden.expected,
      candidateProposalFromAnalysis(analysis),
      {
        definitionCoverage: 0,
        citationRecall: 0,
        competencyCoverage: 0,
        maximumForbiddenLeakage: Number.POSITIVE_INFINITY,
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
const result = { summary, rows };

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log('meaning extraction evaluation');
  for (const row of rows) {
    const { metrics } = row.candidateCoverage;
    console.log(
      `  ${row.id} (${row.architecture}) — candidate precision ${format(metrics.conceptPrecision)}, recall ${format(metrics.conceptRecall)}; oracle ${row.oracleContract.passed ? 'PASS' : 'FAIL'}`,
    );
  }
  console.log(
    `  aggregate — precision ${format(summary.candidatePrecision)}, recall ${format(summary.candidateRecall)}, oracle ${summary.oracleContractsPassed}/${summary.corpusSize}`,
  );
}

if (
  summary.candidatePrecision < 0.8 ||
  summary.candidateRecall < 0.75 ||
  summary.oracleContractsPassed !== summary.corpusSize
) {
  process.exitCode = 1;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

function format(value) {
  return `${(value * 100).toFixed(1)}%`;
}
