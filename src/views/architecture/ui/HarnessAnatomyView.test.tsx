import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import type { HarnessReport } from '@/entities/agent-files';

import { HarnessAnatomyView } from './HarnessAnatomyView';

/**
 * **The structure view's one job: say what is here, what is not, and what a checkout cannot know.**
 *
 * Each test below names the reading it refuses. The screen competes with a field of tools that
 * grade a repository out of ten, and this repository measured why that fails — a maturity scanner
 * put Anthropic's own skills repository at the same grade as an abandoned toy, because files alone
 * cannot tell *absent* from *rightly absent*. So an absent part says "none yet" and the agent loop
 * says something else entirely, and both of those are assertions here rather than styling.
 */

function report(partial: Partial<HarnessReport> = {}): HarnessReport {
  return {
    analysis: { records: [], checks: {} as never, findings: [] } as never,
    hookGroups: [],
    times: [],
    contents: new Map(),
    checks: { wiredHooks: 0, gitHooks: 0, scripts: [], total: 0 },
    guideDocumentCount: 0,
    coverage: [],
    documentReach: { total: 0 } as never,
    testFiles: [],
    gitHookFiles: [],
    workflowFiles: [],
    timesAreFileMtime: true,
    ...partial,
  } as HarnessReport;
}

function mount(value: HarnessReport) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <HarnessAnatomyView report={value} />
    </NextIntlClientProvider>,
  );
}

