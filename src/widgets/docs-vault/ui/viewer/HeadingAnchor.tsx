import { Hash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { IconButton } from '@/shared/ui';
import { useCopyFeedback } from '@/shared/lib/clipboard/use-copy-feedback';

export function HeadingAnchor({
  anchor,
  docSlug,
  basePath,
}: {
  anchor: string;
  docSlug: string;
  basePath: string;
}) {
  const t = useTranslations('vaultWidgets.viewer');
  const { state, copy } = useCopyFeedback(2000);
  const copied = state === "copied";
  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.pathname = basePath.endsWith('/') ? basePath : `${basePath}/`;
    url.searchParams.set('slug', docSlug);
    url.hash = anchor;
    await copy(url.toString());
  };
  return (
    <IconButton
      label={copied ? t('anchorCopiedAria') : t('anchorCopyAria')}
      size="lg"
      tone="muted"
      active={copied}
      onClick={onClick}
      title={copied ? t('anchorCopiedTitle') : t('anchorCopyTitle')}
      className={`absolute right-0 top-1/2 -translate-y-1/2 transition-[background-color,color,opacity] sm:-left-9 sm:right-auto ${
        copied
          ? 'opacity-100'
          : 'opacity-100 hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-indigo-line-a90)] [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      }`}
      contentEditable={false}
    >
      <Hash size={ICON_SIZE.sm} aria-hidden />
    </IconButton>
  );
}
