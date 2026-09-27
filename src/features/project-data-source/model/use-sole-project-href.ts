"use client";

import { useMemo } from "react";

import { resolveSoleProjectSlug } from "@/entities/docs-vault";
import { getProjectRuntimeDetailHref } from "@/entities/project";

import { useVaultDocs } from "./use-vault-docs";

/** The folder's only project, or null for none or several; every navigation surface reads this one hook. */
export function useSoleProjectHref(): string | null {
  const docs = useVaultDocs();
  return useMemo(() => {
    const slug = resolveSoleProjectSlug(docs);
    return slug ? getProjectRuntimeDetailHref(slug) : null;
  }, [docs]);
}
