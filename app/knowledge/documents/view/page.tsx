import { Suspense } from "react";
import type { Metadata } from "next";
import { KnowledgeDocumentClientPage } from "./KnowledgeDocumentClientPage";

export const metadata: Metadata = {
  title: '문서 보기',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <KnowledgeDocumentClientPage />
    </Suspense>
  );
}
