'use client';

import { useCallback, useMemo } from 'react';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { shouldShowOutlineRail } from '@/widgets/doc-reading-pane';
import type { VaultManifest, StaticVaultHeadings } from '@/entities/docs-vault';

export function useDocOutline({
  selectedDoc,
  staticHeadings,
  setActiveHeadingSlug,
}: {
  selectedDoc: VaultManifest['docs'][number] | null;
  staticHeadings: StaticVaultHeadings | null;
  setActiveHeadingSlug: (slug: string | null) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const outlineHeadings = useMemo(() => {
    // Bundled headings come from the lazily loaded map; a local manifest has them inline.
    const docHeadings =
      selectedDoc && selectedDoc.headings.length > 0
        ? selectedDoc.headings
        : selectedDoc
          ? (staticHeadings?.[selectedDoc.slug] ?? [])
          : [];
    const headings = docHeadings.filter((h) => h.depth >= 2 && h.depth <= 3);
    const totals = new Map<string, number>();
    for (const heading of headings) {
      totals.set(heading.text, (totals.get(heading.text) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    return headings.map((heading) => {
      const occurrence = (seen.get(heading.text) ?? 0) + 1;
      seen.set(heading.text, occurrence);
      return {
        ...heading,
        duplicate: (totals.get(heading.text) ?? 0) > 1,
        occurrence,
      };
    });
  }, [selectedDoc, staticHeadings]);
  const showOutlineRail = shouldShowOutlineRail(outlineHeadings.length);
  const handleHeadingNavigate = useCallback(
    (slug: string) => {
      document
        .getElementById(slug)
        ?.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      setActiveHeadingSlug(slug);
      if (typeof window !== 'undefined') {
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${window.location.search}#${slug}`,
        );
      }
    },
    [reducedMotion, setActiveHeadingSlug],
  );
  return { outlineHeadings, showOutlineRail, handleHeadingNavigate };
}
