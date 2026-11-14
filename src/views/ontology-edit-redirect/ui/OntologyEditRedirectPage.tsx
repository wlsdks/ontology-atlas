"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import {
  buildTopologyMeaningCreateHref,
  buildTopologyMeaningEditorNodeHref,
} from "@/entities/knowledge-graph";

export function OntologyEditRedirectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(buildTopologyWorkbenchRedirect(searchParams));
  }, [router, searchParams]);

  return null;
}

function buildTopologyWorkbenchRedirect(searchParams: URLSearchParams): string {
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
  const edit = searchParams.get("edit");
  if (edit) query.set("edit", edit);
  return `/topology/?${query.toString()}`;
}
