import { appendAccountQuery } from "@/shared/lib/account-scope";

export function buildServiceEntryHref(input?: {
  accountId?: string | null;
  next?: string | null;
}) {
  const url = new URL(
    appendAccountQuery("/", input?.accountId ?? null),
    "http://local.test",
  );
  const next = input?.next?.trim();

  if (next && next !== "/") {
    url.searchParams.set("next", next);
  }

  return `${url.pathname}${url.search}`;
}
