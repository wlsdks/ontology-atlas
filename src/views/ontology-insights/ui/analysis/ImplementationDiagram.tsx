'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { resolveNodeDocument } from '@/entities/knowledge-graph';
import { Button, OntologyMapKindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { AnalysisClaim } from '../../lib/analysis-model';
import styles from './analysis.module.css';

interface Branch { id: string; path: string; x1: number; y1: number; x2: number; y2: number }

export function ImplementationDiagram({ claim, responsibility, href }: {
  claim: AnalysisClaim; responsibility: string; href: (slug: string) => string;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const [limit, setLimit] = useState(6);
  const roles = useMemo(() => claim.roles.slice(0, limit), [claim.roles, limit]);
  const host = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const source = element.querySelector<HTMLElement>('[data-implementation-source]');
    const targets = [...element.querySelectorAll<HTMLAnchorElement>('[data-implementation-role]')];
    if (!source) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const from = source.getBoundingClientRect();
      const next = targets.map(target => {
        const to = target.getBoundingClientRect();
        const stacked = to.left < from.right;
        const x1 = (stacked ? from.left + 12 : from.right) - origin.left;
        const y1 = (stacked ? from.bottom : from.top + from.height / 2) - origin.top;
        const x2 = to.left - origin.left, y2 = to.top + to.height / 2 - origin.top;
        const path = stacked ? `M ${x1} ${y1} V ${y2} H ${x2}` : `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`;
        return { id: target.dataset.implementationRole!, path, x1, y1, x2, y2 };
      });
      setBranches(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    [element, source, ...targets].forEach(node => observer.observe(node));
    const target = targets.find(node => node.dataset.implementationRole === pendingFocus.current);
    if (target) { target.focus(); target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); pendingFocus.current = null; }
    return () => observer.disconnect();
  }, [roles]);

  return <figure className={styles.capabilityObject} data-testid="analysis-implementation-diagram" aria-label={t('capabilityEvidence')}>
    <div ref={host} className={styles.implementationDiagram}>
      {roles.length ? <svg className={styles.implementationConnections} aria-hidden="true">
        {branches.map(branch => <g key={branch.id}>
          <path data-implementation-edge={branch.id} d={branch.path} />
          <circle cx={branch.x2} cy={branch.y2} r="3" />
        </g>)}
        {branches[0] ? <circle cx={branches[0].x1} cy={branches[0].y1} r="3" /> : null}
      </svg> : null}
      <div className={styles.implementationSubject} data-implementation-source>
        <span className={styles.nodeKind}><span className="inline-flex items-center gap-1.5"><OntologyMapKindGlyph kind="capability" size={14} />{t('capability')}</span></span>
        <h3 className="text-title font-[var(--font-weight-strong)]">{claim.node.display ?? claim.node.title}</h3>
        <p className="text-body text-[color:var(--color-text-secondary)]">{responsibility || t('responsibilityMissing')}</p>
      </div>
      <div className={styles.implementationElements}>
        <p className="mb-3 text-body font-[var(--font-weight-strong)]">{t('connectedElements', { count: claim.roles.length })}</p>
        <div className={styles.implementationRoles}>
          {roles.map(role => <Link key={role.id} href={href(resolveNodeDocument(role).ownSlug!)} data-testid="analysis-implementation-link" data-implementation-role={role.id}
            aria-label={t('openElementDocument', { name: role.display ?? role.title })}
            className={controlClass({ shape: 'card', size: 'lg', tone: 'strong', hoverSurface: 'lift', className: `atlas-touch-floor w-full justify-between ${styles.implementationRole}` })}>
            <span className="flex min-w-0 items-center gap-3"><OntologyMapKindGlyph kind="element" size={18} /><span className="text-body-lg font-[var(--font-weight-strong)]">{role.display ?? role.title}</span></span>
            <ArrowUpRight size={ICON_SIZE.sm} className="shrink-0 text-[color:var(--color-text-secondary)]" aria-hidden />
          </Link>)}
          {!roles.length ? <div className={styles.roleEmpty} data-testid="analysis-implementation-empty"><p className="text-body-lg">{t('noElementLinks')}</p><p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{claim.paths.length ? t('pathsWithoutElements', { count: claim.paths.length }) : t('recordingNotImplementation')}</p></div> : null}
        </div>
        {claim.roles.length > limit ? <Button variant="ghost" size="sm" className="atlas-touch-floor mt-3" data-testid="analysis-implementation-more" onClick={() => { pendingFocus.current = claim.roles[limit]?.id ?? null; setLimit(value => value + 6); }}>{t('showMoreItems', { count: Math.min(6, claim.roles.length - limit) })}</Button> : null}
      </div>
    </div>
    {roles.length ? <figcaption className="mt-5 text-body text-[color:var(--color-text-secondary)]">{t('implementationLegend')}</figcaption> : null}
  </figure>;
}