describe('HarnessAnatomyView', () => {
  it('borrows the coverage matrix’s three words rather than inventing a second vocabulary', () => {
    mount(report());
    for (const band of ['tells', 'gates', 'watches']) {
      expect(screen.getByTestId(`harness-anatomy-band-${band}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('harness-anatomy-band-tells')).toHaveTextContent('말해둔 것');
    expect(screen.getByTestId('harness-anatomy-band-gates')).toHaveTextContent('막는 것');
    expect(screen.getByTestId('harness-anatomy-band-watches')).toHaveTextContent('지켜보는 것');
  });

  it('says "none yet" for a part this repository does not have, and never a grade', () => {
    mount(report());
    expect(screen.getByTestId('harness-anatomy-count-tools')).toHaveTextContent('아직 없음');
    expect(screen.getByTestId('harness-anatomy-slot-tools')).toHaveAttribute(
      'data-status',
      'absent',
    );
    expect(document.body.textContent).not.toMatch(/%|\/\s*10\b/);
  });

  it('prints the agent loop as something the repository does not decide, not as zero', () => {
    mount(report());
    const loop = screen.getByTestId('harness-anatomy-slot-loop');
    expect(loop).toHaveAttribute('data-status', 'tool-owned');
    expect(loop).not.toHaveTextContent('아직 없음');
    expect(screen.getByTestId('harness-anatomy-band-tool')).toHaveTextContent(
      '저장소가 정하지 않는 것',
    );
  });

  it('carries a unit beside every count, so no number reads as a rank', () => {
    mount(
      report({
        checks: { wiredHooks: 0, gitHooks: 2, scripts: ['lint', 'test'], total: 4 },
      }),
    );
    expect(screen.getByTestId('harness-anatomy-count-checks')).toHaveTextContent('스크립트 2개');
    expect(screen.getByTestId('harness-anatomy-count-gitGates')).toHaveTextContent('파일 2개');
  });

  it('shows the names behind a count, and says how many it is not showing', () => {
    mount(
      report({
        checks: {
          wiredHooks: 0,
          gitHooks: 0,
          scripts: ['lint', 'lint:css', 'test', 'test:e2e', 'typecheck'],
          total: 5,
        },
      }),
    );
    const slot = screen.getByTestId('harness-anatomy-slot-checks');
    expect(slot).toHaveTextContent('lint · lint:css · test · test:e2e');
    expect(slot).toHaveTextContent('그 외 1개');
  });

  it('states the approval a file cannot record, once per band rather than per hook', () => {
    mount(
      report({
        hookGroups: [
          {
            configPath: '.codex/hooks.json',
            approvalGate: true,
            hooks: [
              {
                events: 'beforeToolUse',
                ref: { path: '.codex/hooks/guard.sh', command: 'x' },
                status: 'wired',
              },
            ],
          },
        ] as never,
      }),
    );
    const gates = screen.getByTestId('harness-anatomy-band-gates');
    expect(within(gates).getByTestId('harness-anatomy-approval')).toHaveTextContent(
      '.codex/hooks.json',
    );
  });

  it('splits the permission decisions instead of printing one number for all of them', () => {
    mount(
      report({
        contents: new Map([
          [
            '.claude/settings.json',
            JSON.stringify({ permissions: { allow: ['a'], deny: ['b', 'c'], ask: ['d'] } }),
          ],
        ]),
      }),
    );
    expect(screen.getByTestId('harness-anatomy-slot-permissions')).toHaveTextContent(
      '허용 1 · 물어봄 1 · 금지 2',
    );
  });

  it('offers the address that would fill an empty part, and only for the empty ones', () => {
    /* The owner's goal for this tab: an empty place is visible *and addable*. The line is an
       address from the tool's own documentation, never "you should have one" — which is the
       maturity score this view refuses, wearing a different hat. */
    mount(
      report({
        checks: { wiredHooks: 0, gitHooks: 0, scripts: ['lint'], total: 1 },
      }),
    );
    const empty = screen.getByTestId('harness-anatomy-slot-tools');
    expect(empty).toHaveTextContent('이런 것이 사는 자리');
    expect(empty).toHaveTextContent('.mcp.json');

    /* A part that is there is not told where it could have been. */
    const present = screen.getByTestId('harness-anatomy-slot-checks');
    expect(present).not.toHaveTextContent('이런 것이 사는 자리');
  });

  it('never offers an address for the part the repository does not own', () => {
    mount(report());
    expect(screen.getByTestId('harness-anatomy-slot-loop')).not.toHaveTextContent(
      '이런 것이 사는 자리',
    );
  });

  it('copies the address rather than writing anything into the repository', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mount(report());
    fireEvent.click(screen.getByTestId('harness-anatomy-copy-tools'));
    expect(writeText).toHaveBeenCalledWith('.mcp.json');
    expect(await screen.findByText('복사함')).toBeInTheDocument();
  });

  it('prints what a turn costs beside the count that cannot say it', () => {
    mount(
      report({
        analysis: {
          records: [
            { path: 'AGENTS.md', kind: 'instructions', ruleId: 'agents-md', tools: [], bytes: 30_720, drift: [] },
          ],
        } as never,
      }),
    );
    const always = screen.getByTestId('harness-anatomy-slot-always');
    expect(always).toHaveTextContent('매 턴 읽는 분량 30.0 KB');
    /* And the number carries its own argument rather than standing bare. */
    expect(within(always).getByRole('button', { name: '이 분량이 왜 중요한가' })).toBeInTheDocument();
  });

  it('says nothing about weight when nothing is read unconditionally', () => {
    mount(report());
    expect(screen.getByTestId('harness-anatomy-slot-always')).not.toHaveTextContent('매 턴');
  });

  it('warns once, in the band that gates, about a guard the disk does not have', () => {
    mount(
      report({
        hookGroups: [
          {
            configPath: '.claude/settings.json',
            approvalGate: false,
            hooks: [
              {
                events: 'PreToolUse',
                ref: { path: '.claude/hooks/block-npm-publish.sh', command: 'x' },
                status: 'missing',
              },
            ],
          },
        ] as never,
      }),
    );
    const warning = screen.getByTestId('harness-anatomy-silent');
    expect(warning).toHaveTextContent('block-npm-publish.sh');
    expect(within(screen.getByTestId('harness-anatomy-band-gates')).getByTestId(
      'harness-anatomy-silent',
    )).toBe(warning);
  });

  it('shows no warning when nothing is missing', () => {
    mount(report());
    expect(screen.queryByTestId('harness-anatomy-silent')).toBeNull();
  });
});
