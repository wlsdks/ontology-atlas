"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import {
  buildTopologyMeaningCreateHref,
  buildTopologyMeaningEditorNodeHref,
} from "@/entities/knowledge-graph";

/**
 * `/ontology/edit` and `/ontology/studio` are compatibility entries. The map
 * now owns node creation and relation editing, so this component translates
 * legacy query strings into the canonical contextual-workbench URL.
 *
 * A `?node=<id>` deep-link becomes `?p=<id>&workbench=edit`, preserving the
 * canonical (`capability:foo`) and legacy plural-slash (`capabilities/foo`)
 * forms through the shared node-href normalizer.
 */
export function OntologyEditRedirectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(buildTopologyWorkbenchRedirect(searchParams));
  }, [router, searchParams]);

  return null;
}

export function buildTopologyWorkbenchRedirect(searchParams: URLSearchParams): string {
  if (
    searchParams.get("mode") === "create" ||
    searchParams.get("workbench") === "create"
  ) {
    return buildTopologyMeaningCreateHref();
  }
  const node = searchParams.get("node") ?? searchParams.get("p");
  if (!node) return "/topology/";

  const base = buildTopologyMeaningEditorNodeHref(node);
  const query = new URLSearchParams(base.slice(base.indexOf("?") + 1));
  for (const key of ["edit", "via", "review"] as const) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  return `/topology/?${query.toString()}`;
}
