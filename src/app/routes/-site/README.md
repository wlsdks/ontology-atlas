# src/app/routes/-site

What public routes share; the `-` keeps the route generator from reading it as a route.

- `screen-metadata.ts` is one page's head, declared once on its route (`staticData.head`): the title and
  description keys, the path and the languages it exists in. The prerender reads it to write the head of
  an app address without running the screen.
- `load-screen-metadata.ts` and `metadata-tags.tsx` turn that declaration into the `<title>`, `<meta>` and
  `<link>` elements React hoists into `<head>`.
- `build-facts.ts` is what only the build machine can answer about a page (the words it reads, Git dates,
  the sample's size, the changelog). The prerender answers and records; the browser replays the record.
- `guide-chapter.ts`, `GuideChapterView.tsx` and `ScreenTitle.tsx` are the guide's loader and views.
