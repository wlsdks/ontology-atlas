---
title: "Getting started"
doc_type: guide
status: current
area: product
---

# Getting started

Start here to get your own ontology folder onto the map, then give a coding
agent such as Claude Code or Codex its first task with it. You do this in the
desktop app.

## Get the app

Download it from [ontologyatlas.com](https://ontologyatlas.com/en/download/).
The macOS build is for Apple Silicon and is signed and notarized. The Windows x64
build is an unsigned beta, so SmartScreen may warn before it runs.

The app reads your folder in place, reopens it next time without asking again,
shows Git history, runs the agent chat beside the map, keeps model API keys in
your system's credential store, and registers the MCP server with your coding
agent in one click. A web page opens none of your folders, so ontologyatlas.com
only introduces Atlas and hands over the app.

There is no app for Linux or an Intel Mac. There, look at the sample map below,
or run the MCP server from a source checkout:
[Connect from a source checkout](/guide/connect-agent).

## Look at the sample map

Before you install, [the sample map](https://ontologyatlas.com/en/sample/) shows
what Atlas draws. It is an online store: products, orders, members and
delivery, with names everyone knows. It is read-only and opens no folder.

Click a concept: the lines to what it depends on and to what uses it light up,
and a panel names them. [Reading the map](/guide/reading-the-map) explains the
rest. In the app, Atlas draws your own code this way from the Markdown files in
your folder.

## Open or create your ontology folder

With no folder open, the app shows four ways to start:

- **Start from a code project**: choose your code folder. Atlas shows the path
  and asks **Create the ontology folder inside this code folder?** Press
  **Create** and it makes an `atlas` folder there. Your code stays as it is. If
  a coding agent is ready in the app, the agent then reads the code and writes
  a first map.
- **Create in home folder**: creates a new folder under `Ontology Atlas` in your
  home folder, without asking you to pick one.
- **Open a folder**: pick an existing Markdown folder.
- **Start in an empty folder**: pick an empty folder and Atlas adds starter
  Markdown files and agent settings.

The two "create" choices first ask **What will this folder hold?**: **A
documents wiki**, **A map of your code**, or **Both**. You can add the other part
later from Settings.

### What Atlas does with the folder

Any Markdown folder works. A file whose frontmatter (the info block at the top)
has a `kind:` line becomes a concept on the map. Other Markdown files stay
ordinary documents. Opening a folder does not move or rename any file.
[The ontology folder](/guide/vault-structure) describes the layout.

## Take the first step with a coding agent

The map is most useful when your coding agent reads it before a task. To
connect one in the app:

1. Open **Agents**, then the **MCP** tab.
2. Press **Connect** for your agent. For Claude Code, Atlas writes `.mcp.json`
   into the folder. For Codex, it writes `.codex/config.toml`. Cursor and
   Antigravity are listed too.
3. Quit and reopen that agent.
4. Ask the agent about your next task, for example: "Before you change checkout,
   read the Atlas concepts it touches and tell me what depends on it."

The agent starts the Atlas MCP server on your computer when it needs it. The
server opens no network port. [Connect a coding agent](/guide/connect-agent)
covers each agent, connecting from a source checkout, and checking the connection.

If your folder has no concepts yet, let the agent draft them from your code:
[Build the first map from your code](/guide/from-your-repo).

## Read next

- [What is an ontology?](/guide/what-is-an-ontology), if the word is new to you.
- [Reading the map](/guide/reading-the-map).
- [Data, privacy and safety](/guide/trust): what stays on your disk and what can
  leave it.
