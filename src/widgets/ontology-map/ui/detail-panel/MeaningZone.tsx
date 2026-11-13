import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** `[[target|label]]` reads as its label and `[[target]]` as the target's last segment. */
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function readableDefinition(definition: string): string {
  return definition.replace(WIKILINK, (_, target: string, label?: string) => (label ?? target.split("/").pop() ?? target).trim());
}

const DEFINITION_TEXT =
  "text-body leading-body break-words [overflow-wrap:anywhere] text-[color:var(--map-panel-text-secondary)]";

/**
 * The definition sentence as written, with no label: three lines, and a press opens the rest in
 * place. Only a sentence that is actually cut is pressable. A concept without one says so, quietly.
 */
export function MeaningZone({ definition }: { definition: string | null }) {
  const t = useTranslations("docsVault.frontmatterBlock.validatorIssues");
  const textRef = useRef<HTMLSpanElement | null>(null);
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
  const text = (
    <span ref={textRef} className={`block ${DEFINITION_TEXT} ${open ? "" : "line-clamp-3"}`}>
      {readableDefinition(definition)}
    </span>
  );
  const state = open ? "open" : cut ? "cut" : "whole";
  return (
    <div className="px-[var(--map-panel-pad)] pb-3">
      {pressable ? (
        <button
          type="button"
          data-testid="map-detail-panel-definition"
          data-definition={state}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="-mx-1.5 block w-[calc(100%+0.75rem)] rounded-chip px-1.5 py-0.5 text-left hover:bg-[color:var(--map-panel-row-hover)] focus-visible:bg-[color:var(--map-panel-row-hover)]"
        >
          {text}
        </button>
      ) : (
        <div data-testid="map-detail-panel-definition" data-definition={state} className="py-0.5">
          {text}
        </div>
      )}
    </div>
  );
}
