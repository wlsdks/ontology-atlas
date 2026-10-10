import { useCallback, useMemo } from "react";
import { useLocalVault } from "@/entities/vault-session";
import type { LibraryGraphCardFacts, LibraryGraphCardRow, LibraryGraphNode } from "@/widgets/library-graph";
import { compactOntologyDescription } from "@/shared/lib/ontology-description";
import { WIKI_CITATION_PATTERN } from "@/shared/lib/wiki-page-schema";
import { sectionSlices } from "../../lib/section-slices";
import { useLibraryAgent } from "../../lib/use-library-agent";
import type { LibraryUiModel } from "@/features/library";
import type { VaultDoc } from "@/entities/docs-vault";
import type { useLibrarySources } from "./use-library-sources";
import type { useLibraryTurns } from "./use-library-turns";

export function useLibraryGraphCards({
  localVault, nativeVaultRootPath, docs, model, agent, handleCompile, sources, turns,
}: {
  localVault: ReturnType<typeof useLocalVault>;
  nativeVaultRootPath: string | null;
  docs: VaultDoc[];
  model: LibraryUiModel;
  agent: ReturnType<typeof useLibraryAgent>;
  handleCompile: () => void;
  sources: ReturnType<typeof useLibrarySources>;
  turns: ReturnType<typeof useLibraryTurns>;
}) {
  const { handleOpenSource } = sources;
  const { compileBlocked, agentOnlyReason } = turns;
  const conceptSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const doc of docs) {
      const kind = doc.frontmatter?.kind;
      if (typeof kind === "string" && kind.trim() !== "") slugs.add(doc.slug);
    }
    return slugs;
  }, [docs]);
  const docsBySlug = useMemo(() => new Map(docs.map((doc) => [doc.slug, doc])), [docs]);
  const wikiPageSlugs = useMemo(
    () => new Set(model.wikiPages.map((page) => page.slug)),
    [model.wikiPages],
  );
  const cardFacts = useCallback(
    (node: LibraryGraphNode): LibraryGraphCardFacts | null => {
      if (node.kind === "concept") return null;

      if (node.kind === "source") {
        const row = model.sources.find((source) => source.path === node.ref);
        if (!row) return null;
        const rows: LibraryGraphCardRow[] = (model.pairing.writeUpsBySource.get(row.path) ?? []).map(
          (page) => ({ id: `page:${page.slug}`, label: page.title, freshness: page.freshness }),
        );
        return {
          file: { format: row.format, bytes: row.bytes, state: row.state },
          rows,
          onReveal:
            nativeVaultRootPath !== null || localVault.sourceHandles.has(row.path)
              ? () => handleOpenSource(row)
              : null,
          revealsCopy: nativeVaultRootPath === null,
        };
      }

      const page = model.wikiPages.find((candidate) => candidate.slug === node.ref);
      if (!page) return null;
      const doc = docsBySlug.get(page.slug);
      const originals = model.pairing.originalsByWiki.get(page.slug) ?? [];
      const text = model.pageTexts.get(page.slug);
      const summarySection = text ? sectionSlices(text).sections.get("Summary") : undefined;
      const frontmatterSummary =
        typeof doc?.frontmatter?.summary === "string" ? doc.frontmatter.summary : null;
      const sentence =
        compactOntologyDescription(summarySection ?? frontmatterSummary ?? undefined) ?? null;
      const stale = originals.filter((original) => original.state === "stale").length;
      const mentions = (doc?.linksOut ?? []).filter(
        (target) => conceptSlugs.has(target) && !wikiPageSlugs.has(target),
      ).length;
      const rows: LibraryGraphCardRow[] = originals.map((original) => ({
        id: original.state === null ? null : `source:${original.path}`,
        label: original.name,
        state: original.state,
      }));
      return {
        sentence,
        counts: {
          sources: page.sourcePaths.length,
          cites: text ? [...text.matchAll(new RegExp(WIKI_CITATION_PATTERN, "g"))].length : null,
          mentions,
          stale,
        },
        rows,
        refresh:
          stale > 0
            ? {
                onRequest:
                  compileBlocked === null && (agent.route === "agent" || agent.route === "local")
                    ? handleCompile
                    : null,
                reason: compileBlocked ?? agentOnlyReason,
              }
            : undefined,
      };
    },
    [
      agent.route,
      agentOnlyReason,
      compileBlocked,
      conceptSlugs,
      docsBySlug,
      handleCompile,
      handleOpenSource,
      localVault.sourceHandles,
      model.pageTexts,
      model.pairing,
      model.sources,
      model.wikiPages,
      nativeVaultRootPath,
      wikiPageSlugs,
    ],
  );

  const agentDoor =
    nativeVaultRootPath !== null && (agent.route === "unavailable" || agent.route === "local");

  return { conceptSlugs, docsBySlug, wikiPageSlugs, cardFacts, agentDoor };
}
