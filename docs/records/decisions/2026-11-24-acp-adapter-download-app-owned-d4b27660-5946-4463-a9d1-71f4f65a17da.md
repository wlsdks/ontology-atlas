---
id: d4b27660-5946-4463-a9d1-71f4f65a17da
date: 2026-11-24
---
## 2026-11-24 — The app owns the ACP adapter download; the person's start of a conversation triggers it

**Why**: owner, 2026-11-24: in-app agents feel weak, and the first download of the pinned npx adapter (`acp-registry.json`) progressed only while the agent panel stayed open. The download ran as the first step of the session's own `npx` process, and unmounting the panel kills that process tree, so leaving mid-download threw the progress away and could leave a half-written `_npx` entry for the doctor's `npx-cache` check.
**Prior**: decision (89) and `surfaces.md` "Installing an agent tool for the user": downloads happen only on a person's action; Node and CLI installs are Rust-owned and outlive the settings sheet. `local-first.md`: no outbound transfer the person did not start.
**Decision**: Rust fetches the adapter into npx's own cache (`npx -y [--before] --package=<pinned spec> -- node --version`, `src-tauri/src/acp/install/adapter.rs`) on a thread the app owns, one per runtime; a second request waits on the one in flight. Only two moments trigger it, both a person's action that already downloaded before this change: a chat panel starting a conversation (`acp_prepare_adapter`, awaited before `acp_start`) and the doctor's `npx-cache` fix. Nothing fetches at app launch, after an update, or on choosing a runtime in settings. Closing the panel never cancels the fetch; the reopened panel and the doctor read its state from the install progress event (`job: "adapter"`) and `acp_install_progress`. No new host: the same pinned spec and `--before` cutoff reach the same npm registry the session's npx used.
**Dissent**: a prefetch at launch or right after a pinned-version bump would remove the wait entirely; it is new traffic the person did not start, so it needs its own owner decision.
**Falsifier**: a byte of the adapter downloads before a conversation start or a doctor fix; leaving the panel mid-download stops the download; two npx downloads of one adapter run at once; a session start downloads the adapter itself after a finished fetch.
**Owner**: Stark
