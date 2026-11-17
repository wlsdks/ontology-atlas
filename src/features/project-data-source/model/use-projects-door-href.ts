"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { getProjectRuntimeDetailHref } from "@/entities/project";
import { useVaultSessionIdentityScope } from "@/entities/vault-session";

import { readSelectedProject, recordSelectedProject, resolveSelectedProjectSlug, subscribeSelectedProject } from "./selected-project";
import { useVaultDocs } from "./use-vault-docs";

const NO_SELECTION = () => null;

/** The selected project's slug, or null when the folder has several projects and none was opened yet. */
export function useSelectedProjectSlug(): string | null {
  const scope = useVaultSessionIdentityScope();
  const docs = useVaultDocs();
  const read = useCallback(() => readSelectedProject(scope), [scope]);
  const recorded = useSyncExternalStore(subscribeSelectedProject, read, NO_SELECTION);
  return useMemo(() => resolveSelectedProjectSlug(recorded, docs), [recorded, docs]);
}

/** Where the Projects door leads: the selected project's page, or null for the list. Every door reads this hook. */
export function useProjectsDoorHref(): string | null {
  const slug = useSelectedProjectSlug();
  return slug ? getProjectRuntimeDetailHref(slug) : null;
}

/** A project page that shows an existing project makes it the selected one. */
export function useRecordSelectedProject(slug: string | null): void {
  const scope = useVaultSessionIdentityScope();
  useEffect(() => {
    if (slug) recordSelectedProject(scope, slug);
  }, [scope, slug]);
}
