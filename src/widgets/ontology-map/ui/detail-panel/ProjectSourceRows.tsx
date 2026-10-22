import { AlertCircle, CheckCircle2, CircleDashed, CircleHelp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { controlClass } from "@/shared/ui";
import type { ProjectSourceStatus } from "@/shared/lib/project-source/project-source-receipt";
import { useDelayedVisible } from "@/shared/lib/render-timing/use-presence";

/**
 * The pending status and Check record placeholder have the answer's heights, so the
 * answer changes words, not layout.
 *
 * The line says so only once the read outlives `SKELETON_DELAY_MS`: an unbound project's
 * record answers in a few milliseconds, and a "reading" line flashed for one frame would
 * announce a wait that never happened. Until then the rows keep their height and show
 * nothing. Check record has no content yet, so its placeholder only holds its height.
 */
export function ProjectSourcePendingRows({ label }: { label?: string }) {
  const announced = useDelayedVisible(true);
  return (
    <>
      <div
        data-testid="map-project-source-pending-line"
        data-pending-announced={announced}
        className={[
          "flex min-w-0 items-center gap-1.5 text-[color:var(--map-panel-text-tertiary)]",
          announced ? "ai-row-swap" : "invisible",
        ].join(" ")}
      >
        <span className="flex shrink-0 items-center justify-center">
          <CircleDashed size={ICON_SIZE.md} aria-hidden="true" />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div aria-hidden="true" className={controlClass({ shape: "link", size: "md", hoverInk: "strong", className: "invisible" })}>
        <span>&nbsp;</span>
      </div>
    </>
  );
}

export function ProjectSourceStatusIcon({ status }: { status: ProjectSourceStatus }) {
  let Icon = CircleHelp;
  let color = "var(--map-panel-text-tertiary)";
  if (status === "verified_current") {
    Icon = CheckCircle2;
    color = "var(--color-status-success)";
  } else if (status === "invalid") {
    Icon = AlertCircle;
    color = "var(--color-status-danger)";
  } else if (status === "needs_evidence" || status === "review_required") {
    color = "var(--color-status-warning)";
  }
  return (
    <span
      data-source-status-icon={status}
      className="flex shrink-0 items-center justify-center"
      style={{ color }}
    >
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}
