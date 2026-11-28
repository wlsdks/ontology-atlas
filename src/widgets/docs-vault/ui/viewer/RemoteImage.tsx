import { useTranslations } from 'use-intl';
import { controlClass } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';

export function RemoteImage({ src, alt }: { src: string; alt: string }) {
  const t = useTranslations('vaultWidgets.viewer');
  let host = src;
  try {
    host = new URL(src).host;
  } catch {
    host = src;
  }
  return (
    <span
      data-testid="docs-viewer-remote-image"
      className={badgeClass({
        shape: 'micro',
        className:
          'my-3 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 border border-dashed border-[color:var(--color-border-strong)] text-[color:var(--color-text-tertiary)]',
      })}
    >
      {alt ? <span className="text-[color:var(--color-text-secondary)]">{alt}</span> : null}
      <span>{t('remoteImage', { host })}</span>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className={controlClass({ shape: 'link', tone: 'accent', className: 'text-caption' })}
      >
        <span aria-hidden data-external-link-marker>
          ↗
        </span>
        {t('remoteImageOpen', { host })}
      </a>
    </span>
  );
}
