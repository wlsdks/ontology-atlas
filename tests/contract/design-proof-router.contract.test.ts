import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DESIGN_BASE_LENSES,
  DESIGN_CHANGE_SIGNALS,
  routeDesignProof,
} from '../../scripts/lib/design-proof-router.mjs';
import { parseDesignRouteArgs } from '../../scripts/design-proof-router.mjs';

const ROOT = process.cwd();
const CLI = 'scripts/design-proof-router.mjs';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const proofNames = (changes: string[]) => routeDesignProof({ changes }).proofs.map((item) => item.name);

describe('Atlas design proof routing', () => {
  it('keeps copy and local visual work out of review', () => {
    expect(routeDesignProof({ changes: ['copy'] })).toMatchObject({
      directions: false,
      review: { required: false, lenses: [] },
      proofs: [
        { name: 'checks:changed', scope: 'changed-paths' },
        { name: 'final-capture', scope: 'affected-state' },
      ],
    });
    expect(routeDesignProof({ changes: ['local-visual'] })).toMatchObject({
      directions: false,
      review: { required: false, lenses: [] },
      proofs: [
        { name: 'checks:changed', scope: 'changed-paths' },
        { name: 'design-audit', scope: 'affected-state' },
        { name: 'computer-use-loop', scope: 'affected-state' },
      ],
    });
  });

  it('routes distinct failure modes to distinct instruments', () => {
    expect(proofNames(['motion'])).toEqual([
      'checks:changed',
      'motion-verify',
      'computer-use-loop',
    ]);
    expect(proofNames(['topology-gesture'])).toEqual([
      'checks:changed',
      'map-perf',
      'computer-use-loop',
    ]);
    expect(proofNames(['desktop-shell'])).toEqual([
      'checks:changed',
      'installed-app',
      'computer-use-loop',
    ]);
    expect(proofNames(['responsive'])).toEqual([
      'checks:changed',
      'design-audit',
      'responsive-sweep',
      'computer-use-loop',
    ]);
    expect(proofNames(['topology-encoding'])).toEqual([
      'checks:changed',
      'design-audit',
      'graph-readability',
      'contrast',
      'computer-use-loop',
    ]);
  });

  it('does not infer motion, responsive, performance, or installed-app proof from generic UI', () => {
    const proofs = proofNames(['local-visual', 'interaction']);
    for (const unrelated of ['motion-verify', 'responsive-sweep', 'map-perf', 'installed-app']) {
      expect(proofs).not.toContain(unrelated);
    }
    expect(proofs).toContain('computer-use-loop');
  });

  it('requires Computer Use pixels for every rendered class and a recording for motion', () => {
    // Copy needs one final capture, not the iterative loop.
    expect(proofNames(['copy'])).toContain('final-capture');
    expect(proofNames(['copy'])).not.toContain('computer-use-loop');
    expect(proofNames(['copy', 'layout'])).toContain('computer-use-loop');
    const rendered = [
      'local-visual',
      'layout',
      'responsive',
      'interaction',
      'motion',
      'topology-encoding',
      'topology-gesture',
      'journey',
      'desktop-shell',
      'agent-handoff',
      'new-surface',
      'information-architecture',
      'interaction-model',
      'attention-model',
    ];
    for (const change of rendered) {
      expect(proofNames([change]), change).toContain('computer-use-loop');
    }
    expect(proofNames(['motion'])).toContain('motion-verify');
    expect(proofNames(['design-contract'])).not.toContain('computer-use-loop');
  });

  it('reserves divergence and review for structural commitments', () => {
    const result = routeDesignProof({
      changes: ['new-surface', 'desktop-shell', 'motion', 'agent-handoff'],
    });
    expect(result).toMatchObject({
      directions: true,
      review: {
        required: true,
        rebuttal: 'only-on-material-conflict',
        record: true,
      },
      sequence: ['directions', 'build', 'proof', 'review', 'remeasure-changed-proof'],
    });
    expect(result.review.lenses).toEqual([
      'moment',
      'evidence',
      'attention',
      'reversibility',
      'motion',
      'installed-app',
      'responsive-bands',
      'agent-action',
    ]);
    expect(DESIGN_BASE_LENSES).toEqual(['moment', 'evidence']);
  });

  it('gives a design-contract change system review and a probed gate without a directions ritual', () => {
    expect(routeDesignProof({ changes: ['design-contract'] })).toMatchObject({
      directions: false,
      review: {
        required: true,
        lenses: ['moment', 'evidence', 'attention', 'tokens'],
      },
      proofs: [
        { name: 'checks:changed', scope: 'changed-paths' },
        { name: 'design-system-audit', scope: 'changed-contract' },
        { name: 'gate-probe', scope: 'changed-gate' },
      ],
    });
  });

  it('fails closed on an omitted or invented change class', () => {
    expect(Object.keys(DESIGN_CHANGE_SIGNALS).length).toBeGreaterThanOrEqual(10);
    expect(() => routeDesignProof()).toThrow('at least one observable design change is required');
    expect(() => routeDesignProof({ changes: ['small'] })).toThrow('changes must be one of');
  });

  it('routes the command-line entrypoint through the same policy', () => {
    const output = execFileSync(
      process.execPath,
      [CLI, '--change=responsive', '--change=motion', '--json'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toMatchObject({
      policyVersion: 3,
      directions: false,
      review: { required: false, lenses: [] },
    });
    const text = execFileSync(process.execPath, [CLI, '--change=design-contract'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(text).toContain('review=yes · lenses=moment,evidence,attention,tokens');
    expect(parseDesignRouteArgs(['--change=motion,responsive'])).toMatchObject({
      changes: ['motion', 'responsive'],
    });
  });

  it('keeps the active policy reachable from the package entrypoint', () => {
    expect(JSON.parse(read('package.json')).scripts['design:route']).toBe(
      'node scripts/design-proof-router.mjs',
    );
  });
});
