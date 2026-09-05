// `ontology-atlas wiki-validate [vault]`
//
// Judges every page under `wiki/` against the contract in
// `docs/ONTOLOGY-ATLAS-SPEC.md` §11 — the shape a page must have whoever wrote it: an
// ACP agent, a local model, or a person. The validator itself is `mcp/src/wiki-schema.mjs`,
// the same module the app's Wiki list and the Compile brief use, so a page that passes
// here is a page every surface accepts.
//
// **Exit codes** follow the 2026-09-04 rule (`docs/DECISIONS.md`): non-zero means the
// input could not be answered, zero means it was answered even when the answer is empty.
// A folder with no wiki pages exits 0 — that is an answer. The verdict itself rides on
// the same split `validate` uses: 1 when at least one page does not fit, 2 when the
// vault could not be read at all.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { COLORS } from '../lib/colors.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { walkMd } from '../lib/walk-vault.mjs';
import { WIKI_DIR, isWikiTemplateSlug, validateWikiPage } from '../lib/wiki-schema.mjs';
import {
  formatUnknownFlagError,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json'];

function printUsage(stream = process.stderr) {
  stream.write(
    [
      `${COLORS.bold}ontology-atlas wiki-validate${COLORS.reset}`,
      '',
      'Usage:',
      '  ontology-atlas wiki-validate [vault] [--vault <path>] [--json]',
      '',
      `  Checks every page under ${WIKI_DIR}/ against the wiki page contract:`,
      '  no kind:, the seven required frontmatter fields, the five sections in order,',
      '  and a citation on every bullet under ## Facts.',
      '',
      '  Exit 0  every page fits (a folder with no wiki pages also fits).',
      '  Exit 1  at least one page does not.',
      '  Exit 2  the vault could not be read.',
      '',
    ].join('\n'),
  );
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json };
}

export async function runWikiValidate(args) {
  const { vault, json, help, error } = parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 2;
  }

  let vaultRoot;
  let files;
  let knownSources;
  try {
    vaultRoot = resolveVaultRoot(vault);
    files = walkMd(vaultRoot).filter((file) => {
      const rel = relative(vaultRoot, file);
      // The shipped template is skipped: its citations name `sources/<file>`, a
      // placeholder, so judging it would report a problem on the file that is the answer.
      if (isWikiTemplateSlug(rel)) return false;
      return rel.startsWith(`${WIKI_DIR}/`);
    });
    knownSources = listSources(vaultRoot);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  const pages = [];
  let unreadable = 0;
  for (const file of files.sort()) {
    const page = relative(vaultRoot, file);
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch (err) {
      unreadable += 1;
      pages.push({
        page,
        ok: false,
        problems: [
          {
            code: 'unreadable',
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      });
      continue;
    }
    const { ok, problems } = validateWikiPage(raw, { knownSources });
    pages.push({ page, ok, problems });
  }

  const failing = pages.filter((entry) => !entry.ok);

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          vault: vaultRoot,
          pageCount: pages.length,
          failingCount: failing.length,
          pages,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    if (pages.length === 0) {
      // Zero pages is an answer, not a failure: a folder with no library yet is the
      // ordinary state of a new vault, and telling somebody that is an error would teach
      // them to ignore this command's exit code.
      process.stdout.write(
        `${COLORS.dim}no pages under ${WIKI_DIR}/ in ${vaultRoot}${COLORS.reset}\n`,
      );
    }
    for (const entry of pages) {
      if (entry.ok) {
        process.stdout.write(`${COLORS.green}fits${COLORS.reset}  ${entry.page}\n`);
        continue;
      }
      process.stdout.write(`${COLORS.red}off-template${COLORS.reset}  ${entry.page}\n`);
      for (const problem of entry.problems) {
        const at = problem.line ? `${COLORS.dim}:${problem.line}${COLORS.reset}` : '';
        process.stdout.write(`      ${COLORS.bold}${problem.code}${COLORS.reset}${at}  ${problem.message}\n`);
      }
    }
    if (pages.length > 0) {
      process.stdout.write(
        `\n${pages.length - failing.length}/${pages.length} pages fit the contract.\n`,
      );
    }
  }

  if (unreadable > 0) return 2;
  return failing.length > 0 ? 1 : 0;
}

/**
 * Vault-relative paths under `sources/`, so a citation naming a file nobody has can be
 * reported. Listing only — no source file is opened, here or anywhere in this command.
 */
function listSources(vaultRoot) {
  const out = new Set();
  const stack = [{ dir: join(vaultRoot, 'sources'), prefix: 'sources' }];
  while (stack.length > 0) {
    const { dir, prefix } = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) stack.push({ dir: join(dir, entry.name), prefix: rel });
      else if (entry.isFile()) out.add(rel);
    }
  }
  return out;
}
