import { CircleHelp } from "lucide-react";
import { Tooltip } from "@/shared/ui";

export function InsightsInfoButton({
  label,
  content,
  className = "",
}: {
  label: string;
  content: string;
  className?: string;
}) {
  return (
    <Tooltip content={content} side="bottom" withProvider={false}>
      <button
        type="button"
        aria-label={label}
        className={[
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          "border border-[color:rgba(139,151,255,0.26)] bg-[color:rgba(94,106,210,0.08)]",
          "text-[color:var(--color-text-tertiary)]",
          "transition-[background-color,border-color,color,transform] duration-180 ease-out",
          "hover:border-[color:rgba(139,151,255,0.48)] hover:bg-[color:rgba(94,106,210,0.14)] hover:text-[color:var(--color-text-primary)]",
          "active:translate-y-[1px]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
          "motion-reduce:transition-none motion-reduce:transform-none",
          className,
        ].join(" ")}
      >
        <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
