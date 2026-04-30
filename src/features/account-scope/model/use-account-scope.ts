"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getAccount,
  listPublicAccounts,
  listAccountMembershipsByUid,
  type Account,
} from "@/entities/account";
import {
  ACCOUNT_QUERY_KEY,
  normalizeAccountId,
  rememberAccountId,
  resolveAccountId,
} from "@/shared/lib/account-scope";
import { useScopedAccountId } from "@/shared/lib/use-scoped-account-id";
import { isDevAdminBypassActive } from "@/shared/lib/dev-admin-bypass";

export interface AccountScopeOption {
  id: string | null;
  label: string;
  description?: string;
}

const URL_CHANGE_EVENTS = ["app:urlchange", "app:admin-dashboard-filters"] as const;

export function useAccountScope() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = useScopedAccountId(searchParams.get(ACCOUNT_QUERY_KEY));

  useEffect(() => {
    rememberAccountId(accountId);
  }, [accountId]);

  const setAccountId = useCallback(
    (nextAccountId?: string | null) => {
      if (typeof window === "undefined") return;

      const params = new URLSearchParams(searchParams.toString());
      const normalizedNextAccountId = normalizeAccountId(nextAccountId);

      if (normalizedNextAccountId) {
        params.set(ACCOUNT_QUERY_KEY, normalizedNextAccountId);
      } else {
        params.delete(ACCOUNT_QUERY_KEY);
      }
      rememberAccountId(normalizedNextAccountId);

      const query = params.toString();
      window.history.pushState({}, "", query ? `${pathname}?${query}` : pathname);
      URL_CHANGE_EVENTS.forEach((eventName) => {
        window.dispatchEvent(new Event(eventName));
      });
      router.refresh();
    },
    [pathname, router, searchParams],
  );

  return {
    accountId,
    hasScopedAccount: Boolean(accountId),
    setAccountId,
  };
}

export function useAccountScopeOptions(uid?: string | null) {
  const [options, setOptions] = useState<AccountScopeOption[]>([
    { id: null, label: "공개 기본 데이터", description: "기존 전역 공개 토폴로지" },
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const shouldUseBypassAccounts = isDevAdminBypassActive();
    if (!uid && !shouldUseBypassAccounts) {
      queueMicrotask(() => {
        setOptions([
          { id: null, label: "공개 기본 데이터", description: "기존 전역 공개 토폴로지" },
        ]);
      });
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const accounts = shouldUseBypassAccounts
          ? await listPublicAccounts()
          : await Promise.all(
              (await listAccountMembershipsByUid(uid!)).map((membership) =>
                getAccount(membership.accountId),
              ),
            );
        if (cancelled) return;

        const scopedOptions: AccountScopeOption[] = accounts
          .filter((account): account is Account => Boolean(account))
          .map((account) => ({
            id: account.id,
            label: account.name,
            description: account.description,
          }));

        setOptions([
          {
            id: null,
            label: "공개 기본 데이터",
            description: "기존 전역 공개 토폴로지",
          },
          ...scopedOptions,
        ]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  return useMemo(
    () => ({
      options,
      loading,
    }),
    [loading, options],
  );
}
