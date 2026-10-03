---
id: d7a8ee52-8053-4758-9832-70aa7dbc7c02
date: 2026-10-03
---
## 2026-10-03 — macOS releases ship Apple Silicon only

**Why**: the owner reports every Mac in use is Apple Silicon; GitHub counts show the x64 DMG downloaded 2-4 times per release from v1.2.3 to v1.4.0, about the CI verifier's own fetches, and the x64 updater archive fetched once each for v1.2.5 and v1.3.0, while the Intel lane held a macos-15-intel runner 25-30 minutes per release (v1.0.5 x64: 28m50s).
**Prior**: overturns the two-architecture macOS release contract (aarch64 and x64 DMGs plus a darwin-x86_64 updater entry, required by `desktop:verify-download` and `build-updater-manifest.mjs`); `pnpm decisions:find intel x64 universal` finds no fragment that chose Intel. 2026-08-01 "Ship Windows x64 as a public unsigned beta" stands.
**Decision**: from v1.6.0 releases build, sign, notarize and publish only the aarch64 DMG and updater archive; `latest.json` lists exactly `darwin-aarch64`. v1.5.0 is the last Intel build and stays on its GitHub Release; it is not re-cut. Release checks require the aarch64 DMG and fail without it, and accept an x64 DMG only on a release up to v1.5.0. The Windows x64 beta continues.
**Dissent**: with tauri-plugin-updater 2.10.1 a manifest without `darwin-x86_64` fails every check with `TargetsNotFound` before the version comparison. The automatic check swallows it, but a manual "Check for updates" on an Intel build shows the false "Couldn't fetch the update information" message every time; Intel users still on v1.4.x never reach v1.5.0 once v1.6.0's manifest is hosted; and an Intel build installed under Rosetta on Apple Silicon is stuck the same way.
**Falsifier**: downloads of the v1.5.0 x64 DMG or updater archive rise above the CI floor.
**Owner**: Stark
