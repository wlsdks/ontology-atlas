---
id: 04edab8a-8a56-4047-91dc-7bbea87fd962
date: 2026-11-16
---
## 2026-11-16 — The auto-approve choice is kept per folder on this Mac, bound to the scope it was given for

**Why**: The owner still had to choose auto-approve for every conversation, after the put-away stop and on each screen: the repeated press the choice was added to remove.
**Prior**: 2026-11-16 "A person can turn on auto-approve for one conversation" (docs/records/decisions/2026-11-16-acp-auto-approve-standing-scope-15443720-35ad-47da-8f03-6ec2ae4a36be.md) stands for what passes without a card; its "never persisted" is overturned. 2026-09-29 (unattended rounds refuse Atlas writes) stands. The connector and round allowances are the precedent and the store.
**Decision**: Choosing Auto-approve records an `auto-approve` allowance for the folder's absolute path in the machine-approvals store; its value is the whole scope string (the file-edit rule version and every Atlas write the app answers). Picking a mode, or Forget for that folder in Settings, removes it. Only a caller that opts in (the chat panel) reads it, at each request's arrival and answer. A different scope string reads as off. Nothing in a folder, clone or pull can set it; without a folder path it never applies. The tool and model last chosen are kept per folder in a separate key with no consent meaning.
**Dissent**: A standing choice outlives its moment: weeks later a prompt-injected or mistaken agent writes without a card and the person may not remember allowing it (security lens). Opposite: per folder is too narrow for someone with many folders.
**Falsifier**: An auto-approved request in a folder never pressed on this Mac, after Forget, or after the scope widened; a round passing a write through the kept choice; the choice arriving with a clone, pull or copy; Settings not listing a folder where it is on; or the owner meeting a write from a conversation they did not know was on auto-approve.
**Owner**: the repository owner.
