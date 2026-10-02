---
id: f741cf86-11dd-40fa-ba29-daf9f902f766
date: 2026-10-02
---
## 2026-10-02 — What leaves this computer is listed, and the one automatic request can be turned off

**Why**: the daily update check was the only network request Atlas makes without a press, and it could not be turned off; nothing said in one place what can leave the computer.
**Prior**: the local-first rule, the 2026-09-12 provider disclosure in place, and decision 52's log-before-send.
**Decision**: Privacy · data lists every outbound path (when it happens, what it carries, where it is recorded) from `outbound-paths.ts`, which a contract keeps in step with the hosts in non-test Rust, the updater endpoints, ACP launch kinds and the CSP. It lists allowances on this computer and recent folders, each forgotten behind a two-press chip. About gains an automatic update check switch, `app-update:auto-check`, default On; Off leaves Check for updates working and installing still waits for a press.
**Dissent**: an off switch lets people miss fixes, and an inventory can omit a path a scan cannot see, such as traffic from child processes.
**Falsifier**: a new outbound host ships without a row, or someone who turned checks off believes Atlas updates itself.
**Owner**: Stark
