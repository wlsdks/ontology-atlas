'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { VaultConflictError, type useLocalVault } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';
import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import { useToast } from '@/shared/ui';
import { buildDocsVaultPopoutHtml } from '../lib/popout-template';

export function useDocTools({
  manifest,
  localVault,
  selectedSlug,
  canEditCurrent,
}: {
  manifest: VaultManifest;
  localVault: ReturnType<typeof useLocalVault>;
  selectedSlug: string | null;
  canEditCurrent: boolean;
}) {
  const t = useTranslations('docsVault');
  const toast = useToast();
  const failureSentence = useFailureSentence();
  const handleInsertToc = useCallback(async () => {
    if (!canEditCurrent || !selectedSlug) return;
    if (typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const headings = doc.headings.filter(
      (h) => h.depth >= 2 && h.depth <= 3,
    );
    if (headings.length === 0) {
      toast.show(t('dialog.noHeadings'), 'info');
      return;
    }
    const tocLines = headings.map((h) => {
      const indent = h.depth === 3 ? '  ' : '';
      return `${indent}- [${h.text}](#${h.slug})`;
    });
    const tocBlock = [
      '<!-- toc:start -->',
      `## ${t('dialog.tocHeading')}`,
      '',
      ...tocLines,
      '<!-- toc:end -->',
    ].join('\n');
    const fh = localVault.fileHandles.get(selectedSlug);
    if (!fh) {
      toast.show(t('dialog.notLocalFile'), 'error');
      return;
    }
    try {
      const file = await fh.getFile();
      const raw = await file.text();
      let insertAfter = 0;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) insertAfter = end + 4;
        while (raw[insertAfter] === '\n') insertAfter += 1;
      }
      const stripped = raw.replace(
        /<!-- toc:start -->[\s\S]*?<!-- toc:end -->\n?/,
        '',
      );
      // `insertAfter` is not adjusted for the stripped block; safe while the toc sits at the top.
      const head = stripped.slice(0, insertAfter);
      const body = stripped.slice(insertAfter);
      const next = `${head}${tocBlock}\n\n${body}`;
      await localVault.saveDoc(selectedSlug, next, {
        expectedMtime: file.lastModified,
      });
    } catch (err) {
      toast.show(
        err instanceof VaultConflictError
          ? t('dialog.vaultConflict')
          : failureSentence(err, t('dialog.tocFailed')).sentence,
        'error',
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, t, toast, failureSentence]);

  const handleExportDocHtml = useCallback(() => {
    if (!selectedSlug || typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const article = document.querySelector('[data-docs-viewer]');
    if (!article) {
      toast.show(t('dialog.notRendered'), 'info');
      return;
    }
    const html = buildDocsVaultPopoutHtml(doc.title, article.outerHTML);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = doc.slug.replace(/\//g, '-');
    a.href = url;
    a.download = `${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [selectedSlug, manifest, t, toast]);
  return { handleInsertToc, handleExportDocHtml };
}
