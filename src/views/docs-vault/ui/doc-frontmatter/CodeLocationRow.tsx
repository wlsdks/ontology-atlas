import { Check, Clipboard } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { truncateMiddlePath } from "@/shared/lib/concept-display/truncate-middle-path";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { IconButton } from "@/shared/ui";

export function CodeLocationRow({
  path,
  copyLabel,
  copiedLabel,
  copyAriaLabel,
}: {
  path: string;
  copyLabel: string;
  copiedLabel: string;
  copyAriaLabel: string;
}) {
  const { state, copy } = useCopyFeedback();
  return (
    <li className="flex items-center gap-2 py-0.5">
      <span
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]"
      >
        {truncateMiddlePath(path)}
      </span>
      <IconButton
        label={copyAriaLabel}
        size="sm"
        tone="muted"
        onClick={() => void copy(path)}
        title={state === "copied" ? copiedLabel : copyLabel}
        data-testid="doc-frontmatter-code-location-copy"
        className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
      >
        {state === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      </IconButton>
    </li>
  );
}
