#!/usr/bin/env node
// Vault migrator — applies frontmatter schema evolution safely.
//
// Usage:
//   pnpm vault:migrate --list
//   pnpm vault:migrate <id>                    # dry-run (default)
//   pnpm vault:migrate <id> --write            # actually write to disk
//   pnpm vault:migrate <id> --vault <dir>      # point at another vault
//
// dry-run is the default — nothing changes unless the user passes `--write`.
// Full guide: scripts/migrations/README.md.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const DEFAULT_VAULT = path.join(ROOT, "docs", "ontology");

async function listMigrations() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".mjs") ||
      entry.name.endsWith(".test.mjs")
    ) continue;
    const full = path.join(MIGRATIONS_DIR, entry.name);
    const mod = await import(full);
    out.push({
      id: mod.id ?? entry.name.replace(/\.mjs$/, ""),
      description: mod.description ?? "(no description)",
      path: full,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function loadMigration(id) {
  const all = await listMigrations();
  const found = all.find((m) => m.id === id);
  if (!found) {
    throw new Error(
      `migration "${id}" 없음. 사용 가능: ${all.map((m) => m.id).join(", ")}`,
    );
  }
  const mod = await import(found.path);
  if (typeof mod.migrate !== "function") {
    throw new Error(`migration "${id}" 가 \`migrate\` 함수를 export 하지 않음.`);
  }
  return mod;
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function parseArgs(argv) {
  const args = {
    write: false,
    list: false,
    help: false,
    id: null,
    vault: DEFAULT_VAULT,
    force: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--list") args.list = true;
    else if (a === "--write") args.write = true;
    else if (a === "--force") args.force = true;
    else if (a === "--vault") args.vault = path.resolve(process.cwd(), argv[++i]);
    else if (!a.startsWith("--") && !args.id) args.id = a;
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return args;
}

/**
 * Reports whether the vault sits inside a git repo and whether it has
 * uncommitted .md changes. With git missing or outside a repo it returns
 * isRepo:false and passes harmlessly.
 */
function checkGitState(vaultDir) {
  const isRepoCheck = spawnSync(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    { cwd: vaultDir, encoding: "utf8" },
  );
  if (isRepoCheck.status !== 0) {
    return { isRepo: false, dirtyMdFiles: [] };
  }
  // Only .md inside the vault — other dirty files are unrelated to a migration.
  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--", "*.md"],
    { cwd: vaultDir, encoding: "utf8" },
  );
  if (status.status !== 0) {
    return { isRepo: true, dirtyMdFiles: [] };
  }
  const dirtyMdFiles = status.stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim()); // " M path" → "path"
  return { isRepo: true, dirtyMdFiles };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(`사용: pnpm vault:migrate <id> [options]

옵션:
  --list          등록된 migration 목록
  --vault <dir>   대상 vault (기본: docs/ontology)
  --write         dry-run 결과를 디스크에 기록
  --force         commit 안 된 Markdown 보호를 의식적으로 우회
  --help, -h      이 도움말`);
    return;
  }

  if (args.list || (!args.id && !args.list)) {
    const all = await listMigrations();
    if (all.length === 0) {
      console.log("[migrate-vault] 등록된 마이그레이션 없음.");
      return;
    }
    console.log("[migrate-vault] 등록된 마이그레이션:");
    for (const m of all) console.log(`  ${m.id}\n    ${m.description}`);
    if (!args.id) {
      console.log("\n사용: pnpm vault:migrate <id> [--write] [--vault <dir>]");
    }
    return;
  }

  const mod = await loadMigration(args.id);

  // Safety net for write mode when the vault is a git repo with uncommitted .md.
  // dry-run touches no disk, so it skips the check.
  if (args.write && !args.force) {
    const { isRepo, dirtyMdFiles } = checkGitState(args.vault);
    if (isRepo && dirtyMdFiles.length > 0) {
      console.error(
        `[migrate-vault] 거부: vault 안에 commit 안 된 .md 변경 ${dirtyMdFiles.length} 개 있음.`,
      );
      console.error(
        "  마이그레이션 결과와 사용자 변경이 섞이면 rollback 어려워집니다.",
      );
      console.error("  dirty 파일들:");
      for (const f of dirtyMdFiles.slice(0, 10)) console.error(`    ${f}`);
      if (dirtyMdFiles.length > 10) {
        console.error(`    ... 외 ${dirtyMdFiles.length - 10} 개`);
      }
      console.error("");
      console.error(
        "  먼저 commit 하거나 stash 해서 vault 를 clean 상태로 두고 재시도.",
      );
      console.error("  또는 의식적으로 강행하려면 --force 추가.");
      process.exit(1);
    }
  }

  const files = await walk(args.vault);
  const migrationFiles = [];
  for (const full of files) {
    migrationFiles.push({
      path: full,
      raw: await readFile(full, "utf8"),
      relativePath: path.relative(args.vault, full),
    });
  }
  // Vault-wide identity migrations must validate and allocate their complete
  // plan before a write begins. Existing per-file migrations need no context.
  const context =
    typeof mod.prepare === "function" ? await mod.prepare(migrationFiles) : undefined;

  let changedCount = 0;
  let inspectedCount = 0;
  const previews = [];

  for (const file of migrationFiles) {
    inspectedCount += 1;
    const result = await mod.migrate(file, context);
    if (!result || result.raw === file.raw) continue;
    changedCount += 1;
    if (args.write) {
      await writeFile(file.path, result.raw, "utf8");
    } else {
      previews.push({ file: path.relative(ROOT, file.path) });
    }
  }

  const tag = args.write ? "WRITE" : "DRY-RUN";
  console.log(
    `[migrate-vault:${tag}] ${args.id} — ${inspectedCount} 파일 / ${changedCount} 변경${
      args.write ? " (디스크에 기록됨)" : " (디스크에 변경 없음)"
    }`,
  );

  if (!args.write && previews.length > 0) {
    console.log(`\n변경 예정 파일 (${previews.length}):`);
    for (const p of previews.slice(0, 20)) console.log(`  ${p.file}`);
    if (previews.length > 20) console.log(`  ... 외 ${previews.length - 20} 개`);
    console.log("\n적용하려면: pnpm vault:migrate " + args.id + " --write");
  }
}

main().catch((err) => {
  console.error(`[migrate-vault] 실패: ${err.message}`);
  process.exit(1);
});
