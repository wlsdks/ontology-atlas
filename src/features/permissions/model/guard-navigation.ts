interface GuardNavigationInput {
  accountId?: string | null;
  currentPath?: string | null;
}

export function buildGuardLoginHref({
  accountId,
  currentPath,
}: GuardNavigationInput): string {
  const params = new URLSearchParams();
  const normalizedAccountId = accountId?.trim();
  const normalizedCurrentPath = currentPath?.trim();

  if (normalizedAccountId) {
    params.set("account", normalizedAccountId);
  }
  if (normalizedCurrentPath && normalizedCurrentPath !== "/login/") {
    params.set("next", normalizedCurrentPath);
  }

  const query = params.toString();
  return `/login/${query ? `?${query}` : ""}`;
}

export function buildGuardHomeHref(accountId?: string | null): string {
  const normalizedAccountId = accountId?.trim();
  if (!normalizedAccountId) return "/";
  return `/?account=${encodeURIComponent(normalizedAccountId)}`;
}
