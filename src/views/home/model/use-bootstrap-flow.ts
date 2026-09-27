"use client";

import { useCallback, useMemo, useState } from "react";
import {
  deriveBootstrapPlan,
  executeBootstrapPlan,
  type BootstrapPlan,
  type BootstrapVaultWriter,
  type ExecuteBootstrapResult,
} from "@/features/docs-vault-local";

/**
 * The "start an ontology from my documents" flow: plan derivation, dialog state and execution
 * through the features-level batch write. The caller handles completion through `onCompleted`; this
 * hook knows no map or toast.
 */
export interface UseBootstrapFlowArgs {
  vault: BootstrapVaultWriter & { handle?: { name: string } | null };
  onCompleted: (result: ExecuteBootstrapResult) => void;
}

export interface BootstrapFlow {
  bootstrapOpen: boolean;
  setBootstrapOpen: (open: boolean) => void;
  bootstrapPlan: BootstrapPlan | null;
  runBootstrap: (input: { projectTitle: string; acceptedDomains: ReadonlySet<string> }) => Promise<void>;
}

export function useBootstrapFlow({ vault, onCompleted }: UseBootstrapFlowArgs): BootstrapFlow {
  const [bootstrapOpen, setBootstrapOpen] = useState(false);

  const bootstrapPlan = useMemo(() => {
    if (!vault.manifest) return null;
    return deriveBootstrapPlan(
      vault.manifest.docs.map((d) => ({
        slug: d.slug,
        title: (d as { title?: string }).title ?? d.slug,
        frontmatter: d.frontmatter,
      })),
      vault.handle?.name ?? "my-project",
    );
  }, [vault.manifest, vault.handle]);

  const runBootstrap = useCallback(
    async (input: { projectTitle: string; acceptedDomains: ReadonlySet<string> }) => {
      if (!bootstrapPlan) return;
      const result = await executeBootstrapPlan(vault, bootstrapPlan, input);
      if (!result) return;
      setBootstrapOpen(false);
      onCompleted(result);
    },
    [bootstrapPlan, vault, onCompleted],
  );

  return { bootstrapOpen, setBootstrapOpen, bootstrapPlan, runBootstrap };
}
