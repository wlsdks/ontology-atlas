import type { useTranslations } from "use-intl";

import type { useLibraryAgent } from "../../lib/agent/use-library-agent";

/** Why an ability that needs a connected coding agent is off here, or null when an agent can run it. */
export function agentOnlyReason(
  route: ReturnType<typeof useLibraryAgent>["route"],
  t: ReturnType<typeof useTranslations<"library">>,
): string | null {
  if (route === "agent") return null;
  if (route === "checking") return t("stage.blockedChecking");
  if (route === "unavailable") return t("stage.blockedNoAgent");
  return t("stage.blockedLocalOnly");
}
