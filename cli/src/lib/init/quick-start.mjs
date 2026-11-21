import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cwd, stdout } from 'node:process';
import { COLORS } from '../colors.mjs';
import { cliInvocation } from '../self-invocation.mjs';
import { shellQuote } from './shell-quote.mjs';

const CLI = cliInvocation();

// `init --quick-start`: scaffold, bootstrap through `runBootstrap`,
// .mcp.json, an absorb suggestion when CLAUDE.md/AGENTS.md exists (never auto-absorbed), and a next-steps
// block of at most three lines.
export async function runQuickStart({ target, cwdVaultArg, runBootstrap }) {
  stdout.write(`\n${COLORS.bold}quick start${COLORS.reset}: bootstrapping from your repo...\n`);
  const bootstrapCode = await runBootstrap(['.', '--vault', cwdVaultArg]);

  if (bootstrapCode === 3) {
    stdout.write(`
${COLORS.yellow}${COLORS.bold}quick start review ready${COLORS.reset} — vault scaffolded; the CLI itself writes no meaning.

${COLORS.bold}Next:${COLORS.reset}
  ${COLORS.dim}1.${COLORS.reset} Review the printed candidates.
  ${COLORS.dim}2.${COLORS.reset} Run /atlas-grow in your agent: it proposes candidates with evidence
     and writes only the ones you pick, a few at a time.
  ${COLORS.dim}3.${COLORS.reset} Landing a whole plan at once instead needs a qualification packet whose
     evaluator is not its builder. That path is not required to build a vault.
`);
    return bootstrapCode;
  }

  if (bootstrapCode !== 0) {
    const verifyCommand = [
      CLI,
      ...['mcp-verify', cwdVaultArg, '--timeout-ms', '15000'].map(shellQuote),
    ].join(' ');
    const retryCommand = [
      CLI,
      ...['bootstrap', '.', '--vault', cwdVaultArg].map(shellQuote),
    ].join(' ');
    stdout.write(`
${COLORS.yellow}${COLORS.bold}quick start incomplete${COLORS.reset} — vault scaffolded; agent configs written but unverified.

${COLORS.bold}Recover:${COLORS.reset}
  ${COLORS.dim}1.${COLORS.reset} Diagnose MCP        ${COLORS.cyan}${verifyCommand}${COLORS.reset}
  ${COLORS.dim}2.${COLORS.reset} Retry bootstrap     ${COLORS.cyan}${retryCommand}${COLORS.reset}

${COLORS.dim}Do not treat the agent connection or ontology bootstrap as ready until both commands pass.${COLORS.reset}
`);
    return bootstrapCode;
  }

  const repoRoot = cwd();
  const foundGuides = ['AGENTS.md', 'CLAUDE.md'].filter((name) => existsSync(join(repoRoot, name)));
  if (foundGuides.length > 0) {
    stdout.write(
      `\n${COLORS.yellow}note${COLORS.reset}  found ${foundGuides.join(', ')}: consider absorbing ` +
        `${foundGuides.length > 1 ? 'them' : 'it'} into the vault (never automatic: your call):\n`,
    );
    for (const guide of foundGuides) {
      // Printed to be pasted and run, so it goes through `cliInvocation()` (`self-invocation.mjs`).
      const absorbCommand = [
        CLI,
        ...['absorb', guide, '--vault', cwdVaultArg].map(shellQuote),
      ].join(' ');
      stdout.write(`       ${COLORS.cyan}${absorbCommand}${COLORS.reset}\n`);
    }
    stdout.write(
      `       ${COLORS.dim}dry-run by default: review the plan, then land it yourself by adding --write${COLORS.reset}\n`,
    );
  }

  stdout.write(`
${COLORS.green}${COLORS.bold}quick start done${COLORS.reset}: vault scaffolded + bootstrapped from your repo.

${COLORS.bold}Next:${COLORS.reset}
  ${COLORS.dim}1.${COLORS.reset} Open the vault        ${COLORS.cyan}cd ${target} && ${CLI} list${COLORS.reset}
  ${COLORS.dim}2.${COLORS.reset} MCP already wired      restart Claude Code / Cursor / Codex from this folder
  ${COLORS.dim}3.${COLORS.reset} Try asking your agent  e.g. "what does the auth capability depend on?"
`);
  return 0;
}
