import type { useTranslations } from 'next-intl';

import type { CoverageColumn, ScopeDeclaration } from '@/entities/agent-files';

export type TranslateFn = ReturnType<typeof useTranslations<'harness'>>;

export const COLUMN_KEYS: Readonly<
  Record<CoverageColumn, { head: string; gloss: string; hint: string; empty: string }>
> = {
  told: {
    head: 'coverageColumnTold',
    gloss: 'coverageColumnToldGloss',
    hint: 'coverageColumnToldHint',
    empty: 'coverageEmptyTold',
  },
  gated: {
    head: 'coverageColumnGated',
    gloss: 'coverageColumnGatedGloss',
    hint: 'coverageColumnGatedHint',
    empty: 'coverageEmptyGated',
  },
  watched: {
    head: 'coverageColumnWatched',
    gloss: 'coverageColumnWatchedGloss',
    hint: 'coverageColumnWatchedHint',
    empty: 'coverageEmptyWatched',
  },
};

export const ORIGIN_LABEL: Readonly<Record<ScopeDeclaration['origin'], string>> = {
  root: 'coverageKindRoot',
  rule: 'coverageKindRule',
  'nested-agents': 'coverageKindNested',
  hook: 'coverageKindHook',
  'git-hook': 'coverageKindGitHook',
  permissions: 'coverageKindPermissions',
  exclusion: 'coverageKindExclusion',
  script: 'coverageKindScript',
  workflow: 'coverageKindWorkflow',
};
