import { Suspense } from "react";
import type { Metadata } from "next";
import { KnowledgeReviewWorkspacePage } from "@/views/knowledge-review-workspace";

export const metadata: Metadata = {
  title: '문서 확인',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <KnowledgeReviewWorkspacePage />
    </Suspense>
  );
}
