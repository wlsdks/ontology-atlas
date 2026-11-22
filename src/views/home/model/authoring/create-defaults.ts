import { canonicalizeDomainRef } from "@/shared/lib/vault-document/canonicalize-domain-ref";

import type { CreateNodeKind } from "../../ui/create/CreateNodeForm";

export interface CreateSelection {
  kind: string;
  ref: string;
  domainRef: string | null;
}

export const KINDS_WITH_PARENT: ReadonlySet<CreateNodeKind> = new Set(["capability", "element"]);

export function createDefaultsFromSelection(selected: CreateSelection | null): {
  kind: CreateNodeKind;
  parent: string;
} {
  switch (selected?.kind) {
    case "project":
      return { kind: "domain", parent: "" };
    case "domain":
      return { kind: "capability", parent: selected.ref };
    case "capability":
    case "element":
      return { kind: "element", parent: canonicalizeDomainRef(selected.domainRef) };
    default:
      return { kind: "capability", parent: "" };
  }
}
