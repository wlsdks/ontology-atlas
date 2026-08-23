# First Five Minutes

Before deciding whether to install, watch it move first.

## 0. What's on the First Screen

The first screen is a **read-only sample map**. The map moves even before you select a folder. It is not an empty screen telling you to "put data in first."

Choose one of the two samples.

| Sample | What it is |
|---|---|
| **Code for this app** | A map documenting how this tool describes itself. Many developer-facing names appear |
| **E-commerce example** | Practice seeing how products, orders, members, shipping, and marketing connect |

The first run card shows the count of concepts, relationships, and domains together. These numbers are **counted directly from the graph drawn on the current screen**, not taken from some pre-written value.

## 1. Clicking the Map (2 minutes)

Clicking the card's **"2-Minute Tour: How to Read the Map"** starts an eight-step guide. It covers that the map is a document, node size and shape, relationship legend, clicking directly, datasheets, INDEX, and the recent changes lens.

You can skip it. You can restart anytime from the compass tile in the upper-right corner.

If you want to jump straight in without the guide, [How to Read the Map](/guide/reading-the-map) documents these details in text.

## 2. Opening Your Folder

Click **Open My Markdown Folder** and select a folder. The map updates with your data right there.

Which folder to choose:

- If the folder already contains Markdown documents, **that works.** Just pick any one.
- It's fine if there is no `kind:` frontmatter. It will report the number of documents found and suggest **Create Map from My Documents**.
- If there is nothing, start with **Create New Document Folder** to get the starting structure. Five starting nodes will be created.

Files with frontmatter become nodes immediately, while files without it remain just as documents.

**It breaks nothing.** It does not move or rename files. It only reads the frontmatter. If you don't like it, just close the folder and you're done.

### When opening in a browser

It requires file system access permissions, so it works on **Chrome · Edge · Safari 18.2+ · Opera**. Firefox cannot open folders because it lacks this API. In that case, the screen will inform you and guide you to where to get the app.

The folder does not leave the browser.

## 3. Starting from the Codebase (for Developers)

Expand **For Developers** on the first run card to get a command to paste into your terminal.
It scans the repository to create the first graph.

What happens is detailed step-by-step in [Starting from My Repository](/guide/from-your-repo). The scanning phase does not touch Vault.

## 4. What's the Difference Between the App and the Web?

The macOS app is the home base for Vaults. There are things that the browser **cannot do by principle** that only the app can.

| Capability | App | Web |
|---|---|---|
| Vault absolute path | ✓ | Handle only (no path) |
| Remember folder on next visit | ✓ | Choose again |
| Git history & snapshots | ✓ | Not available |
| API key storage | OS Keychain | Not possible by principle |
| Folder watching | OS watcher: updates automatically when saved (a few seconds) | Polling: 1.5–5s, only when tab is visible |
| MCP server | Bundled with app | Requires source checkout |
| Write agent config file | ✓ One click | Generates config text (save manually) |

The last row is often misunderstood. **Agents also attach in the web version.** The only thing the web cannot do is save the config file for you
([Connecting AI Agent](/guide/connect-agent)).

## 5. What's Next?

If you've reached here, the map is drawing your folder. There are two paths forward.

- **If you want to read and judge alone** → [Vault Structure](/guide/vault-structure). See how a single frontmatter line becomes a node.
- **If you want to delegate to an AI agent** → [Connecting AI Agent](/guide/connect-agent).
  This is where the agent doesn't need to receive the same background explanation every session.
