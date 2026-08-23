# About Trust

It involves pulling binaries from anonymous repositories onto your own computer. Therefore, we start by listing what it does not do.

## It is entirely local

Vault exists only on your disk. Nothing is transmitted silently. There are no accounts, no servers, and no features locked behind a subscription.

## It is plain Markdown

Even if you delete the app, the folder remains. Nothing gets locked. This is not marketing copy; it is a structural fact. Because the storage format is Markdown, there is no way to lock it.

## It does not scan automatically

It reads only the folders you choose. Dotfiles like `.env` and `.git/` are excluded from indexing. It does not look at anything else on your disk.

## LLM connectivity is optional

If disabled, no models are called. If enabled, **what leaves Vault is recorded in the audit log** (`.ontology-atlas/llm-audit.jsonl`). It is plain text, so you can read it directly. API keys are stored in the OS keychain, not in browser storage.

## Signing and Notarization

The macOS app is signed with Apple Developer ID and notarized. It opens without Gatekeeper warnings.

## Open Source

Everything is open. You can verify any of the above statements in the code; claims that cannot be verified are not listed here.
