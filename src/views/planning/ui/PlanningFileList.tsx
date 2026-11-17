'use client';

import { useId, type ReactNode, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { FileImage, FileText } from 'lucide-react';
import { RowButton } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { groupPlanningFiles, isPlanningMarkdown } from '../model/file-groups';

export function PlanningFileList({ paths, selected, search, onSearch, onOpen, listRef, emptyMessage, draft }: {
  paths: readonly string[];
  selected: string | null;
  search: string;
  onSearch: (value: string) => void;
  onOpen: (path: string) => void;
  listRef: RefObject<HTMLDivElement | null>;
  emptyMessage: string | null;
  /** The new-document title row, drawn above the files. */
  draft?: ReactNode;
}) {
  const t = useTranslations('planning');
  const headingId = useId();
  const row = (path: string) => {
    const Icon = isPlanningMarkdown(path) ? FileText : FileImage;
    return <RowButton key={path} size="md" onClick={() => onOpen(path)} aria-label={path} title={path} aria-current={selected === path ? 'true' : undefined} active={selected === path} className="max-[769px]:min-h-11">
      <Icon size={ICON_SIZE.sm} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
      <span className="min-w-0 truncate">{path.slice(path.lastIndexOf('/') + 1)}</span>
    </RowButton>;
  };
  return <>
    <div className="flex-none pt-3 pb-1 lg:pr-4">
      <Input aria-label={t('findFile')} placeholder={t('findFile')} value={search} onChange={(event) => onSearch(event.target.value)} hint={search ? t('noContentSearch') : undefined} className="w-full" />
    </div>
    <div ref={listRef} data-planning-file-list className="min-h-0 flex-1 overflow-y-auto pt-1 pb-3 lg:pr-3">
      {draft}
      {groupPlanningFiles(paths).map((group, index) => group.folder
        ? <div key={group.folder} role="group" aria-labelledby={`${headingId}-${index}`} data-planning-folder={group.folder} className="pt-3">
          <p className="flex items-baseline gap-2 px-2.5 pb-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
            <span id={`${headingId}-${index}`} title={group.folder} className="min-w-0 truncate">{group.folder}</span>
            <span data-planning-folder-count className="ml-auto shrink-0 tabular-nums">{group.paths.length}</span>
          </p>
          {group.paths.map(row)}
        </div>
        : <div key="" data-planning-folder="">{group.paths.map(row)}</div>)}
      {emptyMessage && <p className="px-2.5 py-3 text-body leading-body text-[color:var(--color-text-secondary)]">{emptyMessage}</p>}
    </div>
  </>;
}
