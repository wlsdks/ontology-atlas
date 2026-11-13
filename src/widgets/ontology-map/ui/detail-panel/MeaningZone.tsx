import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const DEFINITION_TEXT =
  "text-body leading-body break-words [overflow-wrap:anywhere] text-[color:var(--map-panel-text-secondary)]";

/**
 * The definition sentence as written, with no label: three lines, and a press opens the rest in
 * place. Only a sentence that is actually cut is pressable. A concept without one says so, quietly.
 */
export function MeaningZone({ definition }: { definition: string | null }) {
  const t = useTranslations("docsVault.frontmatterBlock.validatorIssues");
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  useEffect(() => {
    const text = textRef.current;
    if (!text || open || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setCut(text.scrollHeight > text.clientHeight + 1));
    observer.observe(text);
    return () => observer.disconnect();
  }, [definition, open]);

  if (!definition) {
    return (
      <div className="px-[var(--map-panel-pad)] pb-3">
        <p
          data-testid="map-detail-panel-definition"
          data-definition="missing"
          className="text-body leading-body text-[color:var(--map-panel-text-quaternary)]"
        >
          {t("definitionMissing")}
        </p>
      </div>
    );
  }

  const pressable = open || cut;
  const toggle = () => setOpen((value) => !value);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  };
  return (
    <div className="px-[var(--map-panel-pad)] pb-3">
      <div
        data-testid="map-detail-panel-definition"
        data-definition={open ? "open" : cut ? "cut" : "whole"}
        role={pressable ? "button" : undefined}
        tabIndex={pressable ? 0 : undefined}
        aria-expanded={pressable ? open : undefined}
        onClick={pressable ? toggle : undefined}
        onKeyDown={pressable ? onKeyDown : undefined}
        className={pressable
          ? "-mx-1.5 rounded-chip px-1.5 py-0.5 hover:bg-[color:var(--map-panel-row-hover)] focus-visible:bg-[color:var(--map-panel-row-hover)]"
          : "py-0.5"}
      >
        <p ref={textRef} className={`${DEFINITION_TEXT} ${open ? "" : "line-clamp-3"}`}>
          {definition}
        </p>
      </div>
    </div>
  );
}
