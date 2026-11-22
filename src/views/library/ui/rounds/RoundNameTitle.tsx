"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { isImeComposing } from "@/shared/lib/keyboard/ime-composition";
import { controlClass } from "@/shared/ui/control-class";
import { Input } from "@/shared/ui/fields/input";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

/**
 * The sheet's heading: what the sheet is for, and the round's name as its title. Click it and it is a field, the way the project page's own
 * name works; there is no second "Name" box at the foot of the form.
 */
export function RoundNameTitle({ name, titleId, saving, editing, onNameChange }: {
  name: string;
  /** An existing round is being edited, not a new one made. */
  editing: boolean;
  titleId: string;
  saving: boolean;
  onNameChange: (name: string) => void;
}) {
  const t = useTranslations("library.rounds");
  const [renaming, setRenaming] = useState(false);
  const renameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  return (
    <header className="shrink-0">
      <p className="mb-2 text-body text-[color:var(--color-text-tertiary)]">{editing ? t("sheet.editTitle") : t("sheet.title")}</p>
      {renaming ? (
        <div className="min-w-0">
          <h2 id={titleId} className="sr-only">
            {name}
          </h2>
          <Input
            ref={renameRef}
            size="lg"
            value={name}
            aria-label={t("sheet.nameAria")}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onNameChange(event.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && isImeComposing(event)) return;
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            data-testid="library-rounds-name"
            className="w-full"
          />
        </div>
      ) : (
        <h2 id={titleId} className="min-w-0">
          <button
            type="button"
            disabled={saving}
            onClick={() => setRenaming(true)}
            data-testid="library-rounds-rename"
            title={t("sheet.rename")}
            className={controlClass({
              shape: "row",
              size: "md",
              hoverSurface: "lift",
              className: "-mx-2 w-full justify-start px-2 text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]",
            })}
          >
            <span className="min-w-0 truncate">{name}</span>
            <Pencil size={ICON_SIZE.sm} aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]" />
          </button>
        </h2>
      )}
    </header>
  );
}
