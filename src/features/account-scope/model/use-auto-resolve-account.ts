"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listAccountMembershipsByUid } from "@/entities/account";
import { useUserAuth } from "@/features/user-auth";
import {
  ACCOUNT_QUERY_KEY,
  normalizeAccountId,
  rememberAccountId,
} from "@/shared/lib/account-scope";

/**
 * URL 에 ?account= 가 없을 때 인증된 사용자의 owned membership 첫 번째 accountId
 * 를 자동 resolve. `currentPath` 가 주어지면 router.replace 로 URL 도 보강.
 *
 * `/ontology`, `/ontology/insights`, `/ontology/relations` 처럼 운영 사용자가
 * 직접 URL 입력해도 자기 워크스페이스 데이터를 볼 수 있게 한다.
 */
export function useAutoResolveAccountId(currentPath?: string | null) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUserAuth();
  const accountId = normalizeAccountId(searchParams.get(ACCOUNT_QUERY_KEY));

  useEffect(() => {
    if (accountId) return;
    if (!user?.uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const memberships = await listAccountMembershipsByUid(user.uid);
        if (cancelled) return;
        const target =
          memberships.find((entry) => entry.role === "owner") ?? memberships[0];
        if (!target) return;
        rememberAccountId(target.accountId);
        if (currentPath) {
          const params = new URLSearchParams(searchParams.toString());
          params.set(ACCOUNT_QUERY_KEY, target.accountId);
          router.replace(`${currentPath}?${params.toString()}`, { scroll: false });
        }
      } catch (err) {
        console.warn("[useAutoResolveAccountId] failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, user?.uid, currentPath, searchParams, router]);
}
