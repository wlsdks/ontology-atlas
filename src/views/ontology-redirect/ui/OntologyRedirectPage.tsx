"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import {
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  parseInsightsReturnMarker,
  translateOntologyDeeplinkToTopologyParam,
} from "@/entities/knowledge-graph";

/**
 * `/ontology` — thin convergence entry (B3 허브가 곧 지도). The old tree/ego
 * hub (`OntologyViewPage`, `ontology-tree-view`, `ontology-ego-graph`) is
 * retired; this route now only translates its deep-link contract
 * (`?node=<id>`) into `/topology`'s (`?p=<id>&index=expanded`) and redirects
 * client-side.
 *
 * A real client redirect (not Next's `redirect()`) because `next.config.ts`
 * sets `output: 'export'` — no server-side redirect surface exists in a
 * static export. Kept as its own route (not folded away) so every existing
 * `/ontology/?node=X` link (global search, project drawer, docs viewer, the
 * insights page, agent handoff text — 7+ call sites build this href via
 * `buildOntologyNodeHref`) keeps resolving instead of 404ing.
 *
 * A `?node=` that fails to resolve against the live vault is NOT diagnosed
 * here — this component redirects unconditionally and synchronously (no
 * ontology data load to wait on). `/topology` (HomePage) is the single place
 * that already resolves `?p=` against `ontologyInsight` and shows a toast on
 * miss (see HomePage's `deeplinkMissNotifiedRef` effect) — one resolution
 * path, one "not found" surface, instead of duplicating it here.
 */
export function OntologyRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get("node");
  const viaParam = searchParams.get(ONTOLOGY_DEEPLINK_VIA_KEY);
  const reviewParam = searchParams.get(ONTOLOGY_DEEPLINK_REVIEW_KEY);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("index", "expanded");
    if (nodeParam) {
      params.set("p", translateOntologyDeeplinkToTopologyParam(nodeParam));
    }
    // 출처 마커(`via=insights:<tab>`) 는 마커 문법이 유효할 때만 전달 —
    // HomePage 가 이 값으로 "인사이트로 돌아가기" 복귀 칩을 렌더한다.
    if (viaParam && parseInsightsReturnMarker(viaParam)) {
      params.set(ONTOLOGY_DEEPLINK_VIA_KEY, viaParam);
      if (reviewParam) {
        params.set(ONTOLOGY_DEEPLINK_REVIEW_KEY, reviewParam);
      }
    }
    router.replace(`/topology/?${params.toString()}`);
  }, [router, nodeParam, viaParam, reviewParam]);

  return null;
}
