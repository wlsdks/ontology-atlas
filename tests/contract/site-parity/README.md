# tests/contract/site-parity

Guards what the website's prerender stands on. `head-hoisting` renders the real document and reads where
React put each tag; `diff-site-pages` plants a lost policy meta, link, sentence, script or JSON-LD field in a
pair of small folders and expects `scripts/web/site/diff-site-pages.mjs` to go red;
`build-time-readers` keeps the browser bundle from importing the readers that need Node.
