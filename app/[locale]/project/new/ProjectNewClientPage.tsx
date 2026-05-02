"use client";

import { useSearchParams } from "next/navigation";
import { ProjectEditorPage } from "@/views/project-editor";

export function ProjectNewClientPage() {
  const searchParams = useSearchParams();
  const duplicateFromSlug = searchParams.get("from") ?? undefined;
  const initialCategoryId = searchParams.get("category") ?? undefined;
  const initialStatusId = searchParams.get("status") ?? undefined;
  const returnTo = searchParams.get("returnTo") ?? undefined;

  return (
    <ProjectEditorPage
      key={`${duplicateFromSlug ?? "__new__"}:${initialCategoryId ?? ""}:${initialStatusId ?? ""}:${returnTo ?? ""}`}
      mode="create"
      duplicateFromSlug={duplicateFromSlug}
      initialCategoryId={initialCategoryId}
      initialStatusId={initialStatusId}
      returnTo={returnTo}
    />
  );
}
