#!/usr/bin/env node
/**
 * Builds `NOTICE.md` and `public/third-party-licenses.txt` from the dependency trees that build
 * the shipped artifacts. `PREAMBLE` is the only hand-written part; `--check` regenerates both
 * and fails on any difference.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { collectAttributionMarkers } from "./lib/attribution-marker.mjs";
import { collectInventories } from "./lib/third-party-inventory.mjs";
import { distinctNames, packageLicenseText, renderThirdPartyLicenses } from "./lib/third-party-licenses.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const NOTICE_FILE = "NOTICE.md";
export const LICENSES_FILE = "public/third-party-licenses.txt";

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** One spelling per choice: `MIT/Apache-2.0`, `Apache-2.0 OR MIT` and `MIT OR Apache-2.0` agree. */
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

function groupByLicense(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const license = normalizeLicense(entry.license);
    if (!groups.has(license)) groups.set(license, []);
    groups.get(license).push(entry.name);
  }
  return [...groups.entries()]
    .map(([license, names]) => ({ license, names: [...new Set(names)].sort(compare) }))
    .sort((a, b) => compare(a.license, b.license));
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

const PRETENDARD_LICENSE = `Copyright (c) 2021, Kil Hyung-jin (https://github.com/orioncactus/pretendard),
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
OTHER DEALINGS IN THE FONT SOFTWARE.`;

const SUPPLIED_LICENSE_TEXTS = new Map([["npm pretendard", PRETENDARD_LICENSE]]);

/** The hand-written part. Everything below the inventory heading is generated. */
const PREAMBLE = `# Third-party notices

Ontology Atlas is licensed under the MIT License; see [\`LICENSE\`](./LICENSE).

This file lists the third-party components behind the released application and the
notices they require. Listing a component here does not place Ontology
Atlas under that component's license — the licenses below bind the component, not
the program that links it.

The license text of every package listed here, together with each NOTICE file a
package publishes, is in
[\`public/third-party-licenses.txt\`](./public/third-party-licenses.txt). The web
export serves it at \`/third-party-licenses.txt\`, and the desktop app carries it
beside this file. \`pnpm licenses:check\` holds every dependency to a permissive or
boundary license, and
[\`docs/engineering/third-party-code.md\`](./docs/engineering/third-party-code.md)
holds the rules for adding a dependency or adapting third-party code.

Scope: the static web export deployed to GitHub Pages; the macOS \`.app\` and
Windows installer published on the releases page, which contain the static web
export, the \`ontology-atlas\` application binary, and
the \`ontology-atlas-mcp\` sidecar binary; plus the two artifacts that carry the MCP
server on its own — the \`.mcpb\` bundle attached to each release and the
\`ghcr.io/wlsdks/ontology-atlas-mcp\` image. Those two vendor three MIT packages
(\`@modelcontextprotocol/core\`, \`@modelcontextprotocol/server\`, \`zod\`), each keeping
its own \`LICENSE\` inside the artifact beside Atlas's, and carry no native binaries.
A new distributed artifact belongs in this sentence: a notice that under-lists is a
compliance failure.

## Trademarks

Product names that appear in Atlas — Claude Code, Codex, Cursor, Antigravity,
Copilot, GitHub and others — are trademarks of their respective owners. Atlas is
not affiliated with, sponsored by, or endorsed by any of them. It names them only
to say what it interoperates with, which is the accurate way to describe an
integration and the only reason they appear.

Names are one thing and marks are another. A service's own glyph appears only
where that service's published brand guideline was read and permits monochrome
use to show an integration; every other row falls back to a generic connector
glyph. \`docs/features/agents.md\` owns that rule and names which services have been
checked. The ACP runtime icons under \`public/acp-icons/\` are the 16x16 monochrome
SVGs the ACP registry itself publishes for this purpose, fetched at build time by
\`pnpm acp:registry\`, so no brand colour enters the application.

CC0 on an icon set waives copyright, not trademark. Do not read a permissive
icon licence as permission to wear a mark.

The inventories at the end are read from the **build graphs** that produce those
artifacts, so they are supersets of what is actually shipped: a proc-macro crate such
as \`syn\`, or a build-only tool such as \`typescript\`, is listed without being
distributed. That is deliberate. A notice that under-lists is a compliance failure; one
that over-lists is only noise, and no obligation is created by appearing here.

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
  \`bun build --compile\` with the Bun release named in \`.bun-version\`.
  Substituting a Bun built against a modified WebKit, with \`.bun-version\` set to
  the version it reports, reproduces the sidecar with the modified library.

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
${PRETENDARD_LICENSE}
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
any NOTICE file distributed by those projects be passed along. Every NOTICE file a
listed package publishes is reproduced, after its license text, in
\`public/third-party-licenses.txt\`. The Apache License 2.0 text is available at
<https://www.apache.org/licenses/LICENSE-2.0>.

## Dual-licensed components

Where a dependency offers a choice of licenses, Ontology Atlas takes the permissive
option. For \`r-efi\`, offered as \`MIT OR Apache-2.0 OR LGPL-2.1-or-later\`, the MIT
option is elected, so no LGPL obligation arises from that crate. Every other choice
is made the same way, and \`public/third-party-licenses.txt\` reproduces the license
each package is used under.

---

# Dependency inventory

Generated by \`pnpm notice:build\`. Do not edit below this line by hand.
`;

