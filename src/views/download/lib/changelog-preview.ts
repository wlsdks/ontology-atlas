/**
 * /download "release notes preview" duo — a hand-refreshed snapshot of
 * `docs/CHANGELOG.md`'s most recent entries, NOT a live build-time read.
 *
 * Why not live: `docs/CHANGELOG.md` entries are dated headers
 * (`## YYYY-MM-DD — Title`) followed by free-flowing prose, not bullet
 * lists — there's no clean "last 3 lines" to extract without inventing a new
 * per-entry summary-bullet convention. Per RATIO-SYSTEM's "real data or an
 * honest build-time constant with a source caption" fallback, this ships as
 * a constant the UI captions with `CHANGELOG_PREVIEW_AS_OF` and a
 * "docs/CHANGELOG.md excerpt" source label — never presented as live-synced.
 *
 * `changelog-preview.test.ts` guards against silent drift: it fails if these
 * titles/dates no longer appear verbatim in `docs/CHANGELOG.md`, so an
 * out-of-date snapshot surfaces as a failing test instead of stale UI copy.
 */

export interface ChangelogPreviewEntry {
  date: string;
  title: string;
}

export const CHANGELOG_PREVIEW_AS_OF = "2026-07-18";

export const CHANGELOG_PREVIEW_ENTRIES: readonly ChangelogPreviewEntry[] = [
  {
    date: "2026-07-18",
    title: "Project detail Connection map 제거 + SigmaTopology 렌더러 물리 삭제",
  },
  {
    date: "2026-07-18",
    title: "설치형 앱 first-run 온보딩 (진입 표면 2원화)",
  },
  {
    date: "2026-07-18",
    title: "정체성 공식 문서화 (v10): agent-native, human-sovereign",
  },
];
