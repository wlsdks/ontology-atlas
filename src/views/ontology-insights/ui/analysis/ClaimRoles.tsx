'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { resolveNodeDocument, type KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { Button, OntologyMapKindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import type { AnalysisClaim } from '../../lib/analysis-model';

const ROLE_LIMIT = 6;
const name = (node: KnowledgeGraphNode) => node.display ?? node.title;

export function ClaimRoles({ claim, href }: { claim: AnalysisClaim; href: (slug: string) => string }) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const [limit, setLimit] = useState(ROLE_LIMIT);
  const list = useRef<HTMLUListElement>(null);
  const pending = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = [...list.current?.querySelectorAll<HTMLAnchorElement>('[data-implementation-role]') ?? []].find(node => node.dataset.implementationRole === pending.current);
    if (target) { target.focus(); pending.current = null; }
  }, [limit]);
  return <div data-testid="analysis-implementation-diagram" className="mt-5">
    <p className="text-label text-[color:var(--color-text-tertiary)]">{t('connectedElements')}</p>
    {claim.roles.length ? <ul ref={list} className="mt-1 -ml-2">
      {claim.roles.slice(0, limit).map(role => <li key={role.id}><Link href={href(resolveNodeDocument(role).ownSlug!)} data-testid="analysis-implementation-link" data-implementation-role={role.id} aria-label={t('openElementDocument', { name: name(role) })}
        className={controlClass({ shape: 'row', size: 'md', tone: 'secondary', hoverSurface: 'lift', className: 'atlas-touch-floor gap-2' })}><OntologyMapKindGlyph kind="element" size={14} /><span className="min-w-0 truncate">{name(role)}</span></Link></li>)}
    </ul> : <div data-testid="analysis-implementation-empty" className="mt-2"><p className="text-body">{t('noElementLinks')}</p><p className="mt-1 text-label text-[color:var(--color-text-tertiary)]">{claim.paths.length ? t('pathsWithoutElements', { count: claim.paths.length }) : t('recordingNotImplementation')}</p></div>}
    {claim.roles.length > limit ? <Button variant="ghost" size="sm" className="atlas-touch-floor mt-1" data-testid="analysis-implementation-more" onClick={() => { pending.current = claim.roles[limit]?.id ?? null; setLimit(value => value + ROLE_LIMIT); }}>{t('showMoreItems', { count: Math.min(ROLE_LIMIT, claim.roles.length - limit) })}</Button> : null}
  </div>;
}
