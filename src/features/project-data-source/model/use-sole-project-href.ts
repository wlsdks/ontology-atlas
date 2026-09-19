"use client";

import { useMemo } from "react";

import { resolveSoleProjectSlug } from "@/entities/docs-vault";
import { getProjectRuntimeDetailHref } from "@/entities/project";

import { useVaultDocs } from "./use-vault-docs";

/**
 * Where the Projects door leads: the folder's only project when it holds exactly one, and
 * null when it holds none or several (then the door keeps the list).
 *
 * `<project>/atlas` is the standard folder shape, so most folders hold one project and the
 * list the door used to open had one row and nothing to choose (2026-09-19, decision "With
 * one project, the rail's Projects door opens that project"). The desktop rail, its keyboard
 * shortcut and the mobile tab bar all read this one hook, because a rail and a tab bar that
 * disagree about where the same destination leads are two navigations, not one.
 */
export function useSoleProjectHref(): string | null {
  const docs = useVaultDocs();
  return useMemo(() => {
    const slug = resolveSoleProjectSlug(docs);
    return slug ? getProjectRuntimeDetailHref(slug) : null;
  }, [docs]);
}
