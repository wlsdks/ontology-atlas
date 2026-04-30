import { Suspense } from "react";
import type { Metadata } from "next";
import { KnowledgeDocumentsPage } from "@/views/knowledge-documents";

export const metadata: Metadata = {
  title: '문서',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <KnowledgeDocumentsPage />
    </Suspense>
  );
}
