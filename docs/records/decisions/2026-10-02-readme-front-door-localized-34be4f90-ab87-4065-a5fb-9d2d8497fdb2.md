---
id: 34be4f90-ab87-4065-a5fb-9d2d8497fdb2
date: 2026-10-02
---
## 2026-10-02 — The README is a short front door, in more than one language

**Why**: the owner asked for Korean, Japanese and Chinese READMEs behind a switcher, English as the main file, and said the README is still too long to read. Measured: 225 lines, 2,036 words, eleven captures.
**Prior**: overturns 2026-09-11 and 2026-08-03 README records where they keep every capture and mandated fact in the body; UID/slug/path, no node cap, local-first, no npm and the unsigned Windows warning stay, fan-out and bridge rules move behind links. Amends 2026-08-23 (102): `README.ko.md`, `README.ja.md`, `README.zh.md` and `README.md`'s switcher labels join its locale data.
**Decision**: `README.md` is 117 lines: switcher, hero, download row, five "What it does" bullets, three-step quick start, then short linked sections; the command table stays folded because `pnpm dev-checks:check` reads it. `README.ko.md` follows it section for section. `pnpm docs:language` exempts the three paths exactly and switcher links by target and an eight-character label.
**Dissent**: a reader sent to a link can misread a packet bound as a graph cap; three translations will drift and nothing checks them yet.
**Falsifier**: a fresh reader who cannot say from the README what Atlas gives their agent, where its files live, or whether Windows is signed; or a localized README behind `README.md` after an English change.
**Owner**: Stark
