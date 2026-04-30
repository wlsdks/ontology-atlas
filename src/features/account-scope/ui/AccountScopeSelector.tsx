"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  useAccountScope,
  useAccountScopeOptions,
} from "@/features/account-scope/model/use-account-scope";

interface Props {
  uid?: string | null;
  compact?: boolean;
}

export function AccountScopeSelector({ uid, compact = false }: Props) {
  const { accountId, setAccountId } = useAccountScope();
  const { options, loading } = useAccountScopeOptions(uid);

  return (
    <label
      className={cn(
        "relative inline-flex flex-col gap-1",
        compact ? "min-w-[180px]" : "min-w-[220px]",
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        작업 공간
      </span>
      <select
        value={accountId ?? ""}
        onChange={(event) => setAccountId(event.target.value || null)}
        className={cn(
          "h-10 appearance-none rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 pr-9 text-sm text-[color:var(--color-text-primary)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]",
        )}
        disabled={loading}
      >
        {options.map((option) => (
          <option key={option.id ?? "__default__"} value={option.id ?? ""}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-[30px] text-[color:var(--color-text-tertiary)]"
      />
    </label>
  );
}
