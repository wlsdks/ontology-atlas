/** The shape of one audited requirement (ok, blocked or skipped) and who owns it. */

const CHECK_SCOPES = new Map([
  ["github_cli_auth", "local"],
  ["version_alignment", "local"],
  ["local_preflight", "local"],
  ["pull_request", "external"],
  ["release_workflow", "external"],
  ["release_tag_slot", "external"],
  ["apple_release_secrets", "external"],
  ["github_release", "external"],
  ["download_assets", "external"],
]);
const CHECK_OWNERS = new Map([
  ["github_cli_auth", "developer"],
  ["version_alignment", "developer"],
  ["local_preflight", "developer"],
  ["pull_request", "reviewer"],
  ["release_workflow", "release_operator"],
  ["release_tag_slot", "release_operator"],
  ["apple_release_secrets", "release_operator"],
  ["github_release", "release_operator"],
  ["download_assets", "release_operator"],
]);

function withScope(check) {
  return {
    scope: CHECK_SCOPES.get(check.id) ?? "local",
    owner: CHECK_OWNERS.get(check.id) ?? "developer",
    ...check,
  };
}

export function ok(id, label, detail) {
  return withScope({ id, status: "ok", label, detail });
}

export function blocked(id, label, detail, next, commands = [], extra = {}) {
  const check = withScope({ id, status: "blocked", label, detail, next });
  if (commands.length > 0) {
    check.commands = commands;
  }
  Object.assign(check, extra);
  return check;
}

export function skipped(id, label, detail) {
  return withScope({ id, status: "skipped", label, detail });
}
