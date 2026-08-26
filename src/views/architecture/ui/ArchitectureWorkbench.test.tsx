import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import {
  parseArchitectureProfile,
  type ArchitectureHandoffContext,
} from '@/entities/architecture-profile';
import { FSD_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { ArchitectureWorkbench } from './ArchitectureWorkbench';

function renderWorkbench(handoffContext?: ArchitectureHandoffContext) {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ArchitectureWorkbench
        profiles={[profile]}
        handoffContexts={handoffContext ? { [profile.slug]: handoffContext } : undefined}
      />
    </NextIntlClientProvider>,
  );
}

describe('ArchitectureWorkbench', () => {
  it('opens with a scoped living blueprint instead of an ontology graph', () => {
    renderWorkbench();
    expect(screen.getByRole('heading', { name: 'Architecture' })).toBeInTheDocument();
    expect(screen.getAllByText('Atlas Web Workbench')).toHaveLength(2);
    expect(screen.getByText(/Feature-Sliced Design/)).toBeInTheDocument();
    expect(screen.getByTestId('architecture-role-routing')).toBeInTheDocument();
    expect(screen.getByTestId('architecture-role-shared')).toBeInTheDocument();
    expect(screen.getByText('Source check required')).toBeInTheDocument();
    expect(screen.getByTestId('architecture-bottom-tab-reserve')).toHaveClass(
      'h-[var(--topology-mobile-bottom-tab-reserve)]',
      'lg:hidden',
    );
  });

  it('keeps the same blueprint while switching from understand to plan and verify', () => {
    renderWorkbench();
    const role = screen.getByTestId('architecture-role-features');
    const roleBox = role.getBoundingClientRect();
    const roleClassName = role.className;

    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));
    expect(screen.getByText('Architecture-first agent plan')).toBeInTheDocument();
    expect(screen.getByText(/inspect_architecture/)).toBeInTheDocument();
    expect(screen.getByTestId('architecture-role-features')).toBe(role);
    expect(role.getBoundingClientRect()).toEqual(roleBox);
    expect(role.className).toBe(roleClassName);

    fireEvent.click(screen.getByRole('radio', { name: 'Verify' }));
    expect(screen.getByText('Verify the actual change')).toBeInTheDocument();
    expect(screen.getByText(/unknown is not compliant/i)).toBeInTheDocument();
    expect(screen.getByTestId('architecture-role-features')).toBe(role);
  });

  it('reanchors a prior scroll end after a taller workflow stage mounts', async () => {
    renderWorkbench();
    const scroller = screen.getByTestId('architecture-layout-scroll');
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get: () => screen.getByTestId('architecture-blueprint').parentElement
        ?.querySelector('[data-architecture-mode="plan"]')
        ? 600
        : 500,
    });
    scroller.scrollTop = 300;

    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));

    expect(scroller).toHaveAttribute('data-architecture-scroll-reanchor', 'mode-end');
    await waitFor(() => expect(scroller.scrollTop).toBe(400));
  });

  it('copies an executable architecture handoff instead of a generic prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWorkbench({
      sourceRoot: '/Users/dana/Atlas Source',
      vaultRoot: '/Users/dana/Atlas Source/docs/ontology',
      cliEntry: '/Users/dana/Atlas Source/cli/src/index.mjs',
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy agent handoff' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('architectureChangePlan:v1'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("--profile 'atlas-web' --json"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("--vault '/Users/dana/Atlas Source/docs/ontology'"),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agent handoff copied' }))
      .toHaveAttribute('data-architecture-copy-state', 'copied'));
  });

  it('keeps a retryable clipboard error on screen', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderWorkbench();
    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy agent handoff' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Could not copy. Try again' }))
      .toHaveAttribute('data-architecture-copy-state', 'error'));
  });
});
