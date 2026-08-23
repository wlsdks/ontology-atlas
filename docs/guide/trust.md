# About Trust

It involves pulling binaries from anonymous repositories onto your own computer. Therefore, we start by listing what it does not do.

## Local source of truth, explicit provider boundary

The vault's canonical files remain on your disk. Atlas has no backend, account, or telemetry, and opening or editing a folder does not upload it to Atlas.

## It is plain Markdown

Even if you delete the app, the folder remains. Nothing gets locked. This is not marketing copy; it is a structural fact. Because the storage format is Markdown, there is no way to lock it.

## It does not scan automatically

It reads only the folders you choose. Dotfiles like `.env` and `.git/` are excluded from indexing. It does not look at anything else on your disk.

## AI connectivity is optional

Atlas-controlled API and runner calls state and record their destination in `.ontology-atlas/llm-audit.jsonl`. ACP and externally connected MCP agents are a separate boundary: Atlas MCP stays local over stdio, but the selected coding agent may send prompts, context, and tool results to its provider. Atlas does not claim that provider-owned traffic is recorded in its LLM audit log.

## Signing and Notarization

The macOS app is signed with Apple Developer ID and notarized. It opens without Gatekeeper warnings.

## Open Source

Everything is open. You can verify any of the above statements in the code; claims that cannot be verified are not listed here.
