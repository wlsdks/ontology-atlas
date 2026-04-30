"use client";

import { useEffect, useMemo, useState } from "react";
import { type AccountMembership } from "@/entities/account";
import { listAccountMembershipsByEmail, listAccountMembershipsByUid } from "@/entities/account";
import { useGlobalAdmin } from "@/features/permissions";
import { useUserAuth } from "@/features/user-auth";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import {
  resolveScopedAccountAccess,
  type ScopedAccountAccess,
} from "./account-access";

export interface UseScopedAccountAccessResult extends ScopedAccountAccess {
  membership: AccountMembership | null;
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
  } | null;
}

export function useScopedAccountAccess(
  accountId?: string | null,
): UseScopedAccountAccessResult {
  const normalizedAccountId = normalizeAccountId(accountId);
  const { status: userStatus, user: sessionUser } = useUserAuth();
  const { status: adminStatus, user: adminUser } = useGlobalAdmin();
  const [membership, setMembership] = useState<AccountMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);

  const effectiveUser = sessionUser ?? adminUser;
  const effectiveUserUid = effectiveUser?.uid ?? null;
  const effectiveUserEmail = effectiveUser?.email ?? null;
  const isAdmin = adminStatus === "authenticated";

  useEffect(() => {
    if (!normalizedAccountId || !effectiveUserUid || isAdmin) {
      queueMicrotask(() => {
        setMembership(null);
        setMembershipLoading(false);
      });
      return;
    }

    let cancelled = false;

    const run = async () => {
      setMembershipLoading(true);
      try {
        const membershipsByUid = await listAccountMembershipsByUid(effectiveUserUid);
        const membershipsByEmail =
          membershipsByUid.length === 0 && effectiveUserEmail
            ? await listAccountMembershipsByEmail(effectiveUserEmail)
            : [];
        const memberships = membershipsByUid.length > 0 ? membershipsByUid : membershipsByEmail;
        if (cancelled) return;
        setMembership(
          memberships.find(
            (entry: AccountMembership) => entry.accountId === normalizedAccountId,
          ) ?? null,
        );
      } finally {
        if (!cancelled) {
          setMembershipLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [effectiveUserEmail, effectiveUserUid, isAdmin, normalizedAccountId]);

  return useMemo(
    () => ({
      ...resolveScopedAccountAccess({
        loading:
          userStatus === "loading" ||
          adminStatus === "loading" ||
          membershipLoading,
        isSignedIn: Boolean(effectiveUser),
        isAdmin,
        accountId: normalizedAccountId,
        membershipRole: membership?.role ?? null,
      }),
      membership,
      user: effectiveUser,
    }),
    [
      adminStatus,
      effectiveUser,
      isAdmin,
      membership,
      membershipLoading,
      normalizedAccountId,
      userStatus,
    ],
  );
}
