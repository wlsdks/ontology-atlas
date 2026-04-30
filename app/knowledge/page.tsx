import { Suspense } from "react";
import type { Metadata } from "next";
import { KnowledgeDashboardPage } from "@/views/knowledge-dashboard";

export const metadata: Metadata = {
  title: '문서',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <KnowledgeDashboardPage />
    </Suspense>
  );
}
