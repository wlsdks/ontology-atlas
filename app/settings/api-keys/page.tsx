import { Suspense } from "react";
import type { Metadata } from "next";
import { ApiKeysPage } from "@/views/settings-api-keys";

export const metadata: Metadata = {
  title: 'API 키',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ApiKeysPage />
    </Suspense>
  );
}
