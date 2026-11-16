---
id: e611919b-9835-4fe6-835a-c751ede01412
date: 2026-11-17
---
## 2026-11-17 — The update check repeats while the app stays open

**Why**: the automatic check ran once, 4 seconds after launch, at most once a day. The owner left the app open across releases, never saw a notice, and had to open Settings and press Check for updates.
**Prior**: refines `docs/records/decisions/2026-10-02-outbound-list-and-update-switch-f741cf86-11dd-40fa-ba29-daf9f902f766.md`: the same single automatic request, host and switch, asked more often.
**Decision**: with the automatic check On, Atlas asks the update feed after launch and again when the last successful check is four hours old, judged every thirty minutes and when the window returns. Whatever the outcome there is at most one automatic request per thirty minutes; a failing feed is retried once after thirty minutes, then every four hours. No automatic check runs on a platform the feed does not serve. Nothing new is sent and no host is added. Off stops every automatic check at once; Check for updates still works. An automatic result never replaces a download, a version waiting for restart or a failed install, and a version installed in this session is not offered again, even after a language switch. Later still silences one version; the settings entry carries a dot while a version waits.
**Dissent**: six requests a day instead of one from every open app, for a product whose promise is that little leaves the computer; request times now follow when the window returns; a dot that stays after Later is a second nag.
**Falsifier**: someone who turned checks off sees a request, a window return alone causes a second request within thirty minutes, a check resets a download, or people report the dot as noise.
**Owner**: stark
