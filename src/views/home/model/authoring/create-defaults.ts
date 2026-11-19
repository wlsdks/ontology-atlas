import { canonicalizeDomainRef } from "@/shared/lib/vault-document/canonicalize-domain-ref";

import type { CreateNodeKind } from "../../ui/CreateNodeForm";

export interface CreateSelection {
  kind: string;
  /** The selected concept's own document address (`domains/billing`). */
  ref: string;
  /** Its `domain:` value, for a capability or element. */
  domainRef: string | null;
}

/** The kinds that live inside a domain through their own `domain:` key. */
export const KINDS_WITH_PARENT: ReadonlySet<CreateNodeKind> = new Set(["capability", "element"]);

/**
 * What a new concept most likely is, given what the map has selected: one level below the
 * selection, inside the selection's domain. A selected element suggests a sibling element.
 */
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
