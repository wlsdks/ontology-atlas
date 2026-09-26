/** The macOS app: readiness, ACP registry, performance budgets, runtime split, and the native vault bridge. */

export const rules = [
  {
    order: 310,
    command: 'pnpm test:desktop:check',
    reason: 'desktop readiness checker contract changed',
    matches: [
      /^scripts\/check-desktop-readiness\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-doctor\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-smoke\.(?:mjs|test\.mjs)$/,
      /^scripts\/verify-macos-app-launch(?:\.[^/]+)?\.mjs$/,
      /^scripts\/lib\/verify-macos\/[^/]+\.mjs$/,
      /^scripts\/verify-macos-dmg\.mjs$/,
      /^scripts\/verify-macos-install-smoke\.mjs$/,
      /^scripts\/lib\/macos-dmg-layout\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/redact-command\.(?:mjs|test\.mjs)$/,
      /^scripts\/check-macos-download-release\.mjs$/,
      /^scripts\/build-updater-manifest\.(?:mjs|test\.mjs)$/,
      /^scripts\/stage-macos-release-assets\.(?:mjs|test\.mjs)$/,
      /^\.github\/workflows\/deploy-pages\.yml$/,
    ],
  },
  {
    order: 330,
    command: 'pnpm acp:registry:check',
    reason: 'ACP launch identity, isolation boundary, or release wiring changed',
    matches: [
      /^scripts\/build-acp-registry\.(?:mjs|test\.mjs)$/,
      /^src-tauri\/src\/acp-registry\.json$/,
      /^src-tauri\/src\/acp\.rs$/,
      /^\.github\/workflows\/release-macos\.yml$/,
    ],
  },
  {
    order: 340,
    // The hard desktop performance budgets used to run only in
    // `desktop:release-preflight`, and in the meantime the bundled vault data grew
    // until both budgets were silently exceeded (found during 2026-08-19 release prep:
    // 1.71MiB against 1.50, 8.42MiB against 8.00). When a path that moves the budget
    // changes — the bundled data JSON, the generator that produces it, the static
    // import site, or the budget check itself — the measurement is suggested here. The
    // half that runs constantly without a build is
    // `tests/contract/bundled-vault-budget.contract.test.ts`.
    command: 'pnpm build && pnpm desktop:perf',
    reason: 'bundled vault data or the desktop performance budget surface changed — re-measure the static budgets',
    matches: [
      /^src\/entities\/docs-vault\/data\//,
      /^scripts\/build-docs-vault\.mjs$/,
      /^scripts\/check-desktop-performance\.(?:mjs|test\.mjs)$/,
      /^src\/entities\/docs-vault\/lib\/static-(?:vault-source|headings)\.ts$/,
    ],
  },
  {
    order: 350,
    command: 'pnpm test:desktop:runtime',
    reason: 'hosted-vs-installed desktop runtime split changed',
    matches: [
      /^src\/views\/docs-vault\/lib\/persistence(?:\.test)?\.ts$/,
      /^src\/views\/root-entry\/ui\/RootEntryPage(?:\.test)?\.tsx$/,
      /^src\/widgets\/app-settings-menu\/ui\/AppSettingsMenu(?:\.test)?\.tsx$/,
    ],
  },
  /*
   * The bridge check compiles the Tauri crate, and `tauri.conf.json` names a sidecar
   * (`src-tauri/binaries/ontology-atlas-mcp-<triple>`) that `.gitignore` excludes. In a
   * fresh checkout or worktree `cargo test` therefore dies in the build script with
   * "resource path ... doesn't exist" — a missing prerequisite wearing the costume of a
   * defect, and the only place the prerequisite was written down was one line of
   * `docs/DEVELOPMENT-CHECKS.md`. The script now builds the sidecar itself (2.6 s when
   * it is already current), so the recommendation runs wherever it is given.
   */
  {
    order: 370,
    command: 'pnpm test:desktop:bridge',
    reason: 'native macOS vault bridge changed',
    matches: [
      /^src\/shared\/lib\/tauri-vault-fs(?:\.test)?\.ts$/,
      /^src-tauri\/src\/lib\.rs$/,
      /^src-tauri\/Cargo\.(?:toml|lock)$/,
    ],
  },
  {
    order: 380,
    command: 'pnpm desktop:check',
    reason: 'macOS desktop readiness inputs changed',
    matches: [
      /^scripts\/check-desktop-readiness\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-doctor\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-smoke\.(?:mjs|test\.mjs)$/,
      /^scripts\/verify-macos-dmg\.mjs$/,
      /^scripts\/verify-macos-install-smoke\.mjs$/,
      /^scripts\/lib\/macos-dmg-layout\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/redact-command\.(?:mjs|test\.mjs)$/,
      /^scripts\/check-macos-download-release\.mjs$/,
      /^scripts\/stage-macos-release-assets\.(?:mjs|test\.mjs)$/,
      /^docs\/DESKTOP-MACOS\.md$/,
      /^src\/views\/docs-vault\/lib\/persistence(?:\.test)?\.ts$/,
      /^src\/shared\/lib\/tauri-vault-fs(?:\.test)?\.ts$/,
      /^src\/views\/root-entry\/ui\/RootEntryPage(?:\.test)?\.tsx$/,
      /^src\/views\/docs-vault\/ui\/DocsVaultPage\.tsx$/,
      /^src\/widgets\/app-settings-menu\/ui\/AppSettingsMenu(?:\.test)?\.tsx$/,
      /^\.github\/workflows\/deploy-pages\.yml$/,
      /^src-tauri\//,
      /^package\.json$/,
      /^next\.config\.ts$/,
    ],
  },
];

export const directTests = {
  script: [
    ['scripts/check-desktop-readiness.mjs', 'scripts/check-desktop-readiness.test.mjs'],
    ['scripts/check-desktop-readiness.test.mjs', 'scripts/check-desktop-readiness.test.mjs'],
    ['scripts/desktop-doctor.mjs', 'scripts/desktop-doctor.test.mjs'],
    ['scripts/desktop-doctor.test.mjs', 'scripts/desktop-doctor.test.mjs'],
    ['scripts/desktop-smoke.mjs', 'scripts/desktop-smoke.test.mjs'],
    ['scripts/desktop-smoke.test.mjs', 'scripts/desktop-smoke.test.mjs'],
    ['scripts/lib/macos-dmg-layout.mjs', 'scripts/lib/macos-dmg-layout.test.mjs'],
    ['scripts/lib/macos-dmg-layout.test.mjs', 'scripts/lib/macos-dmg-layout.test.mjs'],
    ['scripts/lib/redact-command.mjs', 'scripts/lib/redact-command.test.mjs'],
    ['scripts/lib/redact-command.test.mjs', 'scripts/lib/redact-command.test.mjs'],
  ],
};
