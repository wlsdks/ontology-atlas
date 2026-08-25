# Third-party notices

Ontology Atlas is licensed under the MIT License; see [`LICENSE`](./LICENSE).

This file lists third-party components distributed inside the released application
and the notices they require. Listing a component here does not place Ontology
Atlas under that component's license — the licenses below bind the component, not
the program that links it.

Scope: the macOS `.app` and Windows installer published on the releases page,
which contain the static web export, the `ontology-atlas` application binary, and
the `ontology-atlas-mcp` sidecar binary.

---

## JavaScriptCore and WebKit (LGPL-2.1)

The `ontology-atlas-mcp` sidecar is compiled with [Bun](https://bun.sh) using
`bun build --compile`. Bun statically links JavaScriptCore and WebKit, which are
licensed under the GNU Lesser General Public License, version 2.1.

Because the linking is static rather than dynamic, LGPL-2.1 section 6 applies: a
recipient must be able to modify the library and relink the application against
their modified version. That is possible here, and this is how:

- The WebKit source Bun links is published at <https://github.com/oven-sh/webkit>,
  pinned by `WEBKIT_VERSION` in Bun's build scripts. Bun documents the relink
  procedure in its [`LICENSE.md`](https://github.com/oven-sh/bun/blob/main/LICENSE.md).
- The sidecar's own source is this repository's `mcp/` directory, published under
  the MIT License with no additional restriction.
- The sidecar is rebuilt from that source by `pnpm mcp:build-binary`, which runs
  `bun build --compile`. Substituting a Bun built against a modified WebKit
  reproduces the sidecar with the modified library.

No part of JavaScriptCore or WebKit was modified for this distribution.

## Bun runtime (MIT)

The compiled sidecar embeds the Bun runtime, which is MIT licensed, together with
the libraries Bun statically links. Bun's complete third-party inventory, including
BoringSSL, brotli, libarchive, lol-html, ls-hpack, mimalloc, tinycc, zlib and
zstd, is published in its [`LICENSE.md`](https://github.com/oven-sh/bun/blob/main/LICENSE.md).

## Pretendard (SIL Open Font License 1.1)

The static export ships `PretendardVariable` as a woff2 font file. Pretendard is
copyright (c) 2021 Kil Hyung-jin, released under the SIL Open Font License 1.1.
Source: <https://github.com/orioncactus/pretendard>.

OFL-1.1 requires the license to accompany the font, and the npm package does not
carry the text, so it is reproduced in full below.

<details>
<summary>SIL Open Font License, Version 1.1</summary>

```
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
```

</details>

## Mozilla Public License 2.0 components

The application binary links these Rust crates, which are licensed under MPL-2.0:
`cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext` and `selectors`.

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
option. For `r-efi`, offered as `MIT OR Apache-2.0 OR LGPL-2.1-or-later`, the MIT
option is elected, so no LGPL obligation arises from that crate.

---

# Dependency inventory

Generated by `pnpm notice:build`. Do not edit below this line by hand.

## Rust crates (563)

Linked into the `ontology-atlas` application binary.

### (MIT OR Apache-2.0) AND Unicode-3.0 (1)

`unicode-ident`

### 0BSD OR Apache-2.0 OR MIT (1)

`adler2`

### Apache-2.0 (2)

`sync_wrapper`, `tao`

### Apache-2.0 AND ISC (1)

`ring`

### Apache-2.0 AND MIT (1)

`dpi`

### Apache-2.0 OR Apache-2.0 WITH LLVM-exception OR MIT (14)

`linux-raw-sys`, `rustix`, `wasi`, `wasip2`, `wasip3`, `wasm-encoder`, `wasm-metadata`, `wasmparser`, `wit-bindgen`, `wit-bindgen-core`, `wit-bindgen-rust`, `wit-bindgen-rust-macro`, `wit-component`, `wit-parser`

### Apache-2.0 OR BSD-2-Clause OR MIT (2)

`zerocopy`, `zerocopy-derive`

### Apache-2.0 OR BSD-3-Clause OR MIT (2)

`num_enum`, `num_enum_derive`

### Apache-2.0 OR CC0-1.0 OR MIT-0 (1)

`dunce`

### Apache-2.0 OR ISC OR MIT (3)

`hyper-rustls`, `rustls`, `rustls-native-certs`

### Apache-2.0 OR LGPL-2.1-or-later OR MIT (1)

`r-efi`

### Apache-2.0 OR MIT (283)

`android_log-sys`, `android_logger`, `android_system_properties`, `anyhow`, `arbitrary`, `async-broadcast`, `async-channel`, `async-executor`, `async-fs`, `async-io`, `async-lock`, `async-net`, `async-process`, `async-recursion`, `async-signal`, `async-task`, `async-trait`, `atomic-waker`, `autocfg`, `base64`, `bit-set`, `bit-vec`, `bitflags`, `block-buffer`, `blocking`, `bs58`, `bumpalo`, `camino`, `cargo-platform`, `cargo_toml`, `cc`, `cesu8`, `cfg-expr`, `cfg-if`, `chrono`, `concurrent-queue`, `cookie`, `core-foundation`, `core-foundation-sys`, `core-graphics`, `core-graphics-types`, `cpufeatures`, `crc32fast`, `crossbeam-channel`, `crossbeam-utils`, `crypto-common`, `ctor`, `ctor-proc-macro`, `dbus`, `deranged`, `derive_arbitrary`, `digest`, `dirs`, `dirs-sys`, `displaydoc`, `downcast-rs`, `dtoa`, `dtor`, `dtor-proc-macro`, `dyn-clone`, `embed_plist`, `enumflags2`, `enumflags2_derive`, `env_filter`, `equivalent`, `erased-serde`, `errno`, `event-listener`, `event-listener-strategy`, `fastrand`, `fdeflate`, `field-offset`, `file-id`, `filetime`, `find-msvc-tools`, `flate2`, `fnv`, `foreign-types`, `foreign-types-macros`, `foreign-types-shared`, `form_urlencoded`, `futures-channel`, `futures-core`, `futures-executor`, `futures-io`, `futures-lite`, `futures-macro`, `futures-sink`, `futures-task`, `futures-util`, `getrandom`, `glob`, `hashbrown`, `heck`, `hermit-abi`, `hex`, `html5ever`, `http`, `httparse`, `iana-time-zone`, `iana-time-zone-haiku`, `id-arena`, `ident_case`, `idna`, `idna_adapter`, `indexmap`, `ipnet`, `itoa`, `jni`, `jni-macros`, `jni-sys`, `jni-sys-macros`, `js-sys`, `json-patch`, `jsonptr`, `keyboard-types`, `keyring`, `leb128fmt`, `libappindicator`, `libappindicator-sys`, `libc`, `libdbus-sys`, `lock_api`, `log`, `markup5ever`, `mime`, `muda`, `ndk`, `ndk-sys`, `notify-debouncer-full`, `num-conv`, `num-traits`, `num_threads`, `once_cell`, `openssl-probe`, `ordered-stream`, `osakit`, `parking`, `parking_lot`, `parking_lot_core`, `percent-encoding`, `pin-project-lite`, `piper`, `pkg-config`, `png`, `polling`, `pollster`, `powerfmt`, `ppv-lite86`, `prettyplease`, `proc-macro-crate`, `proc-macro-error`, `proc-macro-error-attr`, `proc-macro2`, `quote`, `rand`, `rand_chacha`, `rand_core`, `ref-cast`, `ref-cast-impl`, `regex`, `regex-automata`, `regex-syntax`, `reqwest`, `rustc-hash`, `rustc_version`, `rustls-pki-types`, `rustls-platform-verifier`, `rustls-platform-verifier-android`, `rustversion`, `scoped-tls`, `scopeguard`, `security-framework`, `security-framework-sys`, `semver`, `serde`, `serde-untagged`, `serde_core`, `serde_derive`, `serde_derive_internals`, `serde_json`, `serde_repr`, `serde_spanned`, `serde_with`, `serde_with_macros`, `serialize-to-javascript`, `serialize-to-javascript-impl`, `servo_arc`, `sha2`, `shlex`, `signal-hook-registry`, `simd_cesu8`, `simdutf8`, `siphasher`, `smallvec`, `socket2`, `softbuffer`, `stable_deref_trait`, `string_cache`, `string_cache_codegen`, `swift-rs`, `syn`, `system-deps`, `tao-macros`, `tar`, `tauri`, `tauri-build`, `tauri-codegen`, `tauri-macros`, `tauri-plugin`, `tauri-plugin-log`, `tauri-plugin-process`, `tauri-plugin-single-instance`, `tauri-plugin-updater`, `tauri-plugin-window-state`, `tauri-runtime`, `tauri-runtime-wry`, `tauri-utils`, `tempfile`, `tendril`, `thiserror`, `thiserror-impl`, `time`, `time-core`, `time-macros`, `tokio-rustls`, `toml`, `toml_datetime`, `toml_edit`, `toml_parser`, `toml_writer`, `tray-icon`, `typeid`, `typenum`, `unic-char-property`, `unic-char-range`, `unic-common`, `unic-ucd-ident`, `unic-ucd-version`, `unicode-segmentation`, `unicode-xid`, `url`, `utf-8`, `utf8_iter`, `uuid`, `version_check`, `wasm-bindgen`, `wasm-bindgen-futures`, `wasm-bindgen-macro`, `wasm-bindgen-macro-support`, `wasm-bindgen-shared`, `wasm-streams`, `web-sys`, `web_atoms`, `winapi`, `winapi-i686-pc-windows-gnu`, `winapi-x86_64-pc-windows-gnu`, `window-vibrancy`, `windows`, `windows-collections`, `windows-core`, `windows-future`, `windows-implement`, `windows-interface`, `windows-link`, `windows-numerics`, `windows-result`, `windows-strings`, `windows-sys`, `windows-targets`, `windows-threading`, `windows-version`, `windows_aarch64_gnullvm`, `windows_aarch64_msvc`, `windows_i686_gnu`, `windows_i686_gnullvm`, `windows_i686_msvc`, `windows_x86_64_gnu`, `windows_x86_64_gnullvm`, `windows_x86_64_msvc`, `wry`, `xattr`, `zeroize`

### Apache-2.0 OR MIT OR Zlib (21)

`bytemuck`, `dispatch2`, `miniz_oxide`, `objc2-app-kit`, `objc2-cloud-kit`, `objc2-core-data`, `objc2-core-foundation`, `objc2-core-graphics`, `objc2-core-image`, `objc2-core-location`, `objc2-core-text`, `objc2-exception-helper`, `objc2-io-surface`, `objc2-osa-kit`, `objc2-quartz-core`, `objc2-ui-kit`, `objc2-user-notifications`, `objc2-web-kit`, `raw-window-handle`, `tinyvec`, `tinyvec_macros`

### Apache-2.0 WITH LLVM-exception (1)

`target-lexicon`

### BSD-3-Clause (3)

`alloc-no-stdlib`, `alloc-stdlib`, `subtle`

### BSD-3-Clause AND MIT (1)

`brotli`

### BSD-3-Clause OR MIT (1)

`brotli-decompressor`

### CC0-1.0 (1)

`notify`

### CDLA-Permissive-2.0 (1)

`webpki-root-certs`

### ISC (5)

`inotify`, `inotify-sys`, `libloading`, `rustls-webpki`, `untrusted`

### MIT (120)

`ashpd`, `atk`, `atk-sys`, `block2`, `bytes`, `cairo-rs`, `cairo-sys-rs`, `cargo_metadata`, `cfb`, `combine`, `darling`, `darling_core`, `darling_macro`, `derive_more`, `derive_more-impl`, `dlib`, `dlopen2`, `dlopen2_derive`, `dom_query`, `embed-resource`, `endi`, `fern`, `fsevent-sys`, `gdk`, `gdk-pixbuf`, `gdk-pixbuf-sys`, `gdk-sys`, `gdkwayland-sys`, `gdkx11`, `gdkx11-sys`, `generic-array`, `gio`, `gio-sys`, `glib`, `glib-macros`, `glib-sys`, `gobject-sys`, `gtk`, `gtk-sys`, `gtk3-macros`, `http-body`, `http-body-util`, `hyper`, `hyper-util`, `ico`, `infer`, `javascriptcore-rs`, `javascriptcore-rs-sys`, `kqueue`, `kqueue-sys`, `libredox`, `memoffset`, `minisign-verify`, `mio`, `new_debug_unreachable`, `objc2`, `objc2-encode`, `objc2-foundation`, `pango`, `pango-sys`, `phf`, `phf_codegen`, `phf_generator`, `phf_macros`, `phf_shared`, `plist`, `precomputed-hash`, `quick-xml`, `redox_syscall`, `redox_users`, `rfd`, `schannel`, `schemars`, `schemars_derive`, `simd-adler32`, `slab`, `soup3`, `soup3-sys`, `strsim`, `synstructure`, `tauri-winres`, `tokio`, `tokio-util`, `tower`, `tower-http`, `tower-layer`, `tower-service`, `tracing`, `tracing-attributes`, `tracing-core`, `try-lock`, `uds_windows`, `urlencoding`, `urlpattern`, `version-compare`, `vswhom`, `vswhom-sys`, `want`, `wayland-backend`, `wayland-client`, `wayland-protocols`, `wayland-scanner`, `wayland-sys`, `webkit2gtk`, `webkit2gtk-sys`, `webview2-com`, `webview2-com-macros`, `webview2-com-sys`, `winnow`, `winreg`, `x11`, `x11-dl`, `zbus`, `zbus_macros`, `zbus_names`, `zip`, `zmij`, `zvariant`, `zvariant_derive`, `zvariant_utils`

### MIT OR Unlicense (6)

`aho-corasick`, `byteorder`, `memchr`, `same-file`, `walkdir`, `winapi-util`

### MPL-2.0 (5)

`cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, `selectors`

### Unicode-3.0 (18)

`icu_collections`, `icu_locale_core`, `icu_normalizer`, `icu_normalizer_data`, `icu_properties`, `icu_properties_data`, `icu_provider`, `litemap`, `potential_utf`, `tinystr`, `writeable`, `yoke`, `yoke-derive`, `zerofrom`, `zerofrom-derive`, `zerotrie`, `zerovec`, `zerovec-derive`

### Zlib (1)

`foldhash`

## npm packages (252)

Present in the production dependency tree that builds the static web export.

### 0BSD (1)

`tslib`

### Apache-2.0 (15)

`@img/sharp-darwin-arm64`, `@opentelemetry/api`, `@playwright/test`, `@swc/core`, `@swc/counter`, `@swc/helpers`, `@swc/types`, `@typescript/typescript6`, `baseline-browser-mapping`, `class-variance-authority`, `detect-libc`, `playwright`, `playwright-core`, `sharp`, `typescript`

### Apache-2.0 AND MIT (1)

`@swc/core-darwin-arm64`

### Apache-2.0 OR MIT (3)

`@tauri-apps/api`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-updater`

### BSD-3-Clause (3)

`intl-messageformat`, `smol-toml`, `source-map-js`

### CC-BY-4.0 (1)

`caniuse-lite`

### ISC (7)

`@ungap/structured-clone`, `electron-to-chromium`, `lru-cache`, `lucide-react`, `picocolors`, `semver`, `yallist`

### LGPL-3.0-or-later (1)

`@img/sharp-libvips-darwin-arm64`

### MIT (219)

`@babel/code-frame`, `@babel/compat-data`, `@babel/core`, `@babel/generator`, `@babel/helper-compilation-targets`, `@babel/helper-globals`, `@babel/helper-module-imports`, `@babel/helper-module-transforms`, `@babel/helper-string-parser`, `@babel/helper-validator-identifier`, `@babel/helper-validator-option`, `@babel/helpers`, `@babel/parser`, `@babel/template`, `@babel/traverse`, `@babel/types`, `@floating-ui/core`, `@floating-ui/dom`, `@floating-ui/react-dom`, `@floating-ui/utils`, `@formatjs/fast-memoize`, `@formatjs/icu-messageformat-parser`, `@formatjs/icu-skeleton-parser`, `@formatjs/intl-localematcher`, `@hookform/resolvers`, `@img/colour`, `@jridgewell/gen-mapping`, `@jridgewell/remapping`, `@jridgewell/resolve-uri`, `@jridgewell/sourcemap-codec`, `@jridgewell/trace-mapping`, `@next/env`, `@next/swc-darwin-arm64`, `@parcel/watcher`, `@parcel/watcher-darwin-arm64`, `@radix-ui/primitive`, `@radix-ui/react-arrow`, `@radix-ui/react-compose-refs`, `@radix-ui/react-context`, `@radix-ui/react-dialog`, `@radix-ui/react-dismissable-layer`, `@radix-ui/react-focus-guards`, `@radix-ui/react-focus-scope`, `@radix-ui/react-id`, `@radix-ui/react-popper`, `@radix-ui/react-portal`, `@radix-ui/react-presence`, `@radix-ui/react-primitive`, `@radix-ui/react-slot`, `@radix-ui/react-tooltip`, `@radix-ui/react-use-callback-ref`, `@radix-ui/react-use-controllable-state`, `@radix-ui/react-use-effect-event`, `@radix-ui/react-use-layout-effect`, `@radix-ui/react-use-rect`, `@radix-ui/react-use-size`, `@radix-ui/react-visually-hidden`, `@radix-ui/rect`, `@schummar/icu-type-parser`, `@standard-schema/spec`, `@standard-schema/utils`, `@tanstack/react-virtual`, `@tanstack/virtual-core`, `@types/debug`, `@types/estree`, `@types/estree-jsx`, `@types/hast`, `@types/mdast`, `@types/ms`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/unist`, `aria-hidden`, `bail`, `browserslist`, `ccount`, `character-entities`, `character-entities-html4`, `character-entities-legacy`, `character-reference-invalid`, `client-only`, `clsx`, `cmdk`, `comma-separated-tokens`, `convert-source-map`, `csstype`, `debug`, `decode-named-character-reference`, `dequal`, `detect-node-es`, `devlop`, `escalade`, `escape-string-regexp`, `estree-util-is-identifier-name`, `events`, `extend`, `framer-motion`, `fsevents`, `gensync`, `get-nonce`, `graphology`, `graphology-layout-forceatlas2`, `graphology-types`, `graphology-utils`, `hast-util-to-jsx-runtime`, `hast-util-whitespace`, `html-url-attributes`, `icu-minify`, `inline-style-parser`, `is-alphabetical`, `is-alphanumerical`, `is-decimal`, `is-extglob`, `is-glob`, `is-hexadecimal`, `is-plain-obj`, `js-tokens`, `jsesc`, `json5`, `jsonc-parser`, `lodash.debounce`, `longest-streak`, `markdown-table`, `mdast-util-find-and-replace`, `mdast-util-from-markdown`, `mdast-util-gfm`, `mdast-util-gfm-autolink-literal`, `mdast-util-gfm-footnote`, `mdast-util-gfm-strikethrough`, `mdast-util-gfm-table`, `mdast-util-gfm-task-list-item`, `mdast-util-mdx-expression`, `mdast-util-mdx-jsx`, `mdast-util-mdxjs-esm`, `mdast-util-phrasing`, `mdast-util-to-hast`, `mdast-util-to-markdown`, `mdast-util-to-string`, `micromark`, `micromark-core-commonmark`, `micromark-extension-gfm`, `micromark-extension-gfm-autolink-literal`, `micromark-extension-gfm-footnote`, `micromark-extension-gfm-strikethrough`, `micromark-extension-gfm-table`, `micromark-extension-gfm-tagfilter`, `micromark-extension-gfm-task-list-item`, `micromark-factory-destination`, `micromark-factory-label`, `micromark-factory-space`, `micromark-factory-title`, `micromark-factory-whitespace`, `micromark-util-character`, `micromark-util-chunked`, `micromark-util-classify-character`, `micromark-util-combine-extensions`, `micromark-util-decode-numeric-character-reference`, `micromark-util-decode-string`, `micromark-util-encode`, `micromark-util-html-tag-name`, `micromark-util-normalize-identifier`, `micromark-util-resolve-all`, `micromark-util-sanitize-uri`, `micromark-util-subtokenize`, `micromark-util-symbol`, `micromark-util-types`, `motion-dom`, `motion-utils`, `ms`, `nanoid`, `negotiator`, `next`, `next-intl`, `next-intl-swc-plugin-extractor`, `node-addon-api`, `node-releases`, `parse-entities`, `picomatch`, `po-parser`, `postcss`, `property-information`, `react`, `react-dom`, `react-hook-form`, `react-markdown`, `react-remove-scroll`, `react-remove-scroll-bar`, `react-style-singleton`, `remark-gfm`, `remark-parse`, `remark-rehype`, `remark-stringify`, `scheduler`, `sonner`, `space-separated-tokens`, `stringify-entities`, `style-to-js`, `style-to-object`, `styled-jsx`, `tailwind-merge`, `trim-lines`, `trough`, `undici-types`, `unified`, `unist-util-is`, `unist-util-position`, `unist-util-stringify-position`, `unist-util-visit`, `unist-util-visit-parents`, `update-browserslist-db`, `use-callback-ref`, `use-intl`, `use-sidecar`, `usehooks-ts`, `vfile`, `vfile-message`, `zod`, `zwitch`

### OFL-1.1 (1)

`pretendard`

