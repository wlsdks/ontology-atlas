import { COLORS } from '../../lib/colors.mjs';
import { relative } from 'node:path';
import { resolveVaultRoot } from '../../lib/resolve-vault.mjs';
import { KNOWN_CODES } from './validate/known-codes.mjs';
import { decideExit, groupIssuesByCode } from './validate/issue-summary.mjs';
import { parseArgs, printUsage } from './validate/parse-args.mjs';
import { scanVault } from './validate/scan-vault.mjs';

export { KNOWN_CODES };

/**
 * `ontology-atlas validate [vault]`: frontmatter integrity; exits 1 on any error issue. `--strict`
 * also fails on warnings; `--fail-on=<codes>` fails on the listed codes only and overrides `--strict`.
 */
export function runValidate(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    return 1;
  }

  if (parsed.listCodes) {
    return printKnownCodes(parsed.json);
  }

  const { json, strict, failOn } = parsed;
  // An unknown code in --fail-on warns on stderr but still runs — an *explicit
  // warning* beats silently falling through to no match.
  if (failOn) {
    const known = new Set(KNOWN_CODES.map((c) => c.code));
    const unknown = failOn.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      process.stderr.write(
        `${COLORS.yellow}warning${COLORS.reset}  --fail-on names unknown codes: ${unknown.join(', ')}. ` +
          `List the available ones: ${COLORS.bold}ontology-atlas validate --list-codes${COLORS.reset}\n`,
      );
    }
  }
  const vaultPath = resolveVaultRoot(parsed.vault);
  const { files, unreadable, reports, errorFiles, warningFiles } = scanVault(vaultPath);

  // Count issues, not files: counting files with a problem hid a warning inside a file that also had
  // an error, and disagreed with `--json`. The exit code stays on file counts; only zero matters there.
  const allIssues = reports.flatMap(({ report }) => report.issues);
  const errorIssues = allIssues.filter((i) => i.severity === 'error').length;
  const warningIssues = allIssues.length - errorIssues;

  // JSON output always has the same shape (a clean vault still gets
  // `problems: []`), so a caller can branch on `.summary.errorFiles` alone —
  // one structure, unlike the branching text mode.
  const groups = groupIssuesByCode(reports);
  if (json) {
    const byCode = {};
    for (const g of groups) {
      byCode[g.code] = {
        severity: g.severity,
        count: g.count,
        files: g.files,
      };
    }
    process.stdout.write(
      JSON.stringify(
        {
          // Only a file we opened counts as "scanned". Unreadable ones are counted
          // separately, so `scanned` matches the scope of what is being certified.
          scanned: files.length - unreadable.length,
          unreadable: unreadable.map((u) => ({
            file: relative(vaultPath, u.file).replace(/\\/g, '/'),
            message: u.message,
          })),
          problems: reports.map(({ file, report }) => ({
            file,
            issues: report.issues.map((i) => ({
              code: i.code,
              severity: i.severity,
              message: i.message,
            })),
          })),
          summary: {
            problemFiles: reports.length,
            errorFiles,
            warningFiles,
            byCode,
            strict,
            failOn,
          },
        },
        null,
        2,
      ) + '\n',
    );
    return decideExit(errorFiles, warningFiles, strict, failOn, groups, unreadable.length);
  }

  // Unreadable files are named **before** declaring clean. Without this line,
  // "vault clean ✓" certifies files that were never opened.
  if (unreadable.length > 0) {
    console.log(
      `\n${COLORS.yellow}[validate] Could not read ${unreadable.length} file(s); excluded from validation scope:${COLORS.reset}`,
    );
    for (const { file, message } of unreadable) {
      console.log(`  ${COLORS.yellow}?${COLORS.reset} ${relative(vaultPath, file).replace(/\\/g, '/')} · ${message}`);
    }
  }

  if (reports.length === 0) {
    // Say the scope, not only "vault clean": this checks frontmatter and graph references, not whether
    // `elements:` / `path:` files exist, which is what `health` checks.
    console.log(
      `${COLORS.green}[validate] Scanned ${files.length - unreadable.length} files: 0 frontmatter or graph-reference issues ✓${COLORS.reset}`,
    );
    console.log(
      `${COLORS.dim}          Code-path existence for elements:/path: is outside this check; \`ontology-atlas health\` verifies it.${COLORS.reset}`,
    );
    return unreadable.length > 0 ? 1 : 0;
  }


  for (const { file, report } of reports) {
    console.log(`\n${file}`);
    for (const issue of report.issues) {
      const color =
        issue.severity === 'error' ? COLORS.red : COLORS.yellow;
      const tag = issue.severity === 'error' ? '✗ ERROR' : '▲ WARN ';
      console.log(`  ${color}${tag}${COLORS.reset}  [${issue.code}] ${issue.message}`);
    }
  }

  // Per-code summary for large vaults; only codes seen twice or more, since one occurrence is already
  // in the per-file output.
  const repeatedCodes = groups.filter((g) => g.count >= 2);
  if (repeatedCodes.length > 0) {
    console.log(`\n${COLORS.dim}── grouped by code ──${COLORS.reset}`);
    for (const g of repeatedCodes) {
      const color = g.severity === 'error' ? COLORS.red : COLORS.yellow;
      const tag = g.severity === 'error' ? '✗' : '▲';
      const head = g.files.slice(0, 3).join(', ');
      const tail = g.files.length > 3 ? ` (+${g.files.length - 3} more)` : '';
      console.log(
        `  ${color}${tag}${COLORS.reset} ${g.code} · ${g.count} occurrence${g.count === 1 ? '' : 's'}` +
          `\n     ${COLORS.dim}${head}${tail}${COLORS.reset}`,
      );
    }
  }

  let modeTag = '';
  if (failOn && failOn.length > 0) {
    const matched = failOn.filter((code) => groups.some((g) => g.code === code));
    if (matched.length > 0) {
      modeTag = ` ${COLORS.dim}[--fail-on=${failOn.join(',')}: matched ${matched.join(',')}]${COLORS.reset}`;
    } else {
      modeTag = ` ${COLORS.dim}[--fail-on=${failOn.join(',')}: no match → exit 0]${COLORS.reset}`;
    }
  } else if (strict && warningFiles > 0) {
    modeTag = ` ${COLORS.dim}[--strict: warnings also exit 1]${COLORS.reset}`;
  }
  console.log(
    `\n[validate] scanned ${files.length - unreadable.length} files / ` +
      `${allIssues.length} issues in ${reports.length} files ` +
      `(${COLORS.red}error ${errorIssues}${COLORS.reset} · ` +
      `${COLORS.yellow}warning ${warningIssues}${COLORS.reset})${modeTag}`,
  );
  return decideExit(errorFiles, warningFiles, strict, failOn, groups, unreadable.length);
}

function printKnownCodes(asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify({ codes: KNOWN_CODES }, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(
    `${COLORS.bold}validate issue codes${COLORS.reset} ${COLORS.dim}(--fail-on=<code> fails on chosen codes only)${COLORS.reset}\n\n`,
  );
  for (const c of KNOWN_CODES) {
    const severityColor = c.severity === 'error' ? COLORS.red : COLORS.yellow;
    const severityTag = c.severity === 'error' ? '✗ error  ' : '▲ warning';
    process.stdout.write(
      `  ${severityColor}${severityTag}${COLORS.reset}  ${COLORS.bold}${c.code.padEnd(24)}${COLORS.reset}  ${COLORS.dim}${c.description}${COLORS.reset}\n`,
    );
  }
  process.stdout.write('\n');
  return 0;
}
