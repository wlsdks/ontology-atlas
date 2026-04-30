import { Suspense } from "react";
import type { Metadata } from "next";
import { KnowledgeDocumentNewPage } from "@/views/knowledge-document-new";

export const metadata: Metadata = {
  title: '문서 올리기',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <KnowledgeDocumentNewPage />
    </Suspense>
  );
}
