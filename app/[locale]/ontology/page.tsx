import { Suspense } from "react";
import type { Metadata } from "next";
import { OntologyViewPage } from "@/views/ontology-view";

export const metadata: Metadata = {
  title: "온톨로지",
};

/**
 * /ontology — ontology v0 view.
 * project → domain → capability → element 트리로 승인된 ontology 그래프
 * 를 펼쳐서 본다. 문서 노드는 근거라 트리에 매달지 않음.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyViewPage />
    </Suspense>
  );
}
