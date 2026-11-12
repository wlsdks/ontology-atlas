import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '../tokens/icon-size';
import { buttonVariants } from './button';

export function GetAppLink({ children, className, 'data-testid': testId }: {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <Link
      href="/download/"
      data-testid={testId}
      className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'atlas-touch-floor atlas-touch-floor-wide', className)}
    >
      <Download size={ICON_SIZE.md} aria-hidden />
      {children}
    </Link>
  );
}
