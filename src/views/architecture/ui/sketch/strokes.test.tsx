import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';

import {
  FAN_PROFILE_FRONTMATTER,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../../tests/fixtures/architecture-profile-cases.mjs';
import { ArchitectureSketch } from '../ArchitectureSketch';
import { atXl, sketch, withGeometry } from '../../../../../tests/helpers/architecture-sketch';

type SketchProps = ComponentProps<typeof ArchitectureSketch>;

function draw(...args: Parameters<typeof sketch>) {
  return render(sketch(...args));
}

describe('strokes on a ladder', () => {
  /* Too narrow for four roles across, so the width rule picks the ladder without a measured height. */
  const PAIRED = { clientWidth: 780, scrollWidth: 780, clientHeight: 700, scrollHeight: 700 };
  const NARROW = { clientWidth: 390, scrollWidth: 390, clientHeight: 800, scrollHeight: 800 };
  const stroke = (kind: string, from: string, to: string) =>
    document.querySelector<SVGPathElement>(
      `[data-edge-kind="${kind}"][data-edge-from="${from}"][data-edge-to="${to}"]`,
    )!;
  const faceOf = (role: string) => {
    const face = document.querySelector(`[data-testid="architecture-graph-box-${role}"] rect.architecture-node-face`)!;
    const x = Number(face.getAttribute('x'));
    return { x, right: x + Number(face.getAttribute('width')) };
  };
  const startX = (path: SVGPathElement) => Number(path.getAttribute('d')!.split(' ')[1]);

  it("rests a profile's three rank skips whole on a wide paired canvas, and brings them on selection elsewhere", () => {
    const skip = () => stroke('permitted', 'adapter', 'domain');
    atXl(() =>
      withGeometry({ ...PAIRED, clientWidth: 1512, scrollWidth: 1512 }, () => {
        const { unmount } = draw();
        expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-evidence-layout', 'paired-ladder');
        expect(skip()).toHaveAttribute('data-edge-drawn', 'true');
        expect(screen.getByTestId('architecture-edge-sentence-adapter-domain').textContent).toBe('adapter may depend on domain');
        unmount();
      }),
    );
    for (const narrower of [PAIRED, NARROW])
      withGeometry(narrower, () => {
        const { unmount } = draw();
        expect(skip()).toHaveAttribute('data-edge-drawn', 'false');
        unmount();
      });
    withGeometry(PAIRED, () => {
      draw({}, new Set(), [], HEXAGONAL_PROFILE_FRONTMATTER, 'adapter');
      expect(skip()).toHaveAttribute('data-edge-drawn', 'true');
    });
  });

  it.each([
    {
      cost: 'their own sentences',
      waitsAt: 1512,
      restsAt: 2000,
      extra: {
        edgeSentence: ((edge) =>
          `${edge.from} > ${edge.to}${edge.kind === 'permitted' && edge.columnSpan > 1 ? ', and on nothing that the list leaves out' : ''}`) as SketchProps['edgeSentence'],
      },
    },
    { cost: 'the count its row gap is sized for', waitsAt: 1336, restsAt: 1512, extra: {} },
    {
      cost: "the observation lane's ground",
      waitsAt: 960,
      restsAt: 1100,
      extra: { edgeSentence: ((edge) => `${edge.from} > ${edge.to}`) as SketchProps['edgeSentence'] },
    },
    { cost: 'a role description', waitsAt: 1400, restsAt: 1512, extra: { roleSummary: () => 'word '.repeat(30).trim() } },
  ])('rests rank skips only once the canvas spares $cost', ({ waitsAt, restsAt, extra }) => {
    for (const [clientWidth, drawn] of [[waitsAt, 'false'], [restsAt, 'true']] as const)
      atXl(() =>
        withGeometry({ ...PAIRED, clientWidth, scrollWidth: clientWidth }, () => {
          const { unmount } = draw({}, new Set(), [], HEXAGONAL_PROFILE_FRONTMATTER, null, extra);
          expect(stroke('permitted', 'adapter', 'domain')).toHaveAttribute('data-edge-drawn', drawn);
          unmount();
        }),
      );
  });

  it('keeps a rank skip waiting beside deeper sibling arcs until its own sentence reads whole', () => {
    const fanWithRankSkip = { ...FAN_PROFILE_FRONTMATTER, allow_shell: ['billing', 'catalog', 'shipping', 'core'] };
    for (const [clientWidth, drawn] of [[780, 'false'], [1900, 'true']] as const)
      atXl(() =>
        withGeometry({ ...PAIRED, clientWidth, scrollWidth: clientWidth }, () => {
          const { unmount } = draw({}, new Set(), [], fanWithRankSkip);
          expect(stroke('permitted', 'shell', 'core')).toHaveAttribute('data-edge-drawn', drawn);
          if (drawn === 'true')
            expect(screen.getByTestId('architecture-edge-sentence-shell-core').textContent).toBe('shell may depend on core');
          unmount();
        }),
      );
  });

  it('rests the same rule skips before and after a record lands with a skip of its own', () => {
    const chain = {
      ...Object.fromEntries(Object.entries(FAN_PROFILE_FRONTMATTER).filter(([key]) => !/_(billing|shipping)$/.test(key))),
      allow_shell: ['catalog', 'core'],
    };
    const roleSummary = (id: string) => (id === 'shell' ? 'word '.repeat(20).trim() : null);
    const restsAt = (clientWidth: number, traffic: Parameters<typeof sketch>[2]) => {
      let drawn: string | null = null;
      atXl(() =>
        withGeometry({ ...PAIRED, clientWidth, scrollWidth: clientWidth }, () => {
          const { unmount } = draw({}, new Set(), traffic, chain, null, { roleSummary });
          drawn = stroke('permitted', 'shell', 'core').getAttribute('data-edge-drawn');
          unmount();
        }),
      );
      return drawn;
    };
    const widths = Array.from({ length: 30 }, (_, step) => 960 + step * 16);
    const landed = [{ fromRole: 'shell', toRole: 'core', count: 12 }];
    expect(widths.map((width) => restsAt(width, landed))).toEqual(widths.map((width) => restsAt(width, [])));
    expect(new Set(widths.map((width) => restsAt(width, []))).size).toBe(2);
  });

  it("holds the observation lane for both counts of a drawn side arc's pair before the face grows", () => {
    atXl(() =>
      withGeometry({ ...PAIRED, clientWidth: 1200, scrollWidth: 1200 }, () => {
        const traffic = [{ fromRole: 'shell', toRole: 'catalog', count: 12 }, { fromRole: 'catalog', toRole: 'shell', count: 3 }];
        draw({}, new Set(['catalog>shell']), traffic, FAN_PROFILE_FRONTMATTER);
        const said = (from: string, to: string) =>
          document.querySelector(`[data-edge-sentence="drawn"][data-edge-sentence-kind="traffic"][data-testid="architecture-edge-sentence-${from}-${to}"]`)?.textContent;
        expect([said('shell', 'catalog'), said('catalog', 'shell')]).toEqual(['shell reaches catalog in 12 imports', 'catalog reaches shell in 3 imports']);
      }),
    );
  });

  it('grows the face to its cap on a wide canvas though the rule lane claims more than its share', () => {
    atXl(() =>
      withGeometry({ ...PAIRED, clientWidth: 1512, scrollWidth: 1512 }, () => {
        draw();
        expect(faceOf('adapter').right - faceOf('adapter').x).toBe(560);
      }),
    );
  });

  it('lets a count read past the gutter in a row gap no rule sentence holds', () => {
    withGeometry({ ...PAIRED, clientWidth: 1200, scrollWidth: 1200 }, () => {
      draw({}, new Set(), [{ fromRole: 'features', toRole: 'entities', count: 12 }], FSD_PROFILE_FRONTMATTER);
      expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-evidence-layout', 'paired-ladder');
      const count = document.querySelector('[data-edge-sentence-kind="traffic"][data-testid="architecture-edge-sentence-features-entities"]')!;
      expect(count.textContent).toBe('features reaches entities in 12 imports');
    });
  });

  it('gives each stroke of an opposed pair a line of its own', () => {
    withGeometry(PAIRED, () => {
      draw({}, new Set(['application>adapter']), [
        { fromRole: 'adapter', toRole: 'application', count: 12 },
        { fromRole: 'application', toRole: 'adapter', count: 2 },
      ]);
      const offsets = [stroke('traffic', 'adapter', 'application'), stroke('traffic', 'application', 'adapter')].map(
        (path) => Number(path.getAttribute('data-edge-track-offset')),
      );
      expect(offsets[0]).toBe(-offsets[1]);
      expect(offsets[0]).not.toBe(0);
    });
  });

  it('starts a skip at a port on the side of its face on the narrow ladder, rules left and imports right', () => {
    withGeometry(NARROW, () => {
      const { container } = draw({}, new Set(['domain>adapter']), [{ fromRole: 'domain', toRole: 'adapter', count: 3 }], HEXAGONAL_PROFILE_FRONTMATTER, 'adapter');
      expect(startX(stroke('traffic', 'domain', 'adapter'))).toBe(faceOf('domain').right);
      expect(startX(stroke('permitted', 'adapter', 'domain'))).toBe(faceOf('adapter').x);
      const sides = (role: string) =>
        [...container.querySelectorAll(`[data-testid="architecture-graph-box-${role}"] [data-port-side]`)].map((port) =>
          port.getAttribute('data-port-side'),
        );
      expect(sides('domain')).toEqual(['right']);
      expect(sides('adapter')).toEqual(['left']);
    });
  });

  it.each([
    { ladder: 'narrow', layout: 'combined', clientWidth: 390 },
    { ladder: 'paired', layout: 'paired-ladder', clientWidth: 744 },
  ])('keeps the $ladder ladder inside a canvas with no ground to spare, skips drawn', ({ layout, clientWidth }) => {
    withGeometry({ ...PAIRED, clientWidth, scrollWidth: clientWidth }, () => {
      draw({}, new Set(['domain>adapter']), [{ fromRole: 'domain', toRole: 'adapter', count: 3 }]);
      const graph = screen.getByTestId('architecture-graph');
      expect(graph).toHaveAttribute('data-evidence-layout', layout);
      expect(Number(graph.getAttribute('width'))).toBeLessThanOrEqual(clientWidth);
    });
  });

  it.each([780, 1512])('keeps the faces where the rules put them when a record lands or gains a violation on a %ipx canvas', (clientWidth) => {
    atXl(() =>
      withGeometry({ ...PAIRED, clientWidth, scrollWidth: clientWidth }, () => {
        const frame = () => [faceOf('views'), screen.getByTestId('architecture-graph').getAttribute('width')];
        const clean = [{ fromRole: 'views', toRole: 'shared', count: 5 }];
        const { rerender } = render(sketch({}, new Set(), [], FSD_PROFILE_FRONTMATTER));
        expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-evidence-layout', 'paired-ladder');
        const empty = frame();
        rerender(sketch({}, new Set(), clean, FSD_PROFILE_FRONTMATTER));
        expect(frame()).toEqual(empty);
        rerender(sketch({}, new Set(['shared>views']), [...clean, { fromRole: 'shared', toRole: 'views', count: 1 }], FSD_PROFILE_FRONTMATTER));
        expect(frame()).toEqual(empty);
      }),
    );
  });

  it('stacks a rule skip run, its sentence, the joint and the count line in the across row gap', () => {
    withGeometry({ ...PAIRED, clientWidth: 1200, scrollWidth: 1200 }, () => {
      draw({}, new Set(), [{ fromRole: 'adapter', toRole: 'application', count: 3 }], HEXAGONAL_PROFILE_FRONTMATTER, 'adapter');
      const at = (selector: string, attribute = 'y') => Number(document.querySelector(`[data-architecture-axis="across"] ${selector}`)!.getAttribute(attribute));
      const said = (kind: string, to: string) => at(`[data-edge-sentence="drawn"][data-edge-sentence-kind="${kind}"][data-testid="architecture-edge-sentence-adapter-${to}"]`);
      const runY = Number(/ L \S+ (\S+)/.exec(stroke('permitted', 'adapter', 'domain').getAttribute('d')!)![1]);
      const levels = [runY, said('permitted', 'domain') - 9, said('permitted', 'domain') + 3, at('[data-testid="architecture-delta-connector-application"] + circle', 'cy') - 3, said('traffic', 'application') + 3, at('[data-testid="architecture-observation-box-adapter"]')];
      expect(levels).toEqual([...new Set(levels)].sort((above, below) => above - below));
    });
  });

  it('seats the sentence of an opposed pair of across skips clear of the outer run', () => {
    withGeometry({ ...PAIRED, clientWidth: 1200, scrollWidth: 1200 }, () => {
      const traffic = [{ fromRole: 'adapter', toRole: 'domain', count: 3 }, { fromRole: 'domain', toRole: 'adapter', count: 1 }];
      draw({}, new Set(['domain>adapter']), traffic, HEXAGONAL_PROFILE_FRONTMATTER, 'adapter');
      expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-architecture-axis', 'across');
      for (const drawn of [stroke('traffic', 'adapter', 'domain'), stroke('traffic', 'domain', 'adapter')])
        expect(drawn).toHaveAttribute('data-edge-drawn', 'true');
      const runY = (from: string, to: string) => Number(/ L \S+ (\S+)/.exec(stroke('traffic', from, to).getAttribute('d')!)![1]);
      const said = document.querySelector('[data-edge-sentence="drawn"][data-edge-sentence-kind="traffic"][data-testid="architecture-edge-sentence-domain-adapter"]')!;
      const glyphTop = Number(said.getAttribute('y')) - 9;
      expect(glyphTop - Math.max(runY('adapter', 'domain'), runY('domain', 'adapter'))).toBeGreaterThanOrEqual(6);
    });
  });

  it('seats a count sentence a line clear of the dated observation heading on the across chain', () => {
    withGeometry({ ...PAIRED, clientWidth: 1200, scrollWidth: 1200 }, () => {
      const traffic = [{ fromRole: 'adapter', toRole: 'application', count: 3 }];
      draw({}, new Set(), traffic, HEXAGONAL_PROFILE_FRONTMATTER, null, { observationStamp: 'read from the record of 2026-11-11' });
      const yOf = (selector: string) => Number(document.querySelector(selector)!.getAttribute('y'));
      const headingY = yOf('[data-testid="architecture-across-lane-headings"] text:nth-of-type(2)');
      const countY = yOf('[data-edge-sentence="drawn"][data-edge-sentence-kind="traffic"][data-testid="architecture-edge-sentence-adapter-application"]');
      expect(headingY - countY).toBeGreaterThan(13);
    });
  });

  it('draws every rule between neighbouring ranks of a fan at rest, though four of them pass a sibling', () => {
    withGeometry(PAIRED, () => {
      draw({}, new Set(), [], FAN_PROFILE_FRONTMATTER);
      for (const sibling of ['billing', 'catalog', 'shipping'])
        for (const rule of [stroke('permitted', 'shell', sibling), stroke('permitted', sibling, 'core')])
          expect(rule).toHaveAttribute('data-edge-drawn', 'true');
    });
  });

  it('widens the gutter until a rule and a violation in one row gap both read whole', () => {
    atXl(() =>
      withGeometry({ clientWidth: 1040, scrollWidth: 1040, clientHeight: 640, scrollHeight: 640 }, () => {
      const traffic = [{ fromRole: 'adapter', toRole: 'application', count: 12 }, { fromRole: 'application', toRole: 'adapter', count: 2 }];
      const edgeSentence: SketchProps['edgeSentence'] = (edge) =>
        edge.kind === 'permitted' ? `${edge.from} may depend on ${edge.to}` : `${edge.from} > ${edge.to}: ${edge.count}`;
      draw({}, new Set(['application>adapter']), traffic, HEXAGONAL_PROFILE_FRONTMATTER, null, { edgeSentence });
      expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-evidence-layout', 'paired-ladder');
      const read = (kind: string, from: string, to: string) =>
        document.querySelector(
          `[data-edge-sentence-kind="${kind}"][data-testid="architecture-edge-sentence-${from}-${to}"]`,
        );
      expect(read('permitted', 'adapter', 'application')).toHaveTextContent('adapter may depend on application');
      expect(read('traffic', 'application', 'adapter')).toHaveTextContent('application > adapter: 2');
    }),
    );
  });

  it('numbers roles the rules cannot order with the rank they share', () => {
    withGeometry(PAIRED, () => {
      draw({}, new Set(), [], FAN_PROFILE_FRONTMATTER);
      const numeral = (role: string) => screen.getByTestId(`architecture-role-index-${role}`).textContent;
      expect(['shell', 'billing', 'catalog', 'shipping', 'core'].map(numeral)).toEqual(['01', '02', '02', '02', '03']);
    });
  });
});
