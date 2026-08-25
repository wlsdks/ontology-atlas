#!/usr/bin/env node
/**
 * Builds `NOTICE.md`, the third-party attribution the shipped app owes its users.
 *
 * **Why this file has to exist.** The installed `.app` is not only our code. Three
 * things inside it carry an obligation that MIT does not:
 *
 * 1. `binaries/ontology-atlas-mcp` is produced by `bun build --compile`, and Bun
 *    statically links JavaScriptCore and WebKit, which are LGPL-2.1. Static linking
 *    is the case LGPL-2.1 section 6 addresses: a user must be able to relink the
 *    application against their own build of the library. `otool -L` on that binary
 *    lists only macOS system libraries, which confirms the engine is baked in rather
 *    than borrowed from the OS.
 * 2. `PretendardVariable` ships as a woff2 in the static export under OFL-1.1, which
 *    requires the licence text to travel with the font. The npm package does not
 *    carry that text, so this file does.
 * 3. Five Rust crates are MPL-2.0. We do not modify them, so the only duty is saying
 *    where their source lives.
 *
 * None of the three changes our own licence. LGPL, OFL and MPL are all boundary
 * licences: they bind the component, not the program that links it. `LICENSE` stays
 * MIT. What was missing was the notice, not the right to ship.
 *
 * **Why a generator rather than a hand-written file.** The dependency inventory is
 * 564 Rust crates plus the production npm tree, and a hand-maintained list silently
 * rots the first time someone adds a dependency. `AGENTS.md` requires documentation
 * checks to compare machine-derived facts rather than pinning prose, so the inventory
 * is derived from `cargo metadata` and `pnpm licenses` on every run and the prose
 * above it is the only part a human writes. `--check` regenerates and diffs, which is
 * what CI and the release preflight call.
 *
 * Output is deterministic: every list is sorted, and no timestamp or version of this
 * repository is embedded, so an unchanged dependency tree produces a byte-identical
 * file.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOTICE_PATH = path.join(REPO_ROOT, "NOTICE.md");
const CARGO_MANIFEST = path.join(REPO_ROOT, "src-tauri", "Cargo.toml");

/**
 * Licences that bind the component rather than the program linking it. Each one is
 * called out by name in the prose sections above the inventory, because a reader
 * scanning a 500-entry table will not notice them otherwise.
 */
export const BOUNDARY_LICENSE_MARKERS = ["MPL", "LGPL", "GPL", "EPL", "CDDL"];

/**
 * SPDX strings appear in Cargo metadata in several spellings for the same choice
 * (`MIT/Apache-2.0`, `MIT OR Apache-2.0`, `Apache-2.0 OR MIT`). Normalising them keeps
 * the inventory from listing one licence three times.
 */
