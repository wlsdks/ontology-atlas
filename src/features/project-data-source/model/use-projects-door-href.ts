"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { buildProjectRuntimeDetailHref } from "@/entities/project";
import { useVaultSessionIdentityScope } from "@/entities/vault-session";

import { readSelectedProject, recordSelectedProject, resolveSelectedProjectSlug, subscribeSelectedProject } from "./selected-project";
import { useVaultDocs } from "./use-vault-docs";

const NO_SELECTION = () => null;

export function useSelectedProjectSlug(options?: { demand?: boolean }): string | null {
  const scope = useVaultSessionIdentityScope();
  const docs = useVaultDocs(options);
  const read = useCallback(() => readSelectedProject(scope), [scope]);
  const recorded = useSyncExternalStore(subscribeSelectedProject, read, NO_SELECTION);
  return useMemo(() => resolveSelectedProjectSlug(recorded, docs), [recorded, docs]);
}

/**
 * Where the Projects door leads: the selected project's page, or null for the list. Every door reads
 * this hook. A door is on every screen, so it never starts the sample's download itself: a screen
 * that draws the sample does, and the door follows once it has arrived.
 */
export function useProjectsDoorHref(): string | null {
  const slug = useSelectedProjectSlug({ demand: false });
  return slug ? buildProjectRuntimeDetailHref(slug) : null;
}

export function useRecordSelectedProject(slug: string | null): void {
  const scope = useVaultSessionIdentityScope();
  useEffect(() => {
    if (slug) recordSelectedProject(scope, slug);
  }, [scope, slug]);
}
