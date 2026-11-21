import type { useTranslations } from "next-intl";

import { formatSourceBytes, type LibrarySourceRow } from "@/entities/docs-vault";
import type { CitedPassageState } from "../../lib/sources/use-cited-passage";
import type { SourceOutlineState } from "../../lib/sources/use-source-outline";
import { elideHashMiddle } from "../../lib/sources/elide-hash";

/**
 * One row of the pane's fact list. `oneLine` marks a value whose row must never grow a second line:
 * the list is the one fixed-height block in the pane, and a row that wraps when a file has been cited
 * would make the pane's rhythm depend on its state. `title` keeps the untruncated value reachable.
 */
export interface SourceFact {
  key: string;
  label: string;
  value: string;
  mono?: boolean;
  oneLine?: boolean;
  title?: string;
  /** Hidden at `lg` and up, where the Sources list beside the pane already wears the same fact. */
  wideHidden?: boolean;
}

/**
 * A source's format is its extension (`vaultSourceFormat`), so a name that ends in it already says
 * it in the headline. Only a file with no extension leaves the format a fact the headline does not
 * state.
 */
function nameCarriesFormat(row: LibrarySourceRow): boolean {
  return row.format !== "" && row.name.toLowerCase().endsWith(`.${row.format.toLowerCase()}`);
}

/**
 * The facts a source pane prints, each once: the format is omitted when the name carries the
 * extension, and the state hides at `lg` while the index shows it. The hash is never a guess: an
 * unmeasured one says so, and one a citation's read measured says it was just read, since a hash whose
 * provenance a reader cannot tell apart from the one a write-up recorded is a fact about nothing.
 */
export function sourceFacts({ row, hash, passageHash, indexShowsState }: {
  row: LibrarySourceRow;
  /** The measured sha256, or null when nothing has asked for one yet. */
  hash: string | null;
  /** The hash of exactly the bytes a citation's read showed its passage from. */
  passageHash: string | null | undefined;
  indexShowsState: boolean;
}, t: ReturnType<typeof useTranslations<"library">>): SourceFact[] {
  return [
    { key: "path", label: t("source.path"), value: row.path, mono: true },
    ...(nameCarriesFormat(row)
      ? []
      : [{ key: "format", label: t("source.format"), value: row.format ? row.format.toUpperCase() : t("sources.noFormat") }]),
    { key: "size", label: t("source.size"), value: formatSourceBytes(row.bytes) },
    { key: "state", label: t("source.state"), value: t(`sources.state.${row.state}.label`), wideHidden: indexShowsState },
    {
      key: "hash",
      label: t("source.hash"),
      value:
        hash !== null
          ? elideHashMiddle(hash)
          : passageHash
            ? t("source.hashJustRead", { hash: elideHashMiddle(passageHash) })
            : t("source.hashUnmeasured"),
      title: hash ?? passageHash ?? undefined,
      mono: hash !== null,
      oneLine: hash !== null || passageHash !== undefined,
    },
  ];
}

/**
 * Which sentence about reading is true of the pane right now. The citation wording wins when both
 * reads happened, because it is the more specific reason and the one the person acted on; the outline
 * read is the ambient one that fires on every source pane.
 */
export function openedSentenceKey(
  passage: CitedPassageState | null,
  outline: SourceOutlineState | null,
): "source.openedForCitation" | "source.openedForOutline" | "source.neverOpened" {
  if (passage !== null) return "source.openedForCitation";
  return outline && outline.phase !== "reading" ? "source.openedForOutline" : "source.neverOpened";
}

/** One citation's identity: a new one is a new node, so pressing the same address again lands again. */
export function citationKey(passage: Pick<CitedPassageState, "path" | "anchor">): string {
  return `${passage.path}#${passage.anchor}`;
}
