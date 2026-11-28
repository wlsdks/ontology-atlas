import { RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/shared/ui/controls/button';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { BrandPortrait } from '@/shared/ui/marks/moru/brand-portrait';
import { TerminalState } from './TerminalState';

/**
 * Shown when the root layout itself threw, so no locale provider ran and the text is English.
 * It shares the route error's shape: the same stage one level up should not look like another app.
 */
export function BootFailureScreen({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  return (
    <TerminalState
      testId="boot-failure-stage"
      tone="warning"
      // Held: its moving form reads the runtime, and a second throw here leaves the browser's own error page.
      figure={<BrandPortrait expression="curious" held />}
      eyebrow="Startup error"
      title="Atlas stopped while starting"
      body={
        digest
          ? 'It may be a passing problem. Try again or go home. If it keeps happening, report it with the error ID below.'
          : 'It may be a passing problem. Try again or go home.'
      }
      detail={
        digest ? (
          <p className="font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
            Error ID: <span className="tabular-nums">{digest}</span>
          </p>
        ) : null
      }
      actions={
        <>
          <Button type="button" variant="primary" onClick={onRetry}>
            <RefreshCw size={ICON_SIZE.md} aria-hidden />
            Try again
          </Button>
          {/* A full navigation: the client router belongs to the layout that threw. */}
          <a href={withBasePath('/')} className={cn(buttonVariants({ variant: 'outline' }))}>
            Home
          </a>
        </>
      }
    />
  );
}
