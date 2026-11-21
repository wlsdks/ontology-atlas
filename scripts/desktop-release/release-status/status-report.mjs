/** The audit's output: the machine payload, the terminal listing, the Markdown checklist and the exit code. */

import fs from "node:fs";
import path from "node:path";

import { currentDate } from "./environment.mjs";

/** The JSON document `--json` prints and `--json-file` writes. */
export function buildStatusPayload(options, checks, generatedAt) {
  const blockers = checks.filter((check) => check.status === "blocked");
  const ready = blockers.length === 0;
  const nextActions = blockers
    .filter((check) => check.next)
    .map((check) => ({
      id: check.id,
      label: check.label,
      scope: check.scope,
      owner: check.owner ?? "developer",
      next: check.next,
      commands: check.commands ?? [],
    }));
  return {
    schemaVersion: 2,
    generatedAt,
    repo: options.repo,
    tag: options.tag,
    pr: options.pr || null,
    ready,
    status: ready ? "ready" : "blocked",
    readyAt: ready ? generatedAt : null,
    blockedAt: ready ? null : generatedAt,
    blockerCount: blockers.length,
    blockerIds: blockers.map((check) => check.id),
    localBlockerIds: blockers.filter((check) => check.scope === "local").map((check) => check.id),
    externalBlockerIds: blockers.filter((check) => check.scope === "external").map((check) => check.id),
    blockersByOwner: groupBlockersByOwner(blockers),
    missingSecrets: checks.find((check) => check.id === "apple_release_secrets")?.missingSecrets ?? [],
    nextActions,
    nextActionsByOwner: groupNextActionsByOwner(nextActions),
    checks,
  };
}

export function renderAndExit(options, checks) {
  const blockers = checks.filter((check) => check.status === "blocked");
  const generatedAt = currentDate().toISOString();
  const payload = buildStatusPayload(options, checks, generatedAt);
  if (options.jsonFile) {
    const jsonFilePath = path.resolve(process.cwd(), options.jsonFile);
    fs.mkdirSync(path.dirname(jsonFilePath), { recursive: true });
    fs.writeFileSync(jsonFilePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
  if (options.markdownFile) {
    const markdownFilePath = path.resolve(process.cwd(), options.markdownFile);
    fs.mkdirSync(path.dirname(markdownFilePath), { recursive: true });
    fs.writeFileSync(markdownFilePath, renderMarkdownChecklist(payload));
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    if (blockers.length > 0) {
      console.error(`[desktop-release-status] blocked: ${blockers.length} release requirement(s) are not satisfied`);
      process.exitCode = 1;
    }
    return;
  }

  console.log(`[desktop-release-status] ${options.repo} ${options.tag}`);
  console.log(`local blockers: ${formatBlockerIds(payload.localBlockerIds)}`);
  console.log(`external blockers: ${formatBlockerIds(payload.externalBlockerIds)}`);
  if (payload.nextActions.length > 0) {
    console.log("next handoff by owner:");
    for (const [owner, actions] of Object.entries(payload.nextActionsByOwner)) {
      console.log(`  ${owner}: ${actions.map((action) => action.id).join(", ")}`);
    }
  }
  for (const check of checks) {
    const marker = check.status === "ok" ? "✓" : check.status === "skipped" ? "·" : "✗";
    console.log(`${marker} ${check.label}: ${check.detail}`);
    if (check.next) {
      console.log(`  next: ${check.next}`);
    }
    if (Array.isArray(check.commands) && check.commands.length > 0) {
      console.log("  commands (run in one shell session):");
      for (const command of check.commands) {
        console.log(`    - ${command}`);
      }
    }
  }
  if (blockers.length > 0) {
    console.error(`[desktop-release-status] blocked: ${blockers.length} release requirement(s) are not satisfied`);
    process.exitCode = 1;
    return;
  }
  console.log("[desktop-release-status] ready: public macOS release requirements are satisfied");
}

function groupBlockersByOwner(blockers) {
  const byOwner = {};
  for (const check of blockers) {
    const owner = check.owner ?? "developer";
    byOwner[owner] ??= [];
    byOwner[owner].push(check.id);
  }
  return byOwner;
}

function groupNextActionsByOwner(actions) {
  const byOwner = {};
  for (const action of actions) {
    const owner = action.owner ?? "developer";
    byOwner[owner] ??= [];
    byOwner[owner].push(action);
  }
  return byOwner;
}

function formatBlockerIds(ids) {
  return ids.length > 0 ? ids.join(", ") : "none";
}

export function renderMarkdownChecklist(payload) {
  const lines = [
    "# macOS Release Status",
    "",
    `- Repo: \`${payload.repo}\``,
    `- Tag: \`${payload.tag}\``,
    `- PR: ${payload.pr ? `#${payload.pr}` : "not checked"}`,
    `- Status: ${payload.status}`,
    `- Ready: ${payload.ready ? "yes" : "no"}`,
    `- Generated: ${payload.generatedAt}`,
    `- Ready at: ${payload.readyAt ?? "not ready"}`,
    `- Blocked at: ${payload.blockedAt ?? "not blocked"}`,
    `- Local blockers: ${formatBlockerIds(payload.localBlockerIds)}`,
    `- External blockers: ${formatBlockerIds(payload.externalBlockerIds)}`,
    "",
  ];

  const blockers = payload.checks.filter((check) => check.status === "blocked");
  if (blockers.length === 0) {
    lines.push("## Blockers", "");
    lines.push("No blockers.", "");
  } else {
    lines.push("## Owner Handoff", "");
    for (const [owner, actions] of Object.entries(payload.nextActionsByOwner)) {
      lines.push(`### ${owner}`, "");
      for (const action of actions) {
        lines.push(`- ${action.label} (\`${action.id}\`): ${action.next}`);
        if (Array.isArray(action.commands) && action.commands.length > 0) {
          lines.push("  - First command:");
          lines.push(`    - \`${action.commands[0]}\``);
        }
      }
      lines.push("");
    }

    lines.push("## Blockers", "");
    for (const check of blockers) {
      lines.push(`- [ ] ${check.label} (\`${check.id}\`)`);
      lines.push(`  - Scope: ${check.scope}`);
      lines.push(`  - Owner: ${check.owner}`);
      lines.push(`  - Detail: ${check.detail}`);
      if (check.next) {
        lines.push(`  - Next: \`${check.next}\``);
      }
      if (Array.isArray(check.commands) && check.commands.length > 0) {
        lines.push("  - Commands (run in one shell session):");
        for (const command of check.commands) {
          lines.push(`    - \`${command}\``);
        }
      }
      const missingSecretNames = Array.isArray(check.missingSecrets) ? check.missingSecrets : [];
      if (missingSecretNames.length > 0) {
        lines.push("  - Missing secrets:");
        for (const secret of missingSecretNames) {
          lines.push(`    - \`${secret}\``);
        }
      }
    }
    lines.push("");
  }

  lines.push("## Checks", "");
  for (const check of payload.checks) {
    const marker = check.status === "ok" ? "[x]" : check.status === "skipped" ? "[-]" : "[ ]";
    lines.push(`- ${marker} ${check.label} (\`${check.id}\`) - ${check.detail}`);
  }
  lines.push("");
  return `${lines.join("\n")}`;
}
