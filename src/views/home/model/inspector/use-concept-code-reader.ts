import { useCallback, useEffect, useState } from "react";

import { codeReaderTarget, type CodeReaderTarget, useCodeReader } from "@/widgets/code-reader";

import type { ReadConceptBody } from "./use-node-datasheet-model";

export interface CodeReaderConcept {
  slug: string;
  frontmatter: Record<string, unknown>;
  /** When the concept's document was last written. */
  mtime: number | undefined;
}

/**
 * The code reader of the selected concept. Only where Atlas can read the connected code folder
 * (`vaultPath`, the app) is the concept's document read for the file and ranges it cites; the
 * reader stays open for one concept and closes when the selection moves.
 */
export function useConceptCodeReader(input: {
  concept: CodeReaderConcept | null;
  readBody: ReadConceptBody;
  vaultPath: string | null;
}) {
  const { concept, readBody, vaultPath } = input;
  const key = concept && vaultPath && readBody ? `${concept.slug}\0${concept.mtime ?? ""}` : null;
  const [found, setFound] = useState<{ key: string; target: CodeReaderTarget | null } | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    if (key === null || !concept || !readBody) return;
    let cancelled = false;
    void readBody(concept.slug)
      .catch(() => null)
      .then((body) => {
        if (!cancelled) setFound({ key, target: codeReaderTarget(concept.frontmatter.path, body ?? "") });
      });
    return () => {
      cancelled = true;
    };
  }, [key, concept, readBody]);

  const target = found && found.key === key ? found.target : null;
  const readerOpen = target !== null && concept !== null && openSlug === concept.slug;
  const reader = useCodeReader({ vaultPath, target, open: readerOpen });
  const slug = concept?.slug ?? null;
  const toggle = useCallback(() => setOpenSlug((current) => (current !== null && current === slug ? null : slug)), [slug]);
  const close = useCallback(() => setOpenSlug(null), []);

  return {
    target,
    readerOpen,
    reader,
    toggle,
    close,
    documentModifiedMs: concept?.mtime ?? null,
  };
}
