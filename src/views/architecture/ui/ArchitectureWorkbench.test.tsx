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

  /*
   * ⚠️ **The screen used to say everything twice.** A diagram of the roles sat above a list of the
   * same roles, so `adapter` and its globs appeared in two places at once. The owner's reaction to
   * the installed build was that it neither looked good nor read as a flow -- and the redundancy is
   * why: with the information split across two blocks neither half could use the width, leaving a
   * screen that was simultaneously repetitive and empty. One band per role now carries the name,
   * the globs and the allowances together.
   */
  it('draws each role exactly once', () => {
    renderWorkbench();
    for (const id of ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared']) {
      expect(
        screen.getAllByTestId(`architecture-role-${id}`),
        `${id} must be drawn once, not once per block`,
      ).toHaveLength(1);
    }
    // The glob is the part that was literally duplicated, so it is what the guard reads.
    expect(screen.getAllByText('src/shared/**')).toHaveLength(1);
  });

  /*
   * ⚠️ **The drawing must be a shape, not a list with decoration.** Four rounds died on the same
   * mistake: cards with arrows between them, boxes in a column, bands with arcs, bands with a grid
   * of dots. Each asked the reader to assemble the structure from rows, and the owner's verdict
   * never changed -- "can you see a flow in this?".
   *
   * Nested layers are the shape every layered architecture is taught with, and containment *is* the
   * rule: an outer ring may depend on everything it encloses, the core depends on nothing. There
   * are no arrows left to point the wrong way, which is what broke the very first version.
   */
  it('nests the layers outer to inner, with the sink at the core', () => {
    renderWorkbench();
    const order = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];
    const rings = [...screen.getByTestId('architecture-flow-svg').querySelectorAll('g[data-testid^="architecture-layer-"]')];

    expect(rings, 'one ring per layer').toHaveLength(order.length);
    expect(
      rings.map((ring) => ring.querySelector('text')?.getAttribute('data-testid')),
      'rings run outer to inner in dependency order',
    ).toEqual(order.map((id) => `architecture-role-${id}`));

    /*
     * Geometry, not just order: each ring must sit strictly inside the one that may depend on it.
     * A regression that drew them stacked or overlapping would keep the order and lose the meaning.
     */
    const boxes = rings.map((ring) => {
      const rect = ring.querySelector('rect')!;
      return {
        x: Number(rect.getAttribute('x')),
        y: Number(rect.getAttribute('y')),
        w: Number(rect.getAttribute('width')),
        h: Number(rect.getAttribute('height')),
      };
    });
    boxes.slice(1).forEach((inner, index) => {
      const outer = boxes[index]!;
      expect(inner.x, `ring ${index + 1} starts inside ring ${index}`).toBeGreaterThan(outer.x);
      expect(inner.y, `ring ${index + 1} starts inside ring ${index}`).toBeGreaterThan(outer.y);
      expect(inner.x + inner.w, 'and ends inside it').toBeLessThan(outer.x + outer.w);
      expect(inner.y + inner.h, 'and ends inside it').toBeLessThan(outer.y + outer.h);
    });

    // One stroke the eye follows: dependency runs inward, from outside the shell to the core.
    expect(screen.getByTestId('architecture-flow-inward')).toBeInTheDocument();
  });

  /*
   * ⚠️ Containment claims every outer layer reaches every inner one. A `lower-only` profile says
   * exactly that, so there is nothing to disclaim -- and if this list ever appeared for FSD, the
   * rings would be granting permission the profile withheld.
   */
  it('claims no permission the profile withheld', () => {
    renderWorkbench();
    expect(screen.queryByTestId('architecture-nest-exceptions')).toBeNull();
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
