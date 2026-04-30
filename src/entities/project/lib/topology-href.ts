import { appendAccountQuery } from "@/shared/lib/account-scope";
import {
  appendWorkspaceProjectQuery,
} from "../../../shared/lib/account-scope";

export function getTopologyProjectHref(
  slug: string,
  accountId?: string | null,
  projectId?: string | null,
): string {
  return appendWorkspaceProjectQuery(
    appendAccountQuery(`/?p=${encodeURIComponent(slug)}`, accountId),
    projectId,
  );
}
