import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { vaultPathFromDoc } from '../../lib/viewer/vault-image-path';
import { BodyImage } from './BodyImage';

export function VaultImage({
  src,
  alt,
  docSlug,
  resolve,
}: {
  src: string;
  alt: string;
  docSlug: string;
  resolve: (path: string) => Promise<string | null>;
}) {
  const t = useTranslations('vaultWidgets.viewer');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    resolve(vaultPathFromDoc(docSlug, src))
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          setError(true);
          return;
        }
        created = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src, docSlug, resolve]);
  if (error) {
    return (
      <span
        className="my-3 inline-block rounded-micro border border-dashed border-[color:var(--color-amber-source-a50)] px-2 py-1 font-mono text-caption text-[color:var(--color-amber-source-text-a80)]"
        title={t('imageMissing', { src })}
      >
        🖼 {alt || src}
      </span>
    );
  }
  if (!blobUrl) {
    return (
      <span
        className="my-3 inline-block h-5 w-24 animate-pulse rounded-micro bg-[color:var(--color-overlay-2)]"
        aria-label={alt}
      />
    );
  }
  return <BodyImage src={blobUrl} alt={alt} />;
}
