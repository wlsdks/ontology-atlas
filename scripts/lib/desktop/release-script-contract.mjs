const DESKTOP_PREFLIGHT_ORDER = [
  "pnpm desktop:check",
  "pnpm notice:check",
  "pnpm licenses:check",
  "pnpm docs-vault:check",
  "pnpm vault:validate",
  "pnpm test:desktop:check",
  "pnpm test:desktop:runtime",
  "pnpm mcp:build-binary",
  "pnpm test:desktop:bridge",
  "pnpm desktop:doctor",
  "pnpm build",
  "pnpm desktop:smoke",
  "pnpm desktop:build",
  "pnpm desktop:perf",
  "pnpm desktop:verify-app",
  "pnpm desktop:verify-dmg",
  "pnpm desktop:verify-install",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitScriptCommands(script) {
  if (typeof script !== "string" || !script.trim()) return [];
  return script.split(" && ").map((command) => command.trim()).filter(Boolean);
}

function matchesInvocation(command, invocation) {
  return command === invocation || command.startsWith(`${invocation} `);
}

function invocationIndexes(commands, invocation) {
  return commands.flatMap((command, index) =>
    matchesInvocation(command, invocation) ? [index] : []
  );
}

function flagCount(command, flag) {
  const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(flag)}(?=\\s|$)`, "g");
  return [...command.matchAll(pattern)].length;
}

function requireFlag(command, flag, errors) {
  const count = flagCount(command, flag);
  if (count !== 1) errors.push(`${flag} must appear exactly once (found ${count})`);
}

function requireLiteral(command, literal, errors) {
  if (!command.includes(literal)) errors.push(`missing required argument ${literal}`);
}

export function evaluateDesktopReleasePreflight(script) {
  const commands = splitScriptCommands(script);
  const errors = [];
  let previousIndex = -1;
  let previousInvocation = null;

  if (commands.length === 0) errors.push("desktop:release-preflight has no commands");

  for (const invocation of DESKTOP_PREFLIGHT_ORDER) {
    const indexes = invocationIndexes(commands, invocation);
    if (indexes.length === 0) {
      errors.push(`missing required desktop preflight command: ${invocation}`);
      continue;
    }
    if (indexes.length > 1) {
      errors.push(`desktop preflight command must appear once: ${invocation} (found ${indexes.length})`);
    }
    const index = indexes[0];
    if (index <= previousIndex && previousInvocation) {
      errors.push(`${previousInvocation} must run before ${invocation}`);
    } else {
      previousIndex = index;
      previousInvocation = invocation;
    }
  }

  for (const command of commands) {
    if (command.startsWith("pnpm dogfood:")) {
      errors.push(`desktop preflight contains source dogfood command: ${command}`);
    }
  }

  const doctor = commands.find((command) => matchesInvocation(command, "pnpm desktop:doctor")) ?? "";
  requireFlag(doctor, "--require-runtime", errors);

  const performance = commands.find((command) => matchesInvocation(command, "pnpm desktop:perf")) ?? "";
  requireFlag(performance, "--require-app", errors);

  const verifyApp = commands.find((command) => matchesInvocation(command, "pnpm desktop:verify-app")) ?? "";
  for (const flag of [
    "--kill-existing",
    "--open-app",
    "--require-window",
    "--reset-window-state",
  ]) {
    requireFlag(verifyApp, flag, errors);
  }
  for (const literal of [
    '--require-owner-name="Ontology Atlas"',
    "--min-window-size=1040x720",
    '--require-accessibility-text="Ontology Atlas"',
  ]) {
    requireLiteral(verifyApp, literal, errors);
  }

  return { ok: errors.length === 0, errors, commandCount: commands.length };
}
