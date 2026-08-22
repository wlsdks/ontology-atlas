"use client";

import { useTranslations } from "next-intl";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { Dialog, TopologyV2KindGlyph, controlClass } from "@/shared/ui";

/**
 * "New document" asks for the kind before anything else, instead of a generic `title:` template.
 * Document creation used to mass-produce kind-less notepad documents; asking first enforces "a
 * document in this vault is a node" at the moment of creation.
 *
 * Only four kinds are offered — `project` already has its own flow at `/project/new` and is not
 * duplicated here (the same convention as `vaultFolderForKind`'s folder placement in
 * build-vault-markdown.ts).
 *
 * The modal skeleton (scrim, trap, Esc, focus restore, spring) is owned by `Dialog` — this was its
 * first consumer after the 2026-08-15 design-system ratification, which removed the hand-rolled
 * trap and the map chrome tokens (`--chrome-radius`, `--chrome-shadow`) that had crossed over here.
 */
const KIND_OPTIONS = ["domain", "capability", "element", "document"] as const;
export type NewDocKind = (typeof KIND_OPTIONS)[number];

export function NewDocKindDialog({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (kind: NewDocKind) => void;
  onClose: () => void;
}) {
  const t = useTranslations("docsVault.newDocDialog");
  const kindLabel = useOntologyKindLabel();

  return (
    <Dialog open={open} onClose={onClose} labelledBy="new-doc-kind-dialog-title">
      <p
        id="new-doc-kind-dialog-title"
        className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {t("title")}
      </p>
      <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t("subtitle")}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {KIND_OPTIONS.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              onClick={() => onSelect(kind)}
              className={controlClass({ hoverBorder: 'strong',
                shape: "card",
                className: "w-full text-left",
              })}
            >
              <TopologyV2KindGlyph kind={kind} size={16} />
              <span className="text-body text-[color:var(--color-text-secondary)]">
                {kindLabel(kind)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClose}
        className={controlClass({ hoverInk: 'secondary',
          shape: "link",
          tone: "muted",
          className: "touch-hit-expand mt-3",
        })}
      >
        {t("cancel")}
      </button>
    </Dialog>
  );
}
