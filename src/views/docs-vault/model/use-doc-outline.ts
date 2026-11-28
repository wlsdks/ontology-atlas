import { useCallback, useMemo } from 'react';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { shouldShowOutlineRail } from '@/widgets/doc-reading-pane';
import type { VaultDocDetail } from '@/entities/docs-vault';
import { currentAddress, guardedHistoryWrite } from '@/shared/lib/navigation/history-write-guard';

type VaultHeading = VaultDocDetail['headings'][number];

const NO_HEADINGS: VaultHeading[] = [];

export function useDocOutline({
  docHeadings = NO_HEADINGS,
  setActiveHeadingSlug,
}: {
  docHeadings: VaultHeading[] | undefined;
  setActiveHeadingSlug: (slug: string | null) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const outlineHeadings = useMemo(() => {
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
  }, [docHeadings]);
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
      const written = currentAddress();
      guardedHistoryWrite('replace', `${written.pathname}${written.search}#${slug}`);
    },
    [reducedMotion, setActiveHeadingSlug],
  );
  return { outlineHeadings, showOutlineRail, handleHeadingNavigate };
}
