---
id: d7a8ee52-8053-4758-9832-70aa7dbc7c02
date: 2026-10-03
---
## 2026-10-03 — macOS releases ship Apple Silicon only

**Why**: the owner reports every Mac in use is Apple Silicon; the Intel lane held a macos-15-intel runner 25-30 minutes per release (v1.0.5 x64: 28m50s) and doubled the macOS admission surface for no named visitor.
**Prior**: overturns the two-architecture macOS release contract (aarch64 and x64 DMGs plus a darwin-x86_64 updater entry, required by `desktop:verify-download` and `build-updater-manifest.mjs`); `pnpm decisions:find intel x64 universal` finds no fragment that chose Intel. 2026-08-01 "Ship Windows x64 as a public unsigned beta" stands.
**Decision**: from v1.6.0 releases build, sign, notarize and publish only the aarch64 DMG and updater archive; `latest.json` lists only `darwin-aarch64`. Intel Macs stay on v1.5.0, whose DMG stays on its GitHub Release, with no updater path. Release checks require the aarch64 DMG and fail without it; an older release's x64 DMG is tolerated, never required. The Windows x64 beta continues.
**Dissent**: an Intel user on v1.5.0 is told nothing; the updater just reports no update.
**Falsifier**: an Intel Mac user asks for a build, or download analytics show Intel Mac visitors.
**Owner**: Stark
