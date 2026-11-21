/** The macOS app: readiness, ACP registry, performance budgets, runtime split, and the native vault bridge. */

/**
 * A panic in a Tauri sync command runs on the main thread and aborts the app, so `unwrap`, slice
 * indexing and `panic!` in non-test Rust are findings (`[workspace.lints.clippy]` in
 * `src-tauri/Cargo.toml`). The sidecar is built first for the same reason as `test:desktop:bridge`.
 * `windows-beta-check.yml` runs the clippy command on Windows and both commands on macOS; the Linux
 * gates runner cannot compile the crate, so the CI planner keeps this command out of its lanes.
 */
export const RUST_LINT_COMMAND =
  'pnpm mcp:build-binary && cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --all-targets -- -D warnings && cargo fmt --manifest-path src-tauri/Cargo.toml --all --check';

export const rules = [
  {
    order: 310,
    command: 'pnpm test:desktop:check',
    reason: 'desktop readiness checker contract changed',
    matches: [
      /^scripts\/desktop\/check-desktop-readiness\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop\/desktop-doctor\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop\/desktop-smoke\.(?:mjs|test\.mjs)$/,
      /^scripts\/verify-macos\/verify-macos-app-launch(?:\.[^/]+)?\.mjs$/,
      /^scripts\/lib\/verify-macos\/[^/]+\.mjs$/,
      /^src-tauri\/src\/webview_verify\/[^/]+\.js$/,
      /^scripts\/verify-macos\/verify-macos-dmg\.mjs$/,
      /^scripts\/verify-macos\/verify-macos-install-smoke\.mjs$/,
      /^scripts\/lib\/macos-artifact\/macos-dmg-layout\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/desktop-release\/redact-command\.(?:mjs|test\.mjs)$/,
      /^scripts\/download\/check-macos-download-release\.mjs$/,
      /^scripts\/desktop-release\/build-updater-manifest\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-release\/check-macos-release-status\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-release\/release-status\/[^/]+\.mjs$/,
      /^scripts\/download\/stage-macos-release-assets\.(?:mjs|test\.mjs)$/,
      /^scripts\/download\/gateway-capture\/[^/]+\.mjs$/,
      /^\.github\/workflows\/deploy-pages\.yml$/,
    ],
  },
  {
    order: 330,
    command: 'pnpm acp:registry:check',
    reason: 'ACP launch identity, isolation boundary, or release wiring changed',
    matches: [
      /^scripts\/registry-snapshots\/build-acp-registry\.(?:mjs|test\.mjs)$/,
      /^src-tauri\/src\/acp-registry\.json$/,
      /^src-tauri\/src\/acp\.rs$/,
      /^src-tauri\/src\/acp\/.+\.rs$/,
      /^\.github\/workflows\/release-macos\.yml$/,
    ],
  },
  {
    order: 340,
    // The no-build half of this budget is tests/contract/vault-data/bundled-vault-budget.contract.test.ts.
    command: 'pnpm build && pnpm desktop:perf',
    reason: 'bundled vault data or the desktop performance budget surface changed — re-measure the static budgets',
    matches: [
      /^src\/entities\/docs-vault\/data\//,
      /^scripts\/docs-vault\/(?:build-docs-vault\.mjs|generator\/[^/]+\.mjs)$/,
      /^scripts\/desktop\/check-desktop-performance\.(?:mjs|test\.mjs)$/,
      /^src\/entities\/docs-vault\/lib\/bundled-vault\/static-(?:vault-source|headings)\.ts$/,
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
  // `cargo test` needs the gitignored MCP sidecar binary; `test:desktop:bridge` builds it first.
  {
    order: 370,
    command: 'pnpm test:desktop:bridge',
    reason: 'native macOS vault bridge changed',
    matches: [
      /^src\/shared\/lib\/vault-folder\/tauri-vault-fs(?:\.test)?\.ts$/,
      /^src-tauri\/src\/(?:lib\.rs|acp\/(?:runtime|session)\.rs|(?:app_shell|project_source|vault|webview_verify)\/[^/]+\.rs|vault\/(?:index\/rows|temporary_files\/[^/]+)\.rs)$/,
      /^src-tauri\/Cargo\.(?:toml|lock)$/,
    ],
  },
  {
    order: 375,
    command: RUST_LINT_COMMAND,
    reason: 'Rust source or Cargo manifest changed — a panic in a Tauri command aborts the app',
    matches: [
      /^src-tauri\/(?:src|crates)\/.+\.rs$/,
      /^src-tauri\/build\.rs$/,
      /^src-tauri\/(?:Cargo\.(?:toml|lock)|clippy\.toml)$/,
      /^rust-toolchain\.toml$/,
      /^src-tauri\/crates\/[^/]+\/(?:Cargo\.toml|tests\/.+\.rs)$/,
    ],
  },
  {
    order: 380,
    command: 'pnpm desktop:check',
    reason: 'macOS desktop readiness inputs changed',
    matches: [
      /^scripts\/desktop\/check-desktop-readiness\.(?:mjs|test\.mjs)$/,
      /^scripts\/quality\/source-language\/(?:inventory|source-paths)\.mjs$/,
      /^scripts\/desktop\/desktop-doctor\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop\/desktop-smoke\.(?:mjs|test\.mjs)$/,
      /^scripts\/verify-macos\/verify-macos-dmg\.mjs$/,
      /^scripts\/verify-macos\/verify-macos-install-smoke\.mjs$/,
      /^scripts\/lib\/macos-artifact\/macos-dmg-layout\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/desktop-release\/redact-command\.(?:mjs|test\.mjs)$/,
      /^scripts\/download\/check-macos-download-release\.mjs$/,
      /^scripts\/download\/stage-macos-release-assets\.(?:mjs|test\.mjs)$/,
      /^docs\/DESKTOP-MACOS\.md$/,
      /^src\/views\/docs-vault\/lib\/persistence(?:\.test)?\.ts$/,
      /^src\/entities\/vault-session\/model\/local-vault\/(?:use-vault-choice|vault-sidecars)\.ts$/,
      /^src\/shared\/lib\/vault-folder\/tauri-vault-fs(?:\.test)?\.ts$/,
      /^src\/views\/root-entry\/ui\/RootEntryPage(?:\.test)?\.tsx$/,
      /^src\/views\/docs-vault\/ui\/DocsVault(?:Page|Header|DocumentPane|Sidebar)\.tsx$/,
      /^src\/views\/docs-vault\/model\/[^/]+\.tsx?$/,
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
    ['scripts/brand/build-brand-assets.mjs', 'scripts/brand/build-brand-raster.test.mjs'],
    ['scripts/brand/build-brand-raster.mjs', 'scripts/brand/build-brand-raster.test.mjs'],
    ['scripts/brand/brand-raster-page.html', 'scripts/brand/build-brand-raster.test.mjs'],
    ['scripts/brand/build-traveler-sprites.mjs', 'scripts/brand/build-brand-raster.test.mjs'],
    ['scripts/desktop/check-desktop-readiness.mjs', 'scripts/desktop/check-desktop-readiness.test.mjs'],
    ['scripts/desktop/check-desktop-readiness.test.mjs', 'scripts/desktop/check-desktop-readiness.test.mjs'],
    ['scripts/desktop/desktop-doctor.mjs', 'scripts/desktop/desktop-doctor.test.mjs'],
    ['scripts/desktop/desktop-doctor.test.mjs', 'scripts/desktop/desktop-doctor.test.mjs'],
    ['scripts/desktop/desktop-smoke.mjs', 'scripts/desktop/desktop-smoke.test.mjs'],
    ['scripts/desktop/desktop-smoke.test.mjs', 'scripts/desktop/desktop-smoke.test.mjs'],
    ['scripts/lib/macos-artifact/macos-dmg-layout.mjs', 'scripts/lib/macos-artifact/macos-dmg-layout.test.mjs'],
    ['scripts/lib/macos-artifact/macos-dmg-layout.test.mjs', 'scripts/lib/macos-artifact/macos-dmg-layout.test.mjs'],
    ['scripts/lib/desktop-release/redact-command.mjs', 'scripts/lib/desktop-release/redact-command.test.mjs'],
    ['scripts/lib/desktop-release/redact-command.test.mjs', 'scripts/lib/desktop-release/redact-command.test.mjs'],
    ['scripts/download/gateway-capture/capture-context.mjs', 'scripts/download/gateway-capture/gateway-capture.test.mjs'],
    ['scripts/download/gateway-capture/fake-filesystem.mjs', 'scripts/download/gateway-capture/gateway-capture.test.mjs'],
    ['scripts/download/gateway-capture/native-bridge.mjs', 'scripts/download/gateway-capture/gateway-capture.test.mjs'],
    ['scripts/download/gateway-capture/repo-history.mjs', 'scripts/download/gateway-capture/gateway-capture.test.mjs'],
    ['scripts/download/gateway-capture/sample-library.mjs', 'scripts/download/gateway-capture/gateway-capture.test.mjs'],
    ['scripts/download/gateway-capture/gateway-capture.test.mjs', 'scripts/download/gateway-capture/gateway-capture.test.mjs'],
  ],
};
