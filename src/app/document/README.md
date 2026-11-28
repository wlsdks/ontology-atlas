# src/app/document

`SiteDocument.tsx` is the `<html>` every website page shares: the policy meta, viewport and icons first
in `<head>`, then the page's own head, the boot script, the stylesheets and the entry script; one `#root`
in `<body>`. The prerender (`scripts/web/site/write-site.tsx`) renders it, and the browser renders it
again from the record the page carries (`readEmbeddedPage`) and hydrates the whole document, because a
`useId` value follows a component's place in the tree.
