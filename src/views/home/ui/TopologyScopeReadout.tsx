"use client";

import { useTranslations } from "next-intl";

export function TopologyScopeReadout({ total, members, synthetic }: {
  total: number | null;
  members: number | null;
  synthetic: boolean;
}) {
  const t = useTranslations("firstRunStarter.readout");
  if (total === null || total <= 0 || (!synthetic && (members === null || members <= 0 || members > total))) return null;
  return (
    <div
      data-testid="topology-scope-readout"
      data-total-concepts={total}
      data-scope-concepts={synthetic ? total : members}
      data-synthetic={synthetic ? "true" : "false"}
      className="pointer-events-none hidden text-label tabular-nums text-[color:var(--color-text-tertiary)] md:block"
    >
      {synthetic ? t("synthetic", { count: total }) : members === total
        ? t("scopeFull", { count: total }) : t("scopePartial", { shown: members!, total })}
    </div>
  );
}