export function normalizeLicense(raw) {
  if (!raw) return "UNKNOWN";
  const spaced = raw.replace(/\//g, " OR ");
  const parts = spaced
    .split(/\s+OR\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return spaced.trim();
  return [...parts].sort().join(" OR ");
}

/** True when a licence obliges us to say something beyond attribution. */
export function isBoundaryLicense(license) {
  const upper = license.toUpperCase();
  return BOUNDARY_LICENSE_MARKERS.some((marker) => upper.includes(marker));
}

function groupByLicense(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const license = normalizeLicense(entry.license);
    if (!groups.has(license)) groups.set(license, []);
    groups.get(license).push(entry.name);
  }
  return [...groups.entries()]
    .map(([license, names]) => ({ license, names: [...new Set(names)].sort() }))
    .sort((a, b) => a.license.localeCompare(b.license));
}

export function collectRustCrates() {
  const raw = execFileSync(
    "cargo",
    ["metadata", "--manifest-path", CARGO_MANIFEST, "--format-version", "1", "--all-features"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const meta = JSON.parse(raw);
  return meta.packages
    .filter((pkg) => pkg.name !== "ontology-atlas")
    .map((pkg) => ({ name: pkg.name, license: pkg.license ?? "UNKNOWN" }));
}

export function collectNpmPackages() {
  const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw);
  const entries = [];
  for (const [license, packages] of Object.entries(parsed)) {
    for (const pkg of packages) entries.push({ name: pkg.name, license });
  }
  return entries;
}

function renderGroups(groups) {
  const lines = [];
  for (const { license, names } of groups) {
    lines.push(`### ${license} (${names.length})`);
    lines.push("");
    lines.push(names.map((name) => `\`${name}\``).join(", "));
    lines.push("");
  }
  return lines.join("\n");
}

/** The hand-written part. Everything below the inventory heading is generated. */
const PREAMBLE = `# Third-party notices

Ontology Atlas is licensed under the MIT License; see [\`LICENSE\`](./LICENSE).

This file lists third-party components distributed inside the released application
and the notices they require. Listing a component here does not place Ontology
Atlas under that component's license — the licenses below bind the component, not
the program that links it.

Scope: the macOS \`.app\` and Windows installer published on the releases page,
which contain the static web export, the \`ontology-atlas\` application binary, and
the \`ontology-atlas-mcp\` sidecar binary.

---

## JavaScriptCore and WebKit (LGPL-2.1)

The \`ontology-atlas-mcp\` sidecar is compiled with [Bun](https://bun.sh) using
\`bun build --compile\`. Bun statically links JavaScriptCore and WebKit, which are
licensed under the GNU Lesser General Public License, version 2.1.

Because the linking is static rather than dynamic, LGPL-2.1 section 6 applies: a
recipient must be able to modify the library and relink the application against
their modified version. That is possible here, and this is how:

- The WebKit source Bun links is published at <https://github.com/oven-sh/webkit>,
  pinned by \`WEBKIT_VERSION\` in Bun's build scripts. Bun documents the relink
  procedure in its [\`LICENSE.md\`](https://github.com/oven-sh/bun/blob/main/LICENSE.md).
- The sidecar's own source is this repository's \`mcp/\` directory, published under
  the MIT License with no additional restriction.
- The sidecar is rebuilt from that source by \`pnpm mcp:build-binary\`, which runs
  \`bun build --compile\`. Substituting a Bun built against a modified WebKit
  reproduces the sidecar with the modified library.

No part of JavaScriptCore or WebKit was modified for this distribution.

## Bun runtime (MIT)

The compiled sidecar embeds the Bun runtime, which is MIT licensed, together with
the libraries Bun statically links. Bun's complete third-party inventory, including
BoringSSL, brotli, libarchive, lol-html, ls-hpack, mimalloc, tinycc, zlib and
zstd, is published in its [\`LICENSE.md\`](https://github.com/oven-sh/bun/blob/main/LICENSE.md).

## Pretendard (SIL Open Font License 1.1)

The static export ships \`PretendardVariable\` as a woff2 font file. Pretendard is
copyright (c) 2021 Kil Hyung-jin, released under the SIL Open Font License 1.1.
Source: <https://github.com/orioncactus/pretendard>.

OFL-1.1 requires the license to accompany the font, and the npm package does not
carry the text, so it is reproduced in full below.

<details>
<summary>SIL Open Font License, Version 1.1</summary>

\`\`\`
Copyright (c) 2021, Kil Hyung-jin (https://github.com/orioncactus/pretendard),
with Reserved Font Name Pretendard.

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://scripts.sil.org/OFL

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
\`\`\`

</details>

## Mozilla Public License 2.0 components

The application binary links these Rust crates, which are licensed under MPL-2.0:
\`cssparser\`, \`cssparser-macros\`, \`dtoa-short\`, \`option-ext\` and \`selectors\`.

None of them were modified. MPL-2.0 is a file-level license: it requires that the
source of the covered files stays available, which it does at the crates' published
repositories reachable from <https://crates.io>. It places no condition on the rest
of this application.

## Apache License 2.0 components

Several dependencies are licensed under the Apache License 2.0, which requires that
any NOTICE file distributed by those projects be passed along. Those projects ship
their notices inside their own published packages; this file records their inclusion
and the license under which they are used. The Apache License 2.0 text is available
at <https://www.apache.org/licenses/LICENSE-2.0>.

## Dual-licensed components

Where a dependency offers a choice of licenses, Ontology Atlas takes the permissive
option. For \`r-efi\`, offered as \`MIT OR Apache-2.0 OR LGPL-2.1-or-later\`, the MIT
option is elected, so no LGPL obligation arises from that crate.

---

# Dependency inventory

Generated by \`pnpm notice:build\`. Do not edit below this line by hand.
`;

export const INVENTORY_MARKER = "# Dependency inventory";

export function buildNotice({ rustCrates, npmPackages }) {
  const sections = [
    PREAMBLE.trimEnd(),
    "",
    `## Rust crates (${rustCrates.length})`,
    "",
    "Linked into the `ontology-atlas` application binary.",
    "",
    renderGroups(groupByLicense(rustCrates)).trimEnd(),
    "",
    `## npm packages (${npmPackages.length})`,
    "",
    "Present in the production dependency tree that builds the static web export.",
    "",
    renderGroups(groupByLicense(npmPackages)).trimEnd(),
    "",
  ];
  return `${sections.join("\n")}\n`;
}

function main(argv) {
  const check = argv.includes("--check");
  const rustCrates = collectRustCrates();
  const npmPackages = collectNpmPackages();
  const next = buildNotice({ rustCrates, npmPackages });

  if (check) {
    const current = fs.existsSync(NOTICE_PATH) ? fs.readFileSync(NOTICE_PATH, "utf8") : "";
    if (current !== next) {
      console.error(
        "[notice] NOTICE.md is stale. The dependency tree changed without regenerating it.\n" +
          "         Run: pnpm notice:build",
      );
      process.exit(1);
    }
    console.log(
      `[notice] NOTICE.md current — ${rustCrates.length} crates, ${npmPackages.length} npm packages.`,
    );
    return;
  }

  fs.writeFileSync(NOTICE_PATH, next);
  console.log(
    `[notice] wrote NOTICE.md — ${rustCrates.length} crates, ${npmPackages.length} npm packages.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}
