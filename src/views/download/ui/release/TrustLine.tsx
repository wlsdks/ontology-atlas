import { useTranslations } from 'use-intl';
import { cn } from '@/shared/lib/cn';

export function TrustLine({
  testId,
  className,
  windowsPrimary,
  handheld,
}: {
  testId: string;
  className?: string;
  windowsPrimary: boolean;
  handheld: boolean;
}) {
  const t = useTranslations('download');
  return (
    <p
      data-testid={testId}
      className={cn('break-keep text-body leading-body text-[color:var(--color-text-tertiary)]', className)}
    >
      {handheld ? t('trustLineHandheld') : windowsPrimary ? t('trustLineWindows') : t('trustLine')}
    </p>
  );
}
