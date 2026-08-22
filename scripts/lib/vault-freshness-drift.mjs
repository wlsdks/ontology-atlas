// R+ — PR vault freshness bot (⑦). Pure drift computation: given the PR's
// changed files and the vault's docs, find capability/element nodes whose
// `path:`/`elements:` frontmatter references a changed file, but whose own
// `.md` was NOT touched in the same PR — i.e. the code moved on and the
// vault memory of it risks going stale.
//
// Same path/elements: frontmatter convention as `mcp/src/detect-drift.mjs`
// (fs-existence direction) and `cli/src/lib/preflight-match.mjs` (git-staged
// direction, same idea one commit earlier). This copy is scoped to
// scripts/ — repo-internal tooling, not a published package — so it is a
// small intentional mirror rather than a cross-package import; if the
// path/elements matching rules change, check those two siblings too.

const ONTOLOGY_SLUG_PREFIXES = ["capabilities/", "domains/", "elements/", "documents/"];

function looksLikePath(value) {
  return (
    value.includes("/") ||
    value.endsWith(".ts") ||
    value.endsWith(".js") ||
    value.endsWith(".mjs") ||
    value.endsWith(".tsx") ||
    value.endsWith(".json")
  );
}

function isOntologySlug(value) {
  return ONTOLOGY_SLUG_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function normalizePath(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

function pathMatches(changedFile, entryPath) {
  const changed = normalizePath(changedFile);
  const entry = normalizePath(entryPath);
  if (!changed || !entry) return false;
  return changed === entry || changed.startsWith(`${entry}/`);
}

/**
 * Which changed files are the vault's OWN `.md` docs (already updated in this
 * PR), mapped to their slug — `vaultDir/capabilities/foo.md` → `capabilities/foo`.
 *
 * @param {string[]} changedFiles  repo-relative changed file paths
 * @param {string} vaultDir  repo-relative vault root, e.g. "docs/ontology"
 * @returns {Set<string>}
 */
export function computeTouchedNodeSlugs(changedFiles, vaultDir) {
  const prefix = `${normalizePath(vaultDir)}/`;
  const touched = new Set();
  for (const raw of changedFiles || []) {
    const file = normalizePath(raw);
    if (!file.startsWith(prefix) || !file.endsWith(".md")) continue;
    touched.add(file.slice(prefix.length, -".md".length));
  }
  return touched;
}

/**
 * @param {Array<{slug: string, frontmatter: Record<string, unknown>}>} docs
 * @param {string[]} changedFiles  repo-relative changed files this PR touches
 * @returns {Array<{slug, kind, title, domain, matchedFiles: string[]}>}
 */
export function matchChangedFilesToVaultNodes(docs, changedFiles) {
  const changed = (changedFiles || []).map(normalizePath).filter(Boolean);
  if (changed.length === 0 || !Array.isArray(docs)) return [];

  const matches = [];
  for (const doc of docs) {
    const fm = doc?.frontmatter ?? {};
    const kind = typeof fm.kind === "string" ? fm.kind.trim() : "";
    if (!kind) continue;

    const matchedFiles = new Set();

    if (typeof fm.path === "string" && fm.path.trim()) {
      for (const cf of changed) {
        if (pathMatches(cf, fm.path)) matchedFiles.add(cf);
      }
    }

    if (Array.isArray(fm.elements)) {
      for (const el of fm.elements) {
        if (typeof el !== "string") continue;
        const entry = el.trim();
        if (!entry || !looksLikePath(entry) || isOntologySlug(entry)) continue;
        for (const cf of changed) {
          if (pathMatches(cf, entry)) matchedFiles.add(cf);
        }
      }
    }

    if (matchedFiles.size > 0) {
      matches.push({
        slug: String(doc.slug ?? "").trim(),
        kind,
        title:
          (typeof fm.title === "string" && fm.title.trim()) ||
          (typeof fm.name === "string" && fm.name.trim()) ||
          String(doc.slug ?? ""),
        domain: typeof fm.domain === "string" ? fm.domain : "",
        matchedFiles: [...matchedFiles].sort(),
      });
    }
  }

  matches.sort((a, b) => a.slug.localeCompare(b.slug));
  return matches;
}

/**
 * Full freshness-drift computation for a PR: nodes whose referenced source
 * changed in this PR, but whose own `.md` did not.
 *
 * @param {object} args
 * @param {Array<{slug, frontmatter}>} args.docs
 * @param {string[]} args.changedFiles
 * @param {string} args.vaultDir
 * @returns {{ staleNodes: Array, touchedNodeSlugs: string[], matchedTotal: number }}
 */
export function computeVaultFreshnessDrift({ docs, changedFiles, vaultDir }) {
  const touchedNodeSlugs = computeTouchedNodeSlugs(changedFiles, vaultDir);
  const vaultPrefix = `${normalizePath(vaultDir)}/`;
  // Only match non-vault-doc changed files against path:/elements: — the
  // vault's own .md files are not "source" the frontmatter would reference.
  const codeChanges = (changedFiles || [])
    .map(normalizePath)
    .filter((f) => f && !f.startsWith(vaultPrefix));

  const matches = matchChangedFilesToVaultNodes(docs, codeChanges);
  const staleNodes = matches.filter((m) => !touchedNodeSlugs.has(m.slug));

  return {
    staleNodes,
    touchedNodeSlugs: [...touchedNodeSlugs].sort(),
    matchedTotal: matches.length,
  };
}

// Stable marker so the Action can find-and-update its own comment instead of
// spamming a new one on every push (spec: update the existing comment, never
// spam).
export const FRESHNESS_COMMENT_MARKER = "<!-- ontology-atlas-vault-freshness -->";

/**
 * Builds the PR comment body for a set of stale nodes. Returns `null` when
 * there are none — the caller (Action) should then delete any previous
 * comment instead of posting an empty one (spec: post nothing when nothing was
 * detected).
 *
 * @param {Array} staleNodes  from computeVaultFreshnessDrift().staleNodes
 * @returns {string | null}
 */
export function buildFreshnessCommentMarkdown(staleNodes) {
  if (!Array.isArray(staleNodes) || staleNodes.length === 0) return null;

  const rows = staleNodes
    .map(
      (node) =>
        `| \`${node.slug}\` | ${node.kind} | ${node.matchedFiles.map((f) => `\`${f}\``).join(", ")} |`,
    )
    .join("\n");

  const followUps = staleNodes
    .map((node) => `- \`ontology-atlas node ${node.slug}\``)
    .join("\n");

  return [
    FRESHNESS_COMMENT_MARKER,
    `### Vault freshness — ${staleNodes.length} node(s) may go stale`,
    "",
    "This PR changes source files referenced by these vault nodes, but the nodes' own `.md` was not updated in the same PR:",
    "",
    "| Node | Kind | Changed files |",
    "|---|---|---|",
    rows,
    "",
    "Review and update if the vault description is now out of date:",
    "",
    followUps,
    "",
    "_This comment updates automatically as the PR changes. Editing the referenced node's `.md` removes it from this list on the next push._",
  ].join("\n");
}
