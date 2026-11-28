# tests/contract/site-parity

Guards the two things the website's prerender stands on. `head-hoisting` renders the real document and
reads where React put each tag; `diff-site-pages` plants a lost policy meta, link or sentence in a pair of
small folders and expects `scripts/web/site/diff-site-pages.mjs` to go red.
