import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DESIGN_CHANGE_SIGNALS,
  routeDesignProof,
} from '../../scripts/lib/design-proof-router.mjs';
import { parseDesignRouteArgs } from '../../scripts/design-proof-router.mjs';

const ROOT = process.cwd();
const CLI = 'scripts/design-proof-router.mjs';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const proofNames = (changes: string[]) => routeDesignProof({ changes }).proofs.map((item) => item.name);

describe('Atlas design proof routing', () => {
  it('keeps copy and local visual work out of council', () => {
    expect(routeDesignProof({ changes: ['copy'] })).toMatchObject({
      directions: false,
      council: { required: false, seats: [] },
      proofs: [
        { name: 'checks:changed', scope: 'changed-paths' },
        { name: 'computer-use-loop', scope: 'affected-state' },
      ],
    });
    expect(routeDesignProof({ changes: ['local-visual'] })).toMatchObject({
      directions: false,
      council: { required: false, seats: [] },
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
    const rendered = [
      'copy',
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

  it('reserves divergence and council for structural commitments', () => {
    const result = routeDesignProof({
      changes: ['new-surface', 'desktop-shell', 'motion', 'agent-handoff'],
    });
    expect(result).toMatchObject({
      directions: true,
      council: {
        required: true,
        crossCritique: 'only-on-material-conflict',
        record: true,
      },
      sequence: ['directions', 'build', 'proof', 'council', 'remeasure-changed-proof'],
    });
    expect(result.council.seats).toEqual([
      'design-lead',
      'design-interaction',
      'design-motion',
      'design-workbench',
      'design-responsive',
      'design-handoff',
    ]);
  });

  it('gives a design-contract change system review and a probed gate without a directions ritual', () => {
    expect(routeDesignProof({ changes: ['design-contract'] })).toMatchObject({
      directions: false,
      council: {
        required: true,
        seats: ['design-lead', 'design-system'],
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
      policyVersion: 1,
      directions: false,
      council: { required: false, seats: [] },
    });
    expect(parseDesignRouteArgs(['--change=motion,responsive'])).toMatchObject({
      changes: ['motion', 'responsive'],
    });
  });

  it('keeps the active policy mirrored and reachable from the agent router', () => {
    const agents = read('AGENTS.md');
    expect(agents).toContain('pnpm design:route');
    expect(JSON.parse(read('package.json')).scripts['design:route']).toBe(
      'node scripts/design-proof-router.mjs',
    );
    for (const skill of ['design-directions', 'design-build', 'design-audit', 'design-council']) {
      expect(read(`.agents/skills/${skill}/SKILL.md`)).toBe(read(`.claude/skills/${skill}/SKILL.md`));
    }
  });

  it('makes iterative observation, not end-only imagination, the build contract', () => {
    const build = read('.agents/skills/design-build/SKILL.md');
    for (const marker of [
      'computer-use-loop',
      'Capture the exact baseline state',
      'one coherent visual slice',
      'fresh Computer Use accessibility tree and screenshot',
      'Fix the observed defect before starting the next slice',
    ]) {
      expect(build).toContain(marker);
    }
    expect(read('docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md')).toContain(
      'Do not build a whole UI from imagination',
    );
  });

  it('removes the retired universal ceremony triggers', () => {
    expect(read('.agents/skills/design-directions/SKILL.md')).not.toMatch(
      /before any non-trivial visual/i,
    );
    expect(read('.agents/skills/design-audit/SKILL.md')).not.toMatch(
      /after every frontend implementation/i,
    );
    expect(read('.agents/skills/design-council/SKILL.md')).not.toMatch(
      /hierarchy and system always attend/i,
    );
  });
});
