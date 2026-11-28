import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/keyboard/use-roving-radio-group";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import { controlClass } from "@/shared/ui";
import type { CommitConcept } from "../../lib/commit-documents";
import type { CopyTranslate } from "../../lib/translator";

/**
 * Concept chips are an exclusive single selection starting at `concepts[0]`, exposed as a
 * radio group. The container keeps its own `tone:'secondary'` plus conditional border,
 * which never paints over a pressed chip's indigo.
 */
export function ConceptChips({
  t,
  concepts,
  focused,
  onPick,
}: {
  t: CopyTranslate;
  concepts: readonly CommitConcept[];
  /** The pressed chip; `null` while nothing is pressed, and the group then makes its first chip the tab stop (APG). */
  focused: string | null;
  onPick: (id: string) => void;
}) {
  const conceptGroup = useRovingRadioGroup<string | null>({
    value: focused,
    values: concepts.map((concept) => concept.id),
    onChange: (id) => {
      if (id) onPick(id);
    },
  });

  return (
    <div className="flex flex-none flex-col gap-2.5 px-4 pt-4">
      <div {...conceptGroup.groupProps} aria-label={t("conceptChipsAria")} className="flex flex-wrap gap-1.5">
        {concepts.map((concept, index) => (
          <button
            key={concept.id}
            {...conceptGroup.itemProps(index)}
            type="button"
            data-testid="atlas-git-concept-chip"
            data-document-anchor={focused === concept.id ? true : undefined}
            className={controlClass({
              shape: "chip",
              size: "md",
              tone: "secondary",
              active: focused === concept.id,
              // The pressed chip's indigo border comes from the ramp; overriding it unconditionally here
              // would remove that signal.
              className: cn(
                focused !== concept.id &&
                  "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
              ),
            })}
          >
            <OntologyMapKindGlyph kind={concept.kind} size={12} />
            {concept.label}
          </button>
        ))}
      </div>
    </div>
  );
}
