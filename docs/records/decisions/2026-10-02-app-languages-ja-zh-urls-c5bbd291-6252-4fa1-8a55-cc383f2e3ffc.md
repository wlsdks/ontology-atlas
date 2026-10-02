---
id: c5bbd291-6252-4fa1-8a55-cc383f2e3ffc
date: 2026-10-02
---
## 2026-10-02 — Japanese and Simplified Chinese join the public URLs

**Why**: the app and the web build speak English and Korean only; people who read Japanese or Simplified Chinese had no screen in their language.
**Prior**: the 2026-09-03 decision that a locale is matched by shape, and decision 102 (vault bodies stay English); both stand.
**Decision**: `/ja/*` and `/zh/*` join `/en/*` and `/ko/*` as public routes. `<html lang>` and hreflang are `ja` and `zh-Hans`. Root `/` reads the whole language list: `ja*` goes to `/ja/`, `zh`, `zh-Hans`, `zh-CN` and `zh-SG` go to `/zh/`, and `zh-Hant`, `zh-TW`, `zh-HK` and `zh-MO` go to `/en/`. Chinese is Simplified only. The two catalogs start as byte copies of English and are translated in batches; the macOS app carries the same four locales.
**Dissent**: four-way key parity makes every later string cost four edits; a lag ratchet would be cheaper.
**Falsifier**: Traditional-script readers reporting the `/en/` landing as wrong, or more than three pull requests in 30 days adding English text to a ja or zh catalog.
**Owner**: Stark