export const INVENTORY_MARKER = "# Dependency inventory";

function adaptedSection(adapted) {
  if (adapted.length === 0) return "No source file carries code adapted from a third party.";
  return adapted
    .map((marker) => `- \`${marker.path}\`: adapted from <${marker.url}> under ${marker.license}, © ${marker.holder}`)
    .join("\n");
}

export function buildNotice({ rustCrates, npmPackages, mcpPackages, adapted }) {
  const sections = [
    PREAMBLE.trimEnd(),
    "",
    `## Rust crates (${distinctNames(rustCrates).length})`,
    "",
    "In the Cargo dependency graph of the `ontology-atlas` application binary, including\nbuild and proc-macro crates that are not linked into the shipped binary.",
    "",
    renderGroups(groupByLicense(rustCrates)).trimEnd(),
    "",
    `## npm packages (${distinctNames(npmPackages).length})`,
    "",
    "Present in the production dependency tree that builds the static web export.\nPlatform-specific native build tools, which differ per build machine and never\nship, are held to the license policy but not listed.",
    "",
    renderGroups(groupByLicense(npmPackages)).trimEnd(),
    "",
    `## MCP sidecar npm packages (${distinctNames(mcpPackages).length})`,
    "",
    "The production dependency tree of `mcp/`, which the sidecar binary compiles in.",
    "",
    renderGroups(groupByLicense(mcpPackages)).trimEnd(),
    "",
    `## Adapted code (${adapted.length})`,
    "",
    adaptedSection(adapted),
    "",
  ];
  return `${sections.join("\n")}\n`;
}

/** Both generated files, keyed by repository path, from one reading of the trees. */
export function buildOutputs({ web, mcp, rust, adapted, readText }) {
  const npmPackages = web.filter((pkg) => !pkg.platformSpecific);
  const sections = [
    {
      title: "npm packages in the web export",
      intro: "The production dependency tree of the static web export, which the desktop app\nalso bundles. Platform-specific native build tools are not listed: they differ\nper build machine and never ship.",
      packages: npmPackages,
    },
    {
      title: "npm packages in the MCP sidecar",
      intro: "The production dependency tree of mcp/, compiled into the ontology-atlas-mcp binary.",
      packages: mcp,
    },
    {
      title: "Rust crates in the desktop app",
      intro: "The Cargo dependency graph of the ontology-atlas application binary, for every\ntarget, so it also lists build-only and other-platform crates.",
      packages: rust,
    },
  ];
  return {
    [NOTICE_FILE]: buildNotice({ rustCrates: rust, npmPackages, mcpPackages: mcp, adapted }),
    [LICENSES_FILE]: renderThirdPartyLicenses({
      sections,
      adapted,
      readText: readText ?? ((pkg) => packageLicenseText(pkg, SUPPLIED_LICENSE_TEXTS)),
    }),
  };
}

function readCommitted(file) {
  const absolute = path.join(REPO_ROOT, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n") : "";
}

function main(argv, env = process.env) {
  const check = argv.includes("--check");
  const { web, mcp, rust } = collectInventories({ root: REPO_ROOT, env });
  if (!rust) {
    if (check) {
      console.log("[notice] cargo is not installed here, so the notice files are checked in CI.");
      return 0;
    }
    console.error("[notice] cargo is required to list the Rust crates; install Rust and run again.");
    return 1;
  }
  const adapted = collectAttributionMarkers(REPO_ROOT).filter((marker) => !marker.malformed);
  const outputs = buildOutputs({ web, mcp, rust, adapted });
  const shipped = web.filter((pkg) => !pkg.platformSpecific);
  const counts = `${distinctNames(rust).length} crates, ${distinctNames(shipped).length} web and ${distinctNames(mcp).length} MCP npm packages, ${adapted.length} adapted functions`;

  if (check) {
    const stale = Object.keys(outputs).filter((file) => readCommitted(file) !== outputs[file]);
    if (stale.length > 0) {
      const verb = stale.length === 1 ? "no longer matches" : "no longer match";
      console.error(`[notice] ${stale.join(" and ")} ${verb} the dependency trees and adapted-code markers. Run: pnpm notice:build`);
      return 1;
    }
    console.log(`[notice] ${Object.keys(outputs).join(" and ")} current: ${counts}.`);
    return 0;
  }

  for (const [file, text] of Object.entries(outputs)) fs.writeFileSync(path.join(REPO_ROOT, file), text);
  console.log(`[notice] wrote ${Object.keys(outputs).join(" and ")}: ${counts}.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`[notice] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
