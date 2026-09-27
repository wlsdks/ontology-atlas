---
id: b09605d7-bbba-457c-a2b3-6ceceb6cc926
date: 2026-09-27
kind: mistake
status: reported
harness_area: computer-use
---
**Observed**: `orca computer set-value --value-stdin` returned `ok: true` for the installed app's secure Jev key field, but saving showed a masked tail that did not match the supplied key. A later synthetic typing attempt also left the field with its placeholder text as the stored value. An interactive macOS Keychain update followed by the app's masked-tail readback produced the expected tail. No Jev request was sent.
**Cost**: Two incorrect local Keychain writes and several extra UI/terminal calls; wall time unknown.
**Suspected cause**: Secure WebView fields did not reliably reflect accessibility value setting or focus across command boundaries. The precise provider mechanism is unknown.
**Proposed change**: rule | For credential fields, require a post-save masked-tail match before reporting success. Treat a successful computer-use action without that readback as unverified; if the field fails, use the application's supported local secret store through an interactive prompt and check the app status again.
