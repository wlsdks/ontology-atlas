"use client";

import { useSearchParams } from "next/navigation";
import { ProjectEditorPage } from "@/views/project-editor";
import { normalizeAccountId } from "@/shared/lib/account-scope";

export function ProjectNewClientPage() {
  const searchParams = useSearchParams();
  const duplicateFromSlug = searchParams.get("from") ?? undefined;
  const initialCategoryId = searchParams.get("category") ?? undefined;
  const initialStatusId = searchParams.get("status") ?? undefined;
  const returnTo = searchParams.get("returnTo") ?? undefined;
  const accountId = normalizeAccountId(searchParams.get("account"));

  return (
    <ProjectEditorPage
      key={`${accountId ?? "__default__"}:${duplicateFromSlug ?? "__new__"}:${initialCategoryId ?? ""}:${initialStatusId ?? ""}:${returnTo ?? ""}`}
      mode="create"
      duplicateFromSlug={duplicateFromSlug}
      initialCategoryId={initialCategoryId}
      initialStatusId={initialStatusId}
      returnTo={returnTo}
      accountId={accountId}
    />
  );
}
