---
title: "Getting started"
doc_type: guide
status: current
area: product
---

# Getting started

Start here to get your own ontology folder onto the map, then give a coding
agent such as Claude Code or Codex its first task with it. You can start in the
desktop app or in the browser.

## Choose the app or the browser

- **The app** is the full product. Download it from
  [ontologyatlas.com](https://ontologyatlas.com/en/download/). The macOS build is
  for Apple Silicon and is signed and notarized. The Windows x64 build is an
  unsigned beta, so SmartScreen may warn before it runs.
- **The browser version** needs no install. It opens a sample map right away,
  and in Chrome or Edge it can also open a folder from your disk. Firefox and
  other browsers without folder access show the sample and a link to the app.

Some things work only in the app: reopening your folder without asking for
access again, Git
history, the agent chat beside the map, model API keys, and registering the MCP
server with your coding agent in one click.

## Look at the sample map (browser)

Without a folder, the browser shows a sample marked **Sample for now**. You can
switch between two samples:

- **Online store**: products, orders, members and delivery. Use it to learn how
  to read the map with names everyone knows.
- **This app's code**: the real ontology of the Ontology Atlas repository, built
  and maintained by people and agents.

The card shows the sample's size in concepts, relations and domains. Click a
concept: the lines to what it depends on and to what uses it light up, and a
panel names them. [Reading the map](/guide/reading-the-map) explains the rest.

## Open or create your ontology folder

### In the app

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

### In the browser

Press **Open a folder**. A short guide explains what happens, then offers
**Choose existing folder** or **Start fresh with an empty folder**. After you
pick, the browser asks you to allow access. That permission lets the page read
the folder on your computer. Nothing is uploaded.

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
covers each agent, connecting from the browser, and checking the connection.

If your folder has no concepts yet, let the agent draft them from your code:
[Build the first map from your code](/guide/from-your-repo).

## Read next

- [What is an ontology?](/guide/what-is-an-ontology), if the word is new to you.
- [Reading the map](/guide/reading-the-map).
- [Data, privacy and safety](/guide/trust): what stays on your disk and what can
  leave it.
