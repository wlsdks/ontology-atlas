import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  allPathsResultExitCode,
  assertAllPathsShape,
  assertCyclesShape,
  assertPathShape,
  cyclesResultExitCode,
  pathResultExitCode,
} from './path-queries.mjs';

describe('path-queries', () => {
  it('validates all_paths completeness payloads and exit status', () => {
    const valid = {
      operation: 'all_paths',
      from: 'capabilities/session',
      to: 'domains/auth',
      found: true,
      direction: 'undirected',
      maxHops: 3,
      limit: 10,
      searchBudget: 1000,
      expandedStates: 3,
      exhaustive: true,
      truncatedByBudget: false,
      totalPaths: 1,
      totalPathsExact: true,
      limited: false,
      shortestHopCount: 2,
      byLength: { 2: 1 },
      evidence: {
        status: 'complete',
        reason: 'complete',
        totalPathsExact: true,
        pathsComplete: true,
        nextStep: 'use',
        recommendation: 'Safe to treat paths and totalPaths as complete for the requested bounds.',
        suggestedQuery: { operation: 'all_paths', from: 'capabilities/session', to: 'domains/auth' },
      },
      paths: [
        {
          hopCount: 2,
          hops: ['capabilities/session', 'capabilities/login', 'domains/auth'],
          nodes: [
            { slug: 'capabilities/session', kind: 'capability', title: 'Session' },
            { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
            { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
          ],
          edges: [
            { from: 'capabilities/session', to: 'capabilities/login', via: 'dependencies' },
            { from: 'capabilities/login', to: 'domains/auth', via: 'domain' },
          ],
          byRelation: { dependencies: 1, domain: 1 },
        },
      ],
    };

    assert.equal(assertAllPathsShape(valid), valid);
    assert.equal(allPathsResultExitCode(valid), 0);
    assert.equal(allPathsResultExitCode({ ...valid, found: false, totalPaths: 0, shortestHopCount: null, byLength: {}, paths: [] }), 1);
    assert.throws(
      () => assertAllPathsShape({ ...valid, expandedStates: 1001 }),
      /all_paths expandedStates must not exceed searchBudget/,
    );
    assert.throws(
      () => assertAllPathsShape({
        ...valid,
        paths: [{ ...valid.paths[0], edges: [] }],
      }),
      /all_paths paths\[0\]\.edges length must match hops length/,
    );
    assert.throws(
      () => assertAllPathsShape({
        ...valid,
        evidence: { ...valid.evidence, status: 'complete', pathsComplete: false },
      }),
      /all_paths evidence has an invalid completeness shape/,
    );
  });

  it('rejects malformed cycles and find_path payloads before CLI output', () => {
    const cycles = {
      operation: 'cycles',
      totalCycles: 1,
      cycles: [{ id: 'a>b>a', length: 2, nodes: ['a', 'b', 'a'], edges: [{ id: 'a->b' }, { id: 'b->a' }] }],
    };
    const path = {
      found: true,
      hopCount: 1,
      hops: ['a', 'b'],
      edges: [{ from: 'a', to: 'b', via: 'relates' }],
    };

    assert.equal(assertCyclesShape(cycles), cycles);
    assert.equal(
      assertCyclesShape({
        operation: 'cycles',
        cycles: [
          {
            nodes: ['a', 'b', 'a'],
            nodeSummaries: [
              { slug: 'a', kind: 'capability', title: 'A' },
              { slug: 'b', kind: 'capability', title: 'B' },
              { slug: 'a', kind: 'capability', title: 'A' },
            ],
          },
        ],
      }).cycles[0].nodeSummaries.length,
      3,
    );
    assert.equal(assertCyclesShape({ operation: 'cycles', cycles: [] }).totalCycles, undefined);
    assert.equal(assertCyclesShape({ operation: 'cycles', cycles: [{ slugs: ['a', 'b', 'a'] }] }).cycles[0].slugs.length, 3);
    assert.equal(assertPathShape(path), path);
    assert.deepEqual(assertPathShape({ found: false }), { found: false });
    assert.throws(
      () => assertCyclesShape({ operation: 'cycles', totalCycles: -1, cycles: [] }),
      /cycles query totalCycles must be a non-negative integer/,
    );
    assert.throws(
      () => assertCyclesShape({ operation: 'cycles', totalCycles: 1, cycles: [{ slugs: ['a'] }] }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertCyclesShape({
        operation: 'cycles',
        cycles: [{ nodes: ['a', 'b', 'a'], nodeSummaries: [{ slug: 'a', kind: 'capability', title: 'A' }] }],
      }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertCyclesShape({
        operation: 'cycles',
        cycles: [
          {
            nodes: ['a', 'b', 'a'],
            nodeSummaries: [
              { slug: 'a', kind: 'capability', title: 'A' },
              { slug: 'x', kind: 'capability', title: 'B' },
              { slug: 'a', kind: 'capability', title: 'A' },
            ],
          },
        ],
      }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hops: ['a', 'b'], edges: [] }),
      /find_path response edges length must match hops length/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hopCount: 2, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: 'relates' }] }),
      /find_path response hopCount must match hops length/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hops: ['a', 'b'], edges: [{ from: 'b', to: 'a', via: 'relates' }] }),
      /find_path response edges\[0\] has an invalid path-edge shape/,
    );
  });

  it('blocks cycles and find_path results that represent broken gates', () => {
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [] }), 0);
    assert.equal(cyclesResultExitCode({ cycles: [] }), 0);
    assert.equal(cyclesResultExitCode({ cycles: [{ nodes: ['a', 'b', 'a'], edges: [{}, {}] }] }), 1);
    assert.equal(cyclesResultExitCode({ cycles: [{ slugs: ['a', 'b', 'a'] }] }), 1);
    assert.equal(cyclesResultExitCode({}), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: -1, cycles: [] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [null] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [{ slugs: ['a'] }] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [{ slugs: ['a', ''] }] }), 1);

    assert.equal(pathResultExitCode({ found: true, hopCount: 1, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: 'relates' }] }), 0);
    assert.equal(pathResultExitCode({ found: false }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: [] }), 1);
    assert.equal(pathResultExitCode({ found: true }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: [null] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', '  '], edges: [{ from: 'a', to: '  ', via: 'relates' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hopCount: 2, hops: ['a', 'b'] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{}] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'b', to: 'a', via: 'relates' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: '  ' }] }), 1);
  });
});
