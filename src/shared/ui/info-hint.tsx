import { useId } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface InfoHintProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
}

export function InfoHint({
  label,
  children,
  className,
  panelClassName,
}: InfoHintProps) {
  // aria-describedby 로 button ↔ tooltip 연결 — focus / hover 시 AT 가
  // tooltip 본문을 같이 읽는다. 이전엔 role=tooltip div 만 있고 button 과
  // 연결돼 있지 않아 스크린리더가 본문에 도달하지 못함.
  const tooltipId = useId();
  return (
    <div className={cn("group relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a28)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
      >
        <CircleHelp size={14} aria-hidden="true" />
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className={cn(
          // 기본(--motion-fast)이 아니라 --motion-base 를 명시한다: 이 전이는
          // 색 확인이 아니라 **표면의 등장/퇴장**(opacity + 상승)이라 램프의
          // "이동" 스텝이 맞다. 기본값에 맡기면 120ms 로 팝에 가까워진다.
          "pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 py-3 text-left opacity-0 shadow-[0_20px_40px_var(--color-shadow-a25)] transition-all duration-[var(--motion-base)] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100",
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
