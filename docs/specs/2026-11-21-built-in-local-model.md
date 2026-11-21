---
title: A built-in local model for people without a coding agent
doc_type: spec
status: draft
area: agents
date: 2026-11-21
decisions: []
---

# A built-in local model for people without a coding agent

## Person and moment

A person opens Atlas on a laptop with no Claude Code, Codex or Ollama. They
read a wiki someone else built, or a folder they keep by hand. On the Wiki tab
the question desk finds eight passages by words and by meaning, and stops there:
the person still has to read all eight to get the answer. On the map they open a
concept whose page is long and in another language. On the Changes tab the
period explanation needs a "local model server" they have never heard of.

The owner's request (2026-11-21): download a light local model from inside
Atlas, recommended for this computer's hardware, on Mac and Windows, licensed
for redistribution, with no separate tool. It is not for building the ontology:
construction stays with Codex and Claude Code, for quality. The owner asked what
such a model should do; this spec answers that first.

## What the model does, and what it never does

The rule that picks every job: **Atlas chooses the evidence, the model only
words it.** A 2–4 B model is unreliable at deciding what is true and good at
rewording a short, given text. Each job below hands it a bounded input that
Atlas already selected, and checks its output against that input.

| Job | Where | Input Atlas selects | Output and its check |
|---|---|---|---|
| 1. Answer draft | Wiki question desk, after Find evidence | The question and the found passages (at most 8, 6 KiB) | 2–4 sentences, each ending with passage numbers `[1]`; a sentence citing nothing, or a number not shown, is dropped; no support → "The found passages do not answer this" |
| 2. Plain summary | Concept panel and document reader | One concept page or document, first 6 KiB | 3 lines, labelled as a summary of this page; the page stays one press away |
| 3. Reading translation | Document reader | The open document, by section | Shown beside the original, never saved |
| 4. Period explanation | Changes tab | The commit and PR text the tab already reads | The existing local-model explanation, without Ollama |
| 5. Path in words | Map, an existing path between two concepts | The relation chain `find_path` returned | One sentence per hop, naming only those concepts and relation types |

Never: propose, create, rename or relate concepts; approve anything; write to
the vault; run tools; read files the job did not hand it. Construction rows in
the Agent panel do not list the built-in model. Every output is marked as a
draft from the local model, with the model's name.

Order: job 1 first (it completes the question desk, the Library's main seat),
then 4 (an existing feature loses its Ollama requirement), then 2 and 3, then 5.

## Recommended for this computer

Rust reads, without any network: total memory (`sysctl hw.memsize` on macOS,
`GlobalMemoryStatusEx` on Windows), whether the chip is Apple silicon
(`hw.optional.arm64`), and free disk on the app data volume (already read for
bge-m3). Windows runs on the processor: candle's Windows GPU paths would mean
shipping CUDA, which this spec does not do.

| This computer | Recommended | Download (approx.) | Memory while answering (approx.) |
|---|---|---|---|
| Under 12 GB, or Windows under 16 GB | Small (1.7 B) | 1.1 GB | 2 GB |
| 12–24 GB Apple silicon, or Windows 16 GB+ | Standard (4 B) | 2.5 GB | 3.5 GB |
| 24 GB+ Apple silicon | Large (8 B) | 5 GB | 6.5 GB |

The figures are placeholders until acceptance criterion 2 measures them. After
download, **Measure on this computer** runs a fixed 20-second prompt and shows
words per second and peak memory; under 6 words per second it recommends the
next smaller model.

## Candidates

Licence: Apache-2.0 or MIT only. Runtime: candle, already shipped for bge-m3
(MIT/Apache), so no new engine. Provenance: files from the model maker's own
organisation, pinned by commit and SHA-256, as bge-m3 is
(`docs/records/decisions/2026-11-19-built-in-model-downloads-after-consent-9e9ebc55-dcb9-4ec0-b1e7-1103853b3072.md`).

| Candidate | Licence | Runs in candle 0.11.1 | Maker's own quantised file |
|---|---|---|---|
| Qwen3-1.7B | Apache-2.0 | yes, `quantized_qwen3` | yes, `Qwen/Qwen3-1.7B-GGUF` |
| Qwen3-4B (instruct mode, thinking off) | Apache-2.0 | yes, `quantized_qwen3` | yes, `Qwen/Qwen3-4B-GGUF` |
| Qwen3-4B-Instruct-2507 | Apache-2.0 | yes | none found; community GGUF only, or the maker's 8 GB weights quantised here |
| Qwen3-8B | Apache-2.0 | yes | yes, `Qwen/Qwen3-8B-GGUF` |
| Gemma 4 E4B | Apache-2.0 | yes, `gemma4`, unquantised only | no quantised path in candle; heavier |
| Qwen3.5 4B | Apache-2.0 | no (new architecture) | would need a second runtime |

Excluded: Llama (community licence), anything without a licence file at the
pinned commit, and Qwen3.8 (no small sizes).

## Flow

1. A job's press (for example **Draft an answer** under the desk's results)
   opens the model dialog when no local model is ready. The dialog has the same
   shape as the meaning-search model dialog: models on the left, the chosen
   one's facts and presses on the right, the recommended one marked
   **Recommended for this computer** with the reason ("16 GB memory, Apple M2").
