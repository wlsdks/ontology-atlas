---
title: Third-party code and licenses
doc_type: runbook
status: current
area: architecture
---

# Third-party code and licenses

Follow this before you add a dependency, adapt code from somewhere else, or take
an asset you did not make. Ontology Atlas is MIT licensed and open source, so
everything it ships must be something we may redistribute, with the notice its
license asks for.

## What the gates do

- `pnpm licenses:check` judges every production package of the three shipped
  trees (the web export's npm packages, the MCP sidecar's npm packages, and the
  desktop app's Rust crates) against the allow-list below. It also refuses a
  malformed attribution marker or one whose source license is not on the
  snippet list.
- `pnpm notice:check` fails when [`NOTICE.md`](../../NOTICE.md) or
  `public/third-party-licenses.txt` no longer match those trees;
  `pnpm notice:build` regenerates both. The web export serves the second at
  `/third-party-licenses.txt`, and the desktop app bundles both.

Both run in pre-push and in PR CI whenever a manifest, a lockfile, the license
policy or the notice generator changes.

## Allowed licenses

| Kind | Licenses |
|---|---|
| Permissive | MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0 (also `WITH LLVM-exception`), Zlib, Unlicense, 0BSD, CC0-1.0, BlueOak-1.0.0, Python-2.0, Unicode-3.0 |
| Boundary, explained in `NOTICE.md` | LGPL-2.0, LGPL-2.1, LGPL-3.0, MPL-2.0, OFL-1.1 |
| Refused | everything else, including non-commercial (NC), share-alike (SA), Prosperity, GPL, AGPL, and no declared license |

A package that offers a choice, such as `MPL-2.0 OR Apache-2.0`, is used under
its most permissive permitted option, and that option's text is the one the
notice reproduces. When a package is refused, replace it. Record an exception
in `scripts/data/license-exceptions.json` only when the package can ship under
terms we meet; the entry names the ecosystem, the package, the exact license it
declares, and the reason. An exception lapses when the package changes license,
and one that excuses nothing fails the gate.

## Rules

1. Write shaders and simulation code ourselves.
2. Adapt a snippet only from an MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0,
   ISC, Zlib or Unlicense source. Put exactly
   `// Adapted from <url> (<SPDX>, © <holder>)` on the line above the adapted
   function, then run `pnpm notice:build`, which lists it in both notices.
   That comment is a required license marker, not a removable comment: the
   comment-bytes ratchet does not count it, and deleting it breaches the
   source's license.
3. Never paste from lygia, Shadertoy (even code marked MIT), Stack Overflow,
   iquilezles.org, Gephi, or any source without a license.
4. Do not reproduce Microsoft's patented ordered-bundle or layered-graph
   edge-bundling pipelines (US8933937B2, US9443334B2). Use Holten's
   hierarchical edge bundling or force-directed edge bundling (FDEB), or get a
   legal check first.
5. Before adding a graph or GL dependency, check its whole dependency tree:
   install it on a branch and run `pnpm licenses:check`. Use
   `@cosmos.gl/graph`, never `@cosmograph/*`, which is CC-BY-NC.
6. Run `pnpm notice:build` whenever production dependencies change, and commit
   both generated files.
7. Do not copy Khronos specification text or use the WebGL logo.
8. Check the license of every asset taken from three.js `examples/` (models,
   textures, fonts, environment maps); many are not MIT. Ship one only under a
   permitted license, and name its source, license and holder in the
   hand-written part of `NOTICE.md` (`PREAMBLE` in `scripts/build-notice.mjs`).
