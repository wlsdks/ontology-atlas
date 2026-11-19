---
title: Search by meaning in the Wiki question desk
doc_type: spec
status: draft
area: library
date: 2026-11-19
decisions: []
---

# Search by meaning in the Wiki question desk

## Person and moment

A developer who already works with coding agents keeps an LLM wiki in their
ontology folder: wiki pages in Korean and English, plus Markdown sources. On the
installed app's Wiki tab they type a question in their own words into the
question desk and press **Find evidence**. The page that answers it says the same
thing in other words, or in the other language. Today the desk says
`questionDesk.zeroLocalTitle` "No matching passage yet" and admits that "word
search can miss documents in another language" (`messages/en/library.json:24`).
The next step it offers is **Investigate sources**, which starts an agent
(`library.json:25`). The person wants the desk itself to find the passage, with
no agent and nothing leaving the computer.

Sources for this moment: the owner's request (2026-11-19). It asks for vector
search with licences checked, safe setup, one easy button, its own button on the
Wiki tab separate from the map's agent button, and embeddings from ACP or Ollama.
The admission in the desk's own copy is the second source. One machine fact was
read on 2026-11-19: on the owner's Mac, Ollama 0.35.1 answers at
`localhost:11434`. Its model list holds two chat models and no embedding model
(`GET /v1/models`). **Nobody has captured the failure on a real wiki**, so
acceptance criterion 1 captures it first.

## Today

