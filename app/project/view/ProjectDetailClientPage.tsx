"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeAccountId } from "@/shared/lib/account-scope";

/**
 * 레거시 URL 호환 라우트. `/project/view/?slug=X&account=Y` 링크로 진입하면
 * canonical `/project/X/?account=Y` 로 즉시 `replace` 해 URL 계약을 하나로
 * 모은다 (지침서 T-01). slug 없으면 `/projects/` 로 보낸다 (이전엔
 * ProjectDetailPage 의 invalid 상태가 잠시 노출되는 깜빡임이 있었음).
 */
export function ProjectDetailClientPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = searchParams.get("slug")?.trim() ?? "";
  const accountId = normalizeAccountId(searchParams.get("account"));

  useEffect(() => {
    const qs = accountId ? `?account=${encodeURIComponent(accountId)}` : "";
    if (slug) {
      router.replace(`/project/${encodeURIComponent(slug)}/${qs}`);
    } else {
      router.replace(`/projects/${qs}`);
    }
  }, [accountId, router, slug]);

  return null;
}