2. Facts before the press: what the model does in Atlas (the job list in one
   sentence each), maker and licence, download size and hosts, size kept,
   memory while answering, that nothing from the folder is sent, where it is
   kept.
3. **Download** fetches the pinned files with progress in the long-work seat;
   the person keeps working. When it finishes, the job that asked runs.
4. The same dialog, opened from a **Model: Qwen3 4B** chip next to every job's
   press and from Settings › Models, switches models, measures, shows the
   folder, and deletes in one press, stating the space freed.

## Design and usability

The owner weighs design and usability as heavily as the feature (2026-11-21).
A model nobody notices, or one whose purpose nobody can name, is a failed
feature. Each rule below can fail in a capture or a five-second test.

- **Seen where it is used.** Every job's press sits where the person already
  is (under the desk's results, in the concept panel, beside a document), with
  the model chip beside it. Nothing about the model is reachable only through
  Settings.
- **Named by what it does.** The press says the outcome ("Draft an answer from
  these passages"), never the mechanism ("Run local LLM"). The dialog's first
  line says what the model does in Atlas before any size or licence.
- **One recommendation, with its reason.** The dialog marks one model and says
  why in the person's terms ("This Mac has 16 GB memory"). The others stay one
  press away. Nobody has to compare parameter counts.
- **Every press states its result before it.** Download says size and time;
  delete says the space freed and what stops working; switching says what is
  prepared again. Each action takes one press after that sentence.
- **Never a silent wait.** An answer streams word by word into its final
  place, a loading model says "Loading the model, about 5 s", and a download
  moves to the long-work seat so the person keeps working. No modal blocks
  input while the model works.
- **A draft looks like a draft.** Generated text wears the draft treatment and
  the model's name; its citations open the passage they cite. It never looks
  like a page the person wrote.
- **Short, core first.** The answer card shows the answer and its citations;
  regeneration, copy and the model sit in one quiet row under it. No
  disclosure chevrons; detail opens in the centered dialog.
- **Motion.** Streaming text, the progress ring and the dialog's panes move
  with the existing tokens, every frame under 50 ms, with a reduced-motion
  equivalent.
- **Proof.** Each slice is built through `/ui-build` and looked at with
  `pnpm ui:look`, in Korean and English, at 1440 and phone width. Before a
  slice ships, a person who never saw it gets a five-second test: what the
  press will do, and which model it uses.

## States

Not downloaded · Downloading (bytes) · Checking · Ready · Answering (streaming
words) · Stopped by the person · Failed (download, check, memory, could not
start) · Deleted. A job never waits silently: an answer streams, and a model
still loading says so.

## Edge cases

- Memory pressure: the worker process loads the model on first use and exits
  after 5 idle minutes, like the bge-m3 worker; a load that would leave under
  1.5 GB free is refused with the figure.
- Two jobs at once: one queue, the second shows "waiting for the answer above".
- A Windows machine with 8 GB: Small only; Standard is listed but not
  recommended, with the reason.
- Offline after download: every job works; only Download needs the network.
- The person deletes the model mid-answer: the answer stops and says why.

## Out of scope

Ontology construction, relation proposals, tool use, chat with the vault, any
cloud model, fine-tuning, user-supplied model files, GPU on Windows.

## Acceptance criteria

1. On a real 60-page Korean and English wiki, job 1 answers 30 sealed
   questions: at least 90% of kept sentences are supported by the passage they
   cite (a person checks), and the model says it cannot answer on every question
   whose passages do not hold the answer.
2. Each candidate is measured on an M-series 16 GB Mac and on the Windows CI
   runner: words per second, time to first word, peak memory, Korean answer
   quality on the same 30 questions. The table above takes those numbers, and
   the recommendation thresholds come from them.
3. Nothing is downloaded before the dialog's press; a byte from a host other
   than the pinned ones stops the download; a file whose SHA-256 differs is
   deleted.
4. Delete in the dialog frees the stated bytes in one press, and every job's
   press then offers the download again.
5. With the model loaded and idle for 5 minutes, the app's memory returns to
   within 50 MB of its level before loading.

## Owner decisions (2026-11-21)

- Job 1 (answer draft) and job 4 (period explanation) come first.
- The standard model is Qwen3-4B from the maker's own GGUF, thinking switched
  off, rather than the newer 2507 release from a community file. Measurement
  (acceptance criterion 2) can still overturn it.
- Design and usability carry the same weight as the jobs ("Design and
  usability" above).

## Revisions

- 2026-11-21: first draft from the owner's request; jobs, hardware tiers and
  candidates before measurement.
- 2026-11-21: owner approved the job order and the standard model; added the
  design and usability rules.