The app:
- The desk searches only when the person presses Find evidence. It reads wiki claims (the bullets under `## Facts` and `## Decisions`) and source passages in the WebView, ranks them by substring and Hangul-pair overlap, and keeps the top 8 of each (`src/views/library/ui/parts/questions/LibraryQuestionDesk.tsx:304-374`, `src/features/library/lib/questions/question-desk.ts:56-106`). Nothing in it matches meaning.
- The app keeps `search.sqlite`, a contentless FTS5 index of every `.md` file in the OS cache directory. It is opened only by the app, rebuilt from the files, and deleted after 14 days unopened. Its hits carry no text (`src-tauri/crates/vault-index/sql/search.sql:1-30`, `src-tauri/crates/vault-index/src/search.rs:11-18`, `docs/ARCHITECTURE.md:180-214`, record `183a2c12`). Its states are Off, Absent, Building, Ready, Partial, Paused, Unavailable and Unreadable (`src-tauri/src/vault/index.rs:86-98`). The Library list and the palette search through it (`src/views/library/ui/parts/index-column/LibrarySection.tsx:106,360`, `src/widgets/docs-vault/lib/use-vault-text-search.ts:35-51`). The desk does not.
- The crate pins `rusqlite =0.43.0` with `bundled` (`src-tauri/crates/vault-index/Cargo.toml:13`). PR #3607 is open, not merged. It adds `rows.sqlite`, turns the lifecycle into a generic `Store` and adds stamp trust per volume: "a volume without change time (FAT, exFAT) gets no rows at all".
- Connect by address accepts plain `http` only on loopback and accepts `https` anywhere. It refuses user info, query strings and quotes (`src-tauri/src/llm/local_endpoint.rs:11-56`). The default address is `http://localhost:11434` (`:6`). The address and the chat model are kept in localStorage (`src/shared/lib/llm-connection/local-endpoint.ts:14-57`). `isEmbeddingOnlyModel` already recognises embedding models by name and lists them last (`local-endpoint.ts:105-143`). Requests go through `curl` with a 20 s default timeout (`src-tauri/src/llm/curl.rs:22-24`).
- Every model call writes an audit line before it sends. A send that cannot write its line is blocked (`src-tauri/src/llm_audit.rs:1-4`, decision 52). The line holds `purpose`, `host`, `model`, `question` and `scope` (`llm_audit.rs:49-68`). The reader lets unknown purposes through (`src/shared/lib/llm-connection/llm-audit-log.ts:57-59,121`). Decision 52 holds `flock` from reserve to finalize. A line therefore cannot stay open across a long run.
- Settings › Privacy · data lists every outbound path. `local-runner` is recorded in the audit log (`src/widgets/app-settings-menu/model/outbound-paths.ts:48-54`). Under "Stored on this computer" sits the index switch, with a caption that says what the index holds (`messages/en/settingsPrivacy.json:73-90`).
- Release v2.2.3 ships an 85.8 MB macOS DMG (aarch64) and a 78.4 MB Windows x64 installer (`gh release view`).
- `pnpm decisions:find` shows no record about embeddings or vectors. The rule the brief calls "decision 12" (MCP must not read the app's rows) did not turn up under that name. The binding text found is "opened only by the app" (`search.sql:2`, `ARCHITECTURE.md:184`). The derived-index record's dissent adds that "a Rust core reached by MCP through a helper would fork the pure-JavaScript bundle".

Outside facts (fetched 2026-11-19):
- **ACP has no embeddings method.** The v1 and v2 method lists, unstable included, are initialize, auth, providers, session/*, mcp/message, terminal, elicitation and proxy. "Embedded" appears only as `EmbeddedResource` in prompts ([v1 meta](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/meta.unstable.json), [v2 meta](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v2/meta.unstable.json)). "Anthropic does not offer its own embedding model" ([docs](https://platform.claude.com/docs/en/build-with-claude/embeddings)). OpenAI and Gemini do sell embeddings, but no ACP adapter exposes them. Whether a Codex or Gemini CLI login token could call those APIs was not checked.
- **sqlite-vec** is MIT/Apache-2.0 and "pre-v1, so expect breaking changes" ([README](https://github.com/asg017/sqlite-vec)). The last stable release is 0.1.9 (2026-03-31). Alphas up to 0.1.10-alpha.4 (2026-05-18) add rescore, DiskANN and an experimental IVF ([release](https://github.com/asg017/sqlite-vec/releases/tag/v0.1.10-alpha.1)). Stable `vec0` does "brute-force KNN" ([knn docs](https://github.com/asg017/sqlite-vec/blob/main/site/features/knn.md)). The crate compiles its C source with `cc` and registers through `unsafe sqlite3_auto_extension`; it needs no runtime extension loading ([rust guide](https://github.com/asg017/sqlite-vec/blob/main/site/using/rust.md)). Its effect on binary size and its MSVC build were not measured.
- **Brute-force KNN, measured** on the owner's M2 Max at load 21 (`scratchpad/knn/knn.rs`, rustc -O). Scanning 50k × 1024 vectors in memory takes 2.5 ms as int8 (51 MB) and 0.29 ms as 1-bit (6 MB). Scanning 150k × 1024 takes 3.9 ms as int8 (153 MB) and 0.84 ms as 1-bit (19 MB). The f32 loop was not vectorised (69–140 ms) and is not a fair f32 figure. Disk reads were not measured.
- **Ollama** offers `POST /api/embed` (`input` as a string or a list, `truncate` defaults to true, plus `keep_alive` and `dimensions`) and an OpenAI-compatible `/v1/embeddings` (`model`, `input`, `dimensions`) ([api.md](https://github.com/ollama/ollama/blob/main/docs/api.md), [compat](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx)).
- **Models** (licence from the Hugging Face API, size from the ollama.com tags page). Korean quality is not measured here; acceptance criterion 1 measures it.

| Model | Licence | Dims | Ollama pull | Note |
|---|---|---|---|---|
| bge-m3 | MIT | 1024 | 1.2 GB, 8K ctx | Korean fine-tunes (KURE-v1, BGE-m3-ko) build on it |
| qwen3-embedding:0.6b | Apache-2.0 | ≤1024, Matryoshka | 639 MB, 32K ctx | lighter alternative |
| nomic-embed-text-v2-moe | Apache-2.0 | 768 (256) | 958 MB, 512 ctx | needs prefixes |
| granite-embedding:278m | Apache-2.0 | 768 | 563 MB, 512 ctx | |
| snowflake-arctic-embed2 | Apache-2.0 | 1024 | 1.2 GB | |
| multilingual-e5-small | MIT | 384 | — | int8 ONNX 118 MB + 17 MB tokenizer ([files](https://huggingface.co/intfloat/multilingual-e5-small/tree/main/onnx)) |
| embeddinggemma | Gemma terms | 768 | 622 MB | **not MIT-compatible**: never offered or pulled by Atlas |
| jina-embeddings-v3 | CC BY-NC 4.0 | 1024 | — | **excluded** |

- **Bundled runtimes.** `fastembed` 7.7.1 is Apache-2.0 and depends on `ort =2.0.0-rc.15` (MIT/Apache, pre-1.0), plus `tokenizers` with Oniguruma and `hf-hub`. It downloads models from Hugging Face itself ([README](https://github.com/Anush008/fastembed-rs)). `candle` 0.11.1 is MIT/Apache and pure Rust. Neither was measured for app size.

## Owner decisions after this draft (2026-11-19)

- **A built-in model comes first, not later.** One press downloads the model and prepares search. The person does not need Ollama, and Ollama remains an option for people who already run it. The model is not in the installer.
- **Consent first.** Before anything downloads, a dialog states:
  - what the model does;
  - its name, maker (BAAI) and licence (MIT);
  - its download size, its disk use and where it is stored;
  - the host it comes from, and that no folder content is sent;
  - its memory while preparing;
  - that Settings can delete it.

  Cancel is the default.
- **The model.** bge-m3, in its most compressed file that keeps the same quality and passes a safety inspection. "Same quality" means recall@8 within 1 point of fp32 and cross-language within 2 points. The file's repo, commit and SHA-256 are compiled into the app. Candidates:
  - `Xenova/bge-m3` int8, 568 MB, MIT;
  - `onnx-community/bge-m3-ONNX` int8;
  - the BAAI fp32 reference, 2.27 GB, at commit `5617a9f6`.
- **Memory.** The app may use 1–2 GB while preparing.
- **Attribution.** The licence screen carries:
  - the MIT text with "Copyright (c) 2022 staoxiao" (FlagOpen/FlagEmbedding);
  - the xlm-roberta-large base model (MIT);
  - the model card link;
  - the paper "BGE M3-Embedding" (Chen et al., 2024, arXiv 2402.03216), whose authors ask for a citation.

  The model repository has no LICENSE file, and Hugging Face's terms forbid removing a licence reference.
- **Audit.** The download writes a `model-download` start line and a closing line to `llm-audit.jsonl`.
- **Measured on the labelled set (#3611).** Recall@8 went from 66.7 for word search alone to 95.0 for word plus meaning with bge-m3. Cross-language went from 20.0 to 85.0, and exact terms stayed at 100. Preparing 50k files through Ollama took 5–8 hours, which misses the 60-minute budget. The built-in runtime's speed decides whether that budget holds.

## Problem and alternatives

The cause: the desk can only match words, and words differ across paraphrase and
language. Agents and the FTS index don't fix that: an agent runs a slow,
provider-side investigation, and the index matches the same words faster.

Places the owner named, ranked by value against cost:
1. **The Wiki question desk.** The moment exists, the copy already admits the miss, the search is one press, and the person and the scope are bounded. This comes first.
2. **The Library search field.** It searches on every keystroke (`LibrarySection.tsx:360`). Embedding the query needs a press or a debounce, which makes it a second interaction model. It comes next once vectors exist.
3. **Related pages.** Cheap once vectors exist, but no observed moment. Third.
4. **Map and agents through MCP `find_evidence`.** A public contract and a store-access decision (see below). Fourth.

Ways to give back the same ability:

| Option | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| A. Status quo: words plus Investigate sources | Misses other words and languages | Each miss needs an agent run | Exists | Agent sends to its provider | Loses: the moment stays broken |
| B. ACP rewrites the query into other wordings, then word search | Partial: cross-language helps, paraphrase helps somewhat | One agent turn per press, seconds (not measured) | Exists in the app | The question goes to the provider; reranking would send vault passages too | Later, for zero results |
| C. **Ollama or another loopback runner makes the embeddings; vectors in the derived index** | Matches meaning across languages | One press; the person's own Ollama | Endpoint and audit exist | Nothing leaves the computer | **Chosen** |
| D. A small ONNX model downloaded on first press (e5-small, 135 MB) | Weaker than bge-m3 (not measured) | Zero setup | New runtime (`ort` rc or `candle`) of unknown size, a new outbound host | Model download only | Later #1 |
| E. Remote embeddings API (OpenAI, Gemini, a remote https runner) | Strong | Key setup | Easy | Sends the **whole vault's text** | Later, with consent per run |
| F. A dedicated vector MCP server | Agents only | A new install and config for every agent | A second store and a second build | Cannot reuse the app's index | Rejected (below) |

**Is a dedicated MCP server right? No.**
1. The app's index is "opened only by the app" (`ARCHITECTURE.md:184`). A separate server would need either its own vectors (a second hour-long build, a second copy of text-derived data, twice the memory) or a reversal of that rule.
2. Agents already have one Atlas MCP server configured. A second server means another install and config step in every agent, and another tool surface in a host whose MCP instructions are truncated.
3. A third-party vector server would carry vault text outside Atlas's audit log. Atlas never executes third-party code (`forbidden.md`).
4. People ask the question in the desk, not in an agent.

Agents get meaning search later through the existing `find_evidence`. That needs
its own decision on whether the MCP may read the vector file read-only. WAL
already lets another process read (`ARCHITECTURE.md:211-212`); the rule forbids
it, and the MCP is pure JavaScript.

**Storage: a plain table plus Rust, not sqlite-vec, in this slice.** Measured
brute force over int8 vectors already takes milliseconds. sqlite-vec's stable
line is that same brute force, behind a pre-v1 C extension, `unsafe` registration
and an unmeasured MSVC build. Its ANN features have sat in alpha for seven months.
It would buy nothing measurable and add a breaking-change surface. Reopen this if
the vector count passes 500k or query p95 misses its target.

Where else it connects in this slice:
- **The question desk:** yes; it is the moment.
- **Library search, related pages, MCP:** deferred, with reasons in Later.
- **The map's agent button:** stays an agent conversation. The desk's new button prepares this folder for search on this computer; it never starts an agent.

## Flow

1. When the person opens the Wiki tab's question desk in the installed app, with the search index on and search by meaning not set up, Atlas shows **Set up search by meaning** in the desk head beside the question field, with an info icon whose tooltip begins "Semantic search (embeddings)". It shows nothing else new.
2. When they press it, Atlas opens one centred dialog. Atlas checks the runner address from Agents › Models (default `http://localhost:11434`). It lists the embedding models found there by `isEmbeddingOnlyModel`, with bge-m3 first if present, and states the file count and that nothing leaves the computer.
3. When Ollama answers but has no embedding model (the owner's state today), the one button is **Download bge-m3 (1.2 GB) and prepare**. Atlas asks Ollama to pull `bge-m3` and shows Ollama's download percentage. When the pull finishes, preparation starts with no further press.
4. When preparation runs, the desk head shows files done of total and the minutes left (shown after the first minute) beside **Stop**. Search works throughout and uses the files already prepared. Wiki pages are prepared first, then sources, then the rest of the folder.
5. When the person presses Stop, or quits the app, Atlas keeps every finished passage. **Resume**, or the next app open, continues from there and sends only passages not yet prepared.
6. When the person presses Find evidence with the folder prepared, Atlas runs word search and meaning search together. It merges them by reciprocal-rank fusion (k = 60) into the same 8 claims and 8 source passages. Each lead is labelled **Same words**, **Similar meaning** or both, and shows its passage with lines, as leads do today. The coverage line adds "By meaning: N of M files prepared".
7. When a file changes, the index's stamp pass prepares again only the passages whose text changed. The desk head says "Updating N changed files" only while N > 0.
8. **The model is wrong or the evidence missing.** When a meaning hit's file has changed since it was prepared, Atlas drops that hit and counts it with changed files. When the runner does not answer within 10 s, Atlas shows the word results with "Ollama did not answer, so these results match words only." When neither search finds anything, Atlas says so and keeps **Investigate sources**. A meaning hit is a lead to read; it never fills in an answer, changes a page's status, or reaches an agent.

**What leaves the machine, per source.**

| Source | What is sent | Where | Consent | Audit lines (`.ontology-atlas/llm-audit.jsonl`) |
|---|---|---|---|---|
| Loopback runner (default; the only one in this slice) | Passage text and the question | This computer only (`localhost`, `127.0.0.0/8`, `::1`, checked in Rust for both http and https) | The setup press | `purpose:"embed-build"`: one line written before a run's first request (host, model, files and characters planned), and one closing line (passages sent, outcome). `purpose:"embed-query"`: one line per Find evidence press, with the question |
| Model download | The model name only; no folder content | Ollama contacts its own registry (host not verified here) | The download press | none; Privacy lists it as a new outbound row |
| Non-loopback address | nothing | — | Refused in this slice with `notLocalBody` | — |

**Storage.** `vectors.sqlite` sits beside `search.sqlite`, one row per passage: the
passage's SHA-256, its file and lines, and its vector. It is keyed by the model
name and dimension; a different model or dimension starts a new file. It is
derived and rebuildable, private to the user account, never in the vault or Git,
and deleted with the index: by Delete, by switching the index off, by taking the
folder off the list, or after 14 days unopened. Settings shows its own size row
and its own Delete, because preparing again costs up to an hour at 50k files.
Vectors can reveal parts of the text they came from, and the switch caption says
so.

**Security.**
- Vault text is hostile. It travels only as JSON string values to a model with no tools, and the result is numbers. Each response must hold exactly one finite vector per input, all of one dimension, in at most 4 MiB.
- A passage is at most 2,000 characters, and a file contributes at most 500 passages; the rest of the file is counted "not prepared".
- A batch holds at most 32 passages and 64 KiB, with one request in flight, a 120 s timeout for a batch (a cold model load) and 10 s for a query.
- The address check is the existing `normalize_base_url` plus a loopback-only rule. A planted passage can only rank itself; it is shown as a lead with its path, for the person to judge.

**Memory (50k files, app process, budgets).**
- Steady, with search by meaning in use: ≤ +25 MB. This is a 1-bit copy of every vector, about 128 B per passage; 86k–143k passages need 11–18 MB, and the int8 vectors stay on disk for rescoring.
- Steady after 10 minutes without a meaning search: ≤ +2 MB.
- Peak while preparing: ≤ +64 MB.
- Peak during a query: ≤ +30 MB.
- Ollama's own process holds the model separately, about 1.2–2 GB for bge-m3 (not measured). The Settings size row does not count it.

## States

| State | Web | macOS app |
|---|---|---|
| Empty: not set up | Out of scope: no index on the web (`ARCHITECTURE.md:213-214`); see Web row | `meaning.setup` in the desk head; press opens the dialog |
| Empty: folder has no `.md` files | Out of scope: as above | `meaning.noFiles`; setup button disabled |
| Runner not reachable | Out of scope: as above | Dialog `meaning.noRunnerBody`; **Check again**, **↗ ollama.com** |
| Runner up, no embedding model | Out of scope: as above | Dialog `meaning.noModelBody`; `meaning.downloadAndPrepare` |
| Address not on this computer | Out of scope: as above | Dialog `meaning.notLocalBody`; nothing sent; the person changes it in Agents › Models |
| Loading: model downloading | Out of scope: as above | `meaning.downloading` with percent; Stop; on failure `meaning.downloadFailed`, Download again |
| Loading: preparing | Out of scope: as above | `meaning.preparing`; Stop; Find evidence still works |
| Partial: stopped | Out of scope: as above | `meaning.stopped`; **Resume** |
| Partial: files over the passage cap | Out of scope: as above | Coverage line counts them as not prepared |
| Ready | Out of scope: as above | `meaning.ready`; leads carry `meaning.reason*` labels |
| Out of date | Out of scope: as above | `meaning.updating` while N > 0; search uses prepared passages, drops stale hits |
| Error: runner down at search | Out of scope: as above | Word results plus `meaning.runnerDown`; search again |
| Error: model removed from Ollama | Out of scope: as above | Word results plus `meaning.modelMissing`; Download again or choose another model (prepares every file again) |
| Error: cache write failed or index unavailable | Out of scope: as above | `meaning.writeFailed`; Resume |
| Error: audit log unwritable | Out of scope: as above | `meaning.auditBlocked`; nothing sent; Resume |
| Search index switched off | Out of scope: as above | `meaning.indexOff`; **Open Settings** |
| Untrusted volume (no change time, per #3607) | Out of scope: as above | Works; `meaning.untrustedDrive` once; every update reads each file again and compares passage hashes |
| Web playground | `meaning.web` under the question field; no setup button; `DEGRADED_SURFACES` entry pointing to `/download` | Out of scope: web-only row |
| Windows app | Out of scope: web | Same cells as macOS; Ollama for Windows uses the same address; proof is Windows CI only, no Windows walk |
| Largest measured vault (50k files) | Out of scope: as above | Same cells; preparation ≤ 60 min; query p95 ≤ 300 ms |

## Copy

The ko, ja and zh strings live in `messages/<locale>/` once the building slice adds them; this spec keeps the English source.

The keys go in `messages/<locale>/library.json` under `questionDesk.meaning`, and
in `settingsPrivacy.json` under `storedHere`. Under the brief's no-repository-write
limit they are written here, not into the catalogues; the build slice S6 or S7
writes them.

| Key | Where | en |
|---|---|---|
| `meaning.setup` | desk head button | Set up search by meaning |
| `meaning.info` | info tooltip | Semantic search (embeddings). Finds passages that say the same thing in other words or in another language. |
| `meaning.dialogTitle` | dialog title | Search by meaning |
| `meaning.dialogBody` | dialog | Ollama on this computer reads each passage of the {files, number} Markdown files in this folder and stores a list of numbers for it in this computer's cache folder. Nothing leaves this computer. |
| `meaning.prepare` | dialog primary | Prepare {files, number} files |
| `meaning.noModelBody` | dialog | Ollama is running but has no model for search by meaning. Atlas can ask Ollama to download bge-m3 (MIT licence) from Ollama's library. Your files are not sent. |
| `meaning.downloadAndPrepare` | dialog primary | Download bge-m3 (1.2 GB) and prepare |
| `meaning.noRunnerBody` | dialog | Atlas could not reach Ollama at {address}. Install or start Ollama, then press Check again. |
| `meaning.checkAgain` | dialog | Check again |
| `meaning.notLocalBody` | dialog | The model address {address} is not on this computer. In this version, search by meaning sends passages only to a model on this computer. Change the address in Agents › Models. |
| `meaning.downloading` | desk head | Ollama is downloading bge-m3 · {percent, number}% |
| `meaning.downloadFailed` | desk head | Ollama could not download bge-m3: {detail}. Check the internet connection and press Download again. |
| `meaning.preparing` | desk head | Preparing search by meaning · {done, number} of {total, number} files · about {minutes, number} min left |
| `meaning.stop` / `meaning.resume` | desk head | Stop / Resume |
| `meaning.stopped` | desk head | Stopped at {done, number} of {total, number} files. Search by meaning covers those files; Resume continues from there. |
| `meaning.ready` | desk head | Searching by words and by meaning · {files, number} files |
| `meaning.updating` | desk head | Updating {count, number} changed files for search by meaning |
| `meaning.runnerDown` | result notice | Ollama did not answer, so these results match words only. Start Ollama and search again. |
| `meaning.modelMissing` | result notice | {model} is no longer in Ollama, so these results match words only. Download it again, or choose another model and prepare every file again. |
| `meaning.reasonWords` / `reasonMeaning` / `reasonBoth` | lead label | Same words / Similar meaning / Same words and similar meaning |
| `meaning.coverage` | coverage line | By meaning: {ready, number} of {total, number} files prepared |
| `meaning.zeroBoth` | zero result body | No passage in the files searched matches these words or this meaning. This result does not establish an answer. |
| `meaning.noFiles` | desk head | This folder has no Markdown files to prepare. |
| `meaning.indexOff` | desk head | Search by meaning needs the search index, which is off in Settings › Privacy · data. |
| `meaning.untrustedDrive` | desk head, once | This drive does not record file changes reliably, so Atlas reads every file again before each update. Updates take longer here. |
| `meaning.writeFailed` | desk head | Could not save search by meaning in this computer's cache folder: {detail}. Free some space and press Resume. |
| `meaning.auditBlocked` | desk head | Atlas could not write the sent log in .ontology-atlas, so nothing was sent to Ollama. Check that folder's permissions and press Resume. |
| `meaning.web` | web desk | Search by meaning works in the installed app, where a model on your computer prepares the files. Here, search matches words. |
| `storedHere.meaningLabel` | Settings row | Search by meaning |
| `storedHere.meaningSize` | Settings row | {size} for this folder, prepared with {model}. Delete removes it; preparing again takes about {minutes, number} min. |
| `storedHere.switchCaption` (appended sentence) | Settings caption | With search by meaning, the index also holds a list of numbers for each passage, from which parts of its text can be guessed. |

## Edge cases

- **Zero files:** the button is disabled with `meaning.noFiles`.
- **One file:** prepares in one batch; Ready.
- **50k files:** budgets above. The 100k files the derived-index record measured are not a target in this slice.
- **First run:** the setup button shows but never pops up on its own. The dialog opens only on a press.
- **Hangul:** questions and passages are NFC-normalised before hashing and embedding (macOS file names arrive as NFD). Find evidence does not fire while an IME is composing. The labelled set includes Korean and mixed questions.
- **Moved or renamed folder:** the index key is the canonical path (`ARCHITECTURE.md:183`), so preparation starts again and the dialog says how many files.
- **Unreadable folder:** the index's Unreadable state, and no preparation.
- **Two edits at once:** a passage is checked by hash when it is shown. One that no longer matches its file is dropped and counted as changed.
- **Two app windows, or a desk search during a build:** one build per folder (the index writer lock); searches read beside it.
- **Offline:** loopback preparation and search work. The model download fails with `meaning.downloadFailed`, and the typed question stays in the field.

## Out of scope

- **The Library search field, related pages, and MCP `find_evidence`:** each needs vectors to exist first, and the first two need an interaction or moment not yet observed.
- **Non-loopback runners and API keys:** they send the whole folder's text, and the consent design ships separately.
- **A built-in or downloaded model:** a new runtime and a new outbound host. Later #1.
- **Embedding PDFs and other non-Markdown sources:** the index admits `.md` only (`lib.rs:1-6`).
- **ACP query rewriting and reranking:** they send the question or passages to a provider. Investigate sources stays the agent path.
- **Sharing vectors between folders, or carrying them over a rename:** this breaks per-folder delete semantics.

## Acceptance criteria

1. **Baseline captured, quality gained.** Given a committed labelled fixture vault (≥ 300 pages; 60 questions: 20 Korean, 20 English, 20 paraphrase or cross-language), plus 10 questions the owner asks of their own largest wiki and captures in the installed app today. When `pnpm perf:meaning-quality` runs word-only and then word plus meaning. Then recall@8 rises by ≥ 15 points overall and ≥ 30 on the cross-language subset, and the exact-term subset loses ≤ 2 points. The capture, the script output and the owner-question results are attached to the PR.
2. **One press from today's owner state.** Given an installed app on a scratch HOME, a 10k-file vault and Ollama running with no embedding model. When the person presses Set up search by meaning, then Download bge-m3 and prepare. Then with no other input the desk reaches `meaning.ready` in ≤ 15 min after the download. Stop, and quitting the app, both resume with zero passages sent twice (sent count = remaining). Installed-app walk with capture.
3. **Recovery.** Given a build killed mid-batch 20 times. When the app reopens each time. Then the next open's vectors equal a build from scratch, and `quick_check` is ok (`src-tauri/crates/vault-index/tests/vectors.rs`).
4. **Scale.** Given 50k files (the `perf:vault-open` shapes). When `pnpm perf:meaning -- --files=10000 --files=50000` runs. Then preparation is ≤ 60 min at 50k with bge-m3 on the owner's M2 Max; `vectors.sqlite` is ≤ 0.6 × the vault's text; query p95 is ≤ 300 ms with the model loaded (1,000 queries, embedding included); and the app's footprint is steady ≤ +25 MB and peak ≤ +64 MB while preparing (physical footprint, measured).
5. **Nothing leaves; every send is logged.** Given the address `https://example.com`, a symlinked audit log, and a runner that returns NaN, a wrong dimension or 5 MiB. When preparation or a search runs. Then no request leaves for the remote address, nothing is sent while the log is unwritable, and every bad response is refused with no vector stored. A run writes its `embed-build` line before its first request and closes it after; a press writes one `embed-query` line (`src-tauri/src/llm/embed/tests.rs`).
6. **Incremental and fresh.** Given a prepared vault. When one file is edited, then another is renamed, then a third is deleted. Then only the edited file's changed passages are sent, the rename sends nothing, and a search between the edit and the update never shows a passage the file no longer holds (`tests/vectors.rs`).
7. **States that fail softly.** Given Ollama stopped, the model removed, or the index switched off. When the person presses Find evidence. Then word results arrive within today's time plus 10 s at most, with `meaning.runnerDown`, `meaning.modelMissing` or `meaning.indexOff` (`tests/e2e/library/question-desk-meaning.spec.ts`, with a bridge stub).
8. **Settings and web.** Given a prepared folder. When the person presses Delete under Search by meaning. Then the file is gone, the size row reads Nothing stored, and the 14-day sweep covers `vectors.sqlite` (`StoredHereSettings.test.tsx`, crate `tests/global.rs`). On the web the desk shows `meaning.web`, and its `DEGRADED_SURFACES` entry opens `/download` (`tests/e2e/web-surface-smoke.spec.ts`).

## Risks

1. **Preparation is too slow at 50k, and people stop it and never resume.** Probe: measure bge-m3 through Ollama on the M2 Max with the S2 harness before any UI work (S3). If it misses 60 min, try qwen3-embedding:0.6b at 512 dims or larger passages, chosen by measurement. Design choice: wiki pages first, so the desk improves within minutes.
2. **The gain shows on the fixture but not on the owner's real Korean wiki.** Probe: the 10 owner questions in AC1 are their own. If hybrid recall on them is not better than word-only, the slice does not ship, and the result decides between bge-m3, a Korean fine-tune (KURE-v1, MIT) and qwen3-embedding.
3. **Disk and memory grow past what the owner accepts:** FTS 0.45 × text, rows 0.39, vectors 0.6, plus Ollama's 1.2–2 GB. Probe: S4's bench measures the file and footprint before wiring. Design: the 1-bit copy in memory with int8 vectors on disk, dropped after 10 idle minutes, and its own Delete row.

## Later

1. **A built-in model downloaded on the first press** (multilingual-e5-small int8, MIT, 135 MB, from a pinned Hugging Face revision with SHA-256; `candle` or `ort`, whichever adds ≤ 25 MB). Next once one person without Ollama hits `noRunnerBody`, or the runtime-size probe passes.
2. **"Similar meaning" in the Library search field on Enter, plus related pages in the wiki page header.** Next once AC1 passes.
3. **An agent offers other wordings for a zero result (ACP, sends only the question).** Next if zero results stay frequent on the owner's wiki.
4. **MCP `find_evidence` by meaning.** Next once a decision lets the bundled MCP read `vectors.sqlite` read-only, and an agent task shows the need.
5. **Remote runners and API keys, with consent per run** stating the file count and characters. Next on a request from a person without a local GPU.
6. **Carry vectors over a folder rename.** Next on the first report of re-preparing.

## Owner question

None. Decided: loopback only and bge-m3 by default, pulled into the person's Ollama with one press. To reverse, the Later #1 and #5 slices widen the sources, and the default model is one constant chosen by the AC1 measurement.

## Build slices (for the planner)

All slices are owned by Opus. S4 and S5 wait for #3607 to merge, because they extend its `Store` lifecycle and per-volume stamp trust.

| # | Slice | Owns (disjoint) | Budget | Acceptance | Review |
|---|---|---|---|---|---|
| S1 | Decision record: loopback-only embeddings, `vectors.sqlite` in the derived index, `embed-build`/`embed-query` audit lines, model pull as an outbound row, no dedicated MCP | `docs/records/decisions/<new>.md` (`pnpm record:new`) | 0.5 d | Names prior `183a2c12`, decision 52, and the 2026-08-01 "door" record; a falsifier per budget | one `reviewer` (one-way: what leaves the machine) |
| S2 | Labelled fixture, quality and throughput harness, word-only baseline, owner capture | `tests/fixtures/meaning-search/**`, `scripts/perf/meaning-quality.mjs`, `scripts/perf/perf-meaning.mjs`, `package.json` script lines, `README.md` command rows | 1.5 d | AC1 baseline numbers; harness runs on the M2 Max | — |
| S3 | Rust embedding client: loopback rule, `/v1/embeddings` batches, response validation, Ollama `/api/version` and `/api/pull` progress, audit lines | `src-tauri/src/llm/embed.rs`, `src-tauri/src/llm/embed/**`, one `mod` line in `src-tauri/src/llm.rs` | 2 d | AC5; measured bge-m3 throughput reported before S5 | `reviewer`, security lens |
| S4 | Vector store in the crate: passages (heading split, ≤ 2,000 chars, NFC, SHA-256), content-addressed rows, int8 plus a 1-bit copy, KNN, lifecycle, sweep, bench | `src-tauri/crates/vault-index/src/{vectors,passage}.rs`, `sql/vectors.sql`, `tests/vectors.rs`, `tests/global.rs` additions, bench bin; the `lifecycle.rs`/`lib.rs` registration lines | 3 d | AC3, AC6, and AC4's file-size and memory parts | `reviewer` (algorithmic code, `architecture.md`) |
| S5 | App wiring: commands (status, prepare, stop, search), background build ordered wiki first, watcher updates, TS bridge | `src-tauri/src/vault/meaning.rs`, its registration in `src-tauri/src/lib.rs`, `src/shared/lib/vault-folder/tauri-vault-meaning.ts` (+ test) | 2 d | AC2 timing, and AC4 p95 and preparation time | — |
| S6 | Desk: setup button and dialog, progress, RRF fusion, reason labels, coverage line | `src/features/library/lib/questions/meaning-fusion.ts` (+ test), `question-desk.ts`, `LibraryQuestionDesk.tsx`, new `parts/questions/MeaningSetup.tsx`, `messages/{en,ko,ja,zh}/library.json` | 3 d | AC7 and the desk part of AC2 | `/ui-build` with `pnpm ui:look` per slice; `reviewer` for the fusion |
| S7 | Settings row and caption, outbound row, web degradation, docs | `StoredHereSettings.tsx` (+ test), `messages/{en,ko,ja,zh}/settingsPrivacy.json`, `outbound-paths.ts`, `tests/e2e/web-surface-smoke.spec.ts`, `docs/ARCHITECTURE.md`, `docs/features/library/one-home.md`, `docs/FEATURES.md` | 1 d | AC8 | `/ui-build` (Settings pane) |
| S8 | Acceptance: installed-app walk on a scratch HOME, AC1 on the owner's wiki, AC4 at 10k and 50k, Windows CI | no product files; evidence attached to the PR | 1 d | every AC reported, with limits | — |

Order: S1 and S2 first and in parallel, then S3. S4 follows once #3607 merges, and S6's UI can start against a bridge stub alongside it. Then S5, S7 and S8.

## Revisions

- 2026-11-19: first draft. Loopback Ollama runner, vectors in the derived index, no dedicated MCP server, no sqlite-vec.
- 2026-11-19: owner decisions. A built-in model downloads on one press after a consent dialog. It is the most compressed bge-m3 file that keeps fp32 quality, uses 1–2 GB of memory while preparing, and ships with MIT attribution and the paper citation.
