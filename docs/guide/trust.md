---
title: "Data, privacy and safety"
doc_type: guide
status: current
area: product
---

# Data, privacy and safety

Where does your data live when you use Ontology Atlas? This chapter answers
that, and covers what can leave your computer and when, how coding agents
connected over MCP fit in, and how to check that the app you downloaded is the
one we built. You can check every statement here in the public source code.

## The short version

- Your ontology is plain Markdown in a folder you choose. Atlas does not upload
  it.
- Atlas has no backend server, no account and no telemetry.
- The app connects to the internet only through the paths listed below, and
  most of them run only when you press a button.
- A coding agent you connect is a separate program. It may send your prompts and
  what it reads to its own provider, and Atlas cannot see or log that traffic.

## What stays on your computer

- **The ontology folder.** The Markdown files are the only source of truth. If
  you delete the app, the folder stays, and any editor or script can still read
  it.
- **`.ontology-atlas/` inside the folder.** Folder settings and the transfer log
  described below. Git leaves this folder out by default.
- **The app's search index.** On by default in the app. It is built from the
  folder's files, kept in your computer's cache folder, and never sent
  anywhere. Turn it off or delete it in Settings, under **Privacy · data** ›
  **Stored on this computer**.
- **API keys for model providers** (app only). They are kept in the operating
  system's credential store, such as the macOS Keychain. The browser version
  does not accept keys at all.
- **Small preferences**, such as the list of recent folders. The browser keeps
  only a handle to the folder you opened, so it can offer that folder again.

Atlas reads only the folders you choose. When it reads a folder, it skips
dotfiles and dot folders such as `.env` and `.git/`.

## What can leave your computer

The app lists every outbound path in Settings, under **Privacy · data** ›
**Outbound transfers**. They are:

| Path | When | Goes to | Folder content? |
|---|---|---|---|
| Update check | Automatic, can be turned off | ontologyatlas.com | No |
| Update download | When you press it | github.com | No |
| Model providers | When you press it | Anthropic, OpenAI or Google API | What you send |
| Local model server | When you press it | The address you entered | What you send |
| External model review | When you press it | api.typesafe.ai | What you send |
| Coding agent installs | When you press it | nodejs.org, npm registry | No |
| ACP adapter packages | When you press it | npm registry, PyPI | No |
| GitHub PR descriptions | When you press it | api.github.com | No |
| Git push, pull and fetch | When you press it | Your Git remote | What you send |
| MCP servers you add to the folder | When an agent uses them | Their addresses | Sent by the agent |
| Coding agents | When an agent works | The agent's own provider | Atlas does not see it |

Atlas records each model call it makes, including calls to a local model
server, in `.ontology-atlas/llm-audit.jsonl` in the folder. To turn off the
automatic update check, use Settings › **About** › **Check for updates
automatically**.

The browser version loads only the website's own files from ontologyatlas.com.
It reads your folder on your computer and never uploads it.

## Coding agents and MCP

The Atlas MCP server is not a service that keeps running. Your coding agent
starts it on your computer when it needs it, talks to it over standard input
and output (stdio), and stops it when the session ends. The server opens no
network port and makes no network request.

The agent itself is a different matter. Claude Code, Codex, Cursor and other
agents send your prompts and the files they read to their own providers. That
traffic belongs to the agent, follows the agent's own settings, and does not
appear in Atlas's log.

Who approves a write depends on where the agent runs:

- **In the app's agent chat**, each file edit and each Atlas write waits for you
  to press **Allow once** or **Deny**, unless you turn on **Auto-approve** for
  that folder. Shell commands, deletions and paths outside the folder always
  ask first, except reading a file of the folder's connected code folder.
- **An agent connected over MCP** in its own terminal or editor writes under
  that tool's permission rules, not Atlas's.

In both cases the change is a Markdown diff in your folder, so you can review or
revert it in Git.

## Check the app you downloaded

- **macOS**: the app is signed with an Apple Developer ID and notarized by
  Apple. Before a build is published, the release process verifies the signed
  disk image and the installed app. A build that fails does not become a
  release. In-app updates are signed as well.
- **Windows x64 beta**: the installer is not signed, so SmartScreen may show an
  unknown-publisher warning, and a managed computer may block it. Before
  release, the build is scanned with Microsoft Defender, installed silently,
  and launched.
- **Linux**: there is no app yet. Use the browser version, or run the MCP server
  from source ([Connect a coding agent](/guide/connect-agent)).

On the [releases page](https://github.com/wlsdks/ontology-atlas/releases),
each installer (`.dmg`, `.exe`) and the MCP bundle (`.mcpb`) has a `.sha256`
file beside it. Compare that value with the checksum of the file you
downloaded.

On macOS:

```sh
shasum -a 256 <file>
```

On Windows, in PowerShell:

```powershell
Get-FileHash <file> -Algorithm SHA256
```

## Open source

The app and the MCP server are in one public repository under the MIT
license: [github.com/wlsdks/ontology-atlas](https://github.com/wlsdks/ontology-atlas).
The outbound paths listed above come from one file in the source,
[outbound-paths.ts](https://github.com/wlsdks/ontology-atlas/blob/main/src/widgets/app-settings-menu/model/outbound-paths.ts).
To report a security problem, follow
[SECURITY.md](https://github.com/wlsdks/ontology-atlas/blob/main/SECURITY.md).
