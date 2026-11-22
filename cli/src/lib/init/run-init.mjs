import { mkdirSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { cwd, stdout } from 'node:process';
import { COLORS } from '../colors.mjs';
import { cliInvocation } from '../self-invocation.mjs';
import { cwdBindingScope } from '../agent-setup/cwd-binding-scope.mjs';
import { indentBriefing, rootBriefing } from '../agent-setup/root-briefing.mjs';
import { stampInitCompleted } from '../telemetry.mjs';
import { fail, info, warn, ok } from '../status-lines.mjs';
import { codexSetupCommand, writeCodexConfig, writeMcpJson } from './client-config.mjs';
import { resolveMcpServerCommand } from './mcp-server-command.mjs';
import { documentsNextSteps, vaultNextSteps } from './next-steps.mjs';
import { runQuickStart } from './quick-start.mjs';
import { shellQuote } from './shell-quote.mjs';
import { TEMPLATE_ROOTS, copyTree, resolveTemplateRoot } from './template-copy.mjs';

const CLI = cliInvocation();

function realpathOrSelf(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export async function runInit(targetArg, options = {}) {
  const quickStart = Boolean(options.quickStart);
  const documentsOnly = Boolean(options.documents);
  // `atlas/` is the folder's fixed name inside a code repository — the same name the app's
  // permission locality reads a project root from — so the default says what the docs say.
  const target = resolve(cwd(), targetArg ?? 'atlas');
  let serverCommand;
  try {
    serverCommand = resolveMcpServerCommand();
  } catch (error) {
    fail(error?.message ?? String(error));
    return 2;
  }
  const locale = typeof options.locale === 'string' ? options.locale.toLowerCase() : 'en';
  if (!Object.hasOwn(TEMPLATE_ROOTS, locale)) {
    fail(`unknown --locale "${locale}": supported: ${Object.keys(TEMPLATE_ROOTS).join(', ')}`);
    return 2;
  }
  const templateRoot = resolveTemplateRoot(locale);
  info(`scaffolding ontology vault at ${COLORS.bold}${target}${COLORS.reset}`);

  if (!existsSync(templateRoot)) {
    fail(`template root not found: ${templateRoot}`);
    return 2;
  }

  // Skills go where the coding agent starts, the repository root: Claude Code reads the root `.claude/skills/`.
  // A nested vault skips them here and they install at the root below. Same containment rule as the agent
  // configs (`cwdBindingScope`): a vault outside cwd is its own root, and cwd is left untouched.
  const skillsScope = cwdBindingScope(realpathOrSelf(cwd()), realpathOrSelf(target));
  const vaultIsRepoRoot = skillsScope.reason === 'same';
  const skillsStayInVault = vaultIsRepoRoot || skillsScope.reason === 'outside';
  // A documents folder gets no starter skills: they teach an agent to sync code meaning
  // into nodes, and there are no nodes here. The MCP wiring below still lands, because an
  // agent reaching the folder is how pages get compiled.
  const installSkills = !documentsOnly;
  const skillsRelativeRoot = join('.claude', 'skills');
  // `--documents`: only the wiki's furniture comes from the template. Node folders, `project.md`,
  // the agent files and skills are the map's scaffolding, which a person who opened a folder of
  // documents did not ask for.
  const wikiRoot = 'wiki';
  const documentsSkip = (rel) => rel !== wikiRoot && !rel.startsWith(`${wikiRoot}${sep}`);
  const { created, skipped } = copyTree(templateRoot, target, {
    skip: (rel) =>
      (documentsOnly && documentsSkip(rel)) ||
      (!skillsStayInVault && (rel === skillsRelativeRoot || rel.startsWith(`${skillsRelativeRoot}${sep}`))),
  });
  // `sources/` is part of the shape in both modes: raw documents land there whether the
  // folder is a wiki on its own or the map's vault, and a folder that shows it from the
  // first minute tells the person where files go without a sentence.
  mkdirSync(join(target, 'sources'), { recursive: true });

  // The same skills where the agent will look, keeping any file a person already wrote. Claude Code reads
  // `.claude/skills/`; Codex and Cursor read only `.agents/skills/`. Copying from one template into both
  // keeps them identical by construction.
  const agentsSkillsRelativeRoot = join('.agents', 'skills');
  const installedSkills = [];
  const skillsSource = join(templateRoot, skillsRelativeRoot);
  if (installSkills && existsSync(skillsSource)) {
    for (const name of readdirSync(skillsSource)) installedSkills.push(name);
    const agentStartDir = skillsStayInVault ? target : cwd();
    const destinations = skillsStayInVault
      // The template already wrote `.claude/skills` here; only the mirror is missing.
      ? [agentsSkillsRelativeRoot]
      : [skillsRelativeRoot, agentsSkillsRelativeRoot];
    const written = [];
    for (const relativeRoot of destinations) {
      if (copyTree(skillsSource, join(agentStartDir, relativeRoot)).created > 0) written.push(relativeRoot);
    }
    if (written.length > 0) {
      const where = skillsStayInVault
        ? skillsScope.reason === 'outside' ? ' (in the vault: it is outside cwd, so cwd is untouched)' : ''
        : ' (installed where the agent runs, not in the vault)';
      ok(`  ${skillsStayInVault ? 'vault' : 'cwd'} ${written.map((relativeRoot) => `${relativeRoot}/`).join(' + ')} — ${installedSkills.join(', ')}${where}`);
    }
  }

  // The paste block names the vault from the root it will be pasted into: the
  // codebase root when the vault lives inside it, otherwise the vault itself
  // (a `../../..` chain only ever resolved from the directory `init` ran in).
  const briefingSnippet = `${COLORS.dim}${indentBriefing(rootBriefing(
    skillsScope.write ? skillsScope.relativeVault.replace(/^\.\//, '') : '.',
  ))}${COLORS.reset}`;

  if (created === 0) {
    warn(`no new files written: target already has matching files`);
  }
  if (skipped > 0) {
    warn(`${skipped} existing file(s) preserved (not overwritten)`);
  }
  const clientBindingIssues = [];

  const binding = { serverCommand, clientBindingIssues };

  // macOS aliases temporary directories (`/tmp` and `/private/tmp`), and mixing an aliased target
  // with the canonical cwd makes `relative()` produce `/private/private/...`. Both directories exist
  // now, so every config path is computed from their realpaths.
  const cwdPath = realpathSync(cwd());
  const canonicalTarget = realpathSync(target);
  let vaultRepoArg = relative(canonicalTarget, cwdPath) || '.';
  if (!vaultRepoArg.startsWith('.')) vaultRepoArg = `./${vaultRepoArg}`;
  // 1. Vault target itself — vault is cwd; repo root remains explicit.
  writeMcpJson(binding, target, '.', vaultRepoArg, 'vault');
  writeCodexConfig(binding, target, '.', vaultRepoArg, 'vault');

  // 2. cwd (codebase root), only when the vault is created inside it. Otherwise cwd is merely where the
  // person stood, and rewriting its configs would silently rebind an unrelated project (lib/agent-setup/cwd-binding-scope.mjs).
  const bindingScope = cwdBindingScope(cwdPath, canonicalTarget);
  // Every printed follow-up and the quick-start bootstrap name the vault just scaffolded, never '.',
  // or pasted commands (including `absorb --write`) would target wherever the person stood.
  let cwdVaultArg = relative(cwdPath, canonicalTarget) || '.';
  if (bindingScope.write) {
    cwdVaultArg = bindingScope.relativeVault;
    writeMcpJson(binding, cwdPath, cwdVaultArg, '.', 'cwd');
    writeCodexConfig(binding, cwdPath, cwdVaultArg, '.', 'cwd');
  } else if (bindingScope.reason === 'outside') {
    // Saying so matters: somebody who expected their current project to be wired needs to know it
    // was not, and why, rather than discovering later that their agent points somewhere else.
    warn(
      `  cwd left untouched: the vault is outside ${cwdPath}. Its own .mcp.json and .codex/config.toml are wired; run this from the project you want bound.`,
    );
  }

  const wiredFolders = bindingScope.write
    ? 'Both your codebase root (cwd) and the vault folder now have'
    : 'The vault folder now has';
  const wiredOpenWhich = bindingScope.write ? 'either folder' : 'that folder';

  if (clientBindingIssues.length > 0) {
    stampInitCompleted(target);
    stdout.write(`\n${COLORS.yellow}${COLORS.bold}scaffolded but client binding unresolved${COLORS.reset}: vault files were created, but ${clientBindingIssues.join(', ')} could not be repaired safely.\n`);
    stdout.write(`${COLORS.dim}The originals were preserved. Merge the adjacent .example file(s), then run:${COLORS.reset}\n`);
    stdout.write(`  ${COLORS.cyan}${CLI} agent-setup ${shellQuote(target)} --root ${shellQuote(cwdPath)} --json${COLORS.reset}\n`);
    return 1;
  }


  // A CLI self-invocation is already in runnable form, so it is not re-quoted —
  // quoting would turn the whole `node /path` into one token and break execution.
  const analyzeCommand = [CLI, ...['analyze', '.', '--vault', cwdVaultArg].map(shellQuote)]
    .join(' ');
  const bootstrapCommand = [
    CLI,
    ...['bootstrap', '.', '--vault', cwdVaultArg].map(shellQuote),
  ].join(' ');

  stampInitCompleted(target);

  if (quickStart) {
    return runQuickStart({ target, cwdVaultArg, runBootstrap: options.runBootstrap });
  }


  if (documentsOnly) {
    stdout.write(documentsNextSteps({ target }));
    return 0;
  }

  stdout.write(
    vaultNextSteps({
      target,
      analyzeCommand,
      bootstrapCommand,
      wiredFolders,
      wiredOpenWhich,
      codexSetupCommand: codexSetupCommand({ target, cwdPath, serverCommand }),
      vaultIsRepoRoot,
      briefingSnippet,
    }),
  );
  return 0;
}
