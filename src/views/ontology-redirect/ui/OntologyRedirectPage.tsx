"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import {
  ONTOLOGY_DEEPLINK_ASK_KEY,
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  parseInsightsReturnMarker,
  translateOntologyDeeplinkToTopologyParam,
} from "@/entities/knowledge-graph";

/**
 * Keeps every `/ontology/?node=X` link (`buildOntologyNodeHref`) resolving by translating it to
 * the /topology form, client-side since a static export has no server redirect. An unknown node is
 * diagnosed only by HomePage, the one "not found" surface.
 */
export function OntologyRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get("node");
  const askParam = searchParams.get(ONTOLOGY_DEEPLINK_ASK_KEY);
  const viaParam = searchParams.get(ONTOLOGY_DEEPLINK_VIA_KEY);
  const reviewParam = searchParams.get(ONTOLOGY_DEEPLINK_REVIEW_KEY);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("index", "expanded");
    if (nodeParam) {
      params.set("p", translateOntologyDeeplinkToTopologyParam(nodeParam));
    }
    // Forwarded only when valid: HomePage renders its return chip from it.
    if (viaParam && parseInsightsReturnMarker(viaParam)) {
      params.set(ONTOLOGY_DEEPLINK_VIA_KEY, viaParam);
      if (reviewParam) {
        params.set(ONTOLOGY_DEEPLINK_REVIEW_KEY, reviewParam);
      }
    }
    // Only the request kind, never a message sent on the person's behalf; HomePage validates it.
    if (askParam) {
      params.set(ONTOLOGY_DEEPLINK_ASK_KEY, askParam);
    }
    router.replace(`/topology/?${params.toString()}`);
  }, [router, nodeParam, askParam, viaParam, reviewParam]);

  return null;
}
