"use client";

import { useSearchParams } from "next/navigation";
import { KnowledgeDocumentDetailPage } from "@/views/knowledge-document-detail";

export function KnowledgeDocumentClientPage() {
  const searchParams = useSearchParams();
  const documentId = searchParams.get("id") ?? undefined;
  const returnTo = searchParams.get("returnTo") ?? undefined;

  return <KnowledgeDocumentDetailPage documentId={documentId} returnTo={returnTo} />;
}
