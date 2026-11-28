import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { appFolderProblems } from "./check-app-folder.mjs";

const folders = [];

/** A small app folder as a build writes it: a document, the chunks it names, and public files the code names. */
function makeAppFolder() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-app-folder-"));
  folders.push(folder);
  const put = (relativePath, text = "x") => {
    fs.mkdirSync(path.dirname(path.join(folder, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(folder, relativePath), text);
  };
  put("index.html", '<!doctype html><link rel="stylesheet" href="/assets/index-a1.css"><script type="module" src="/assets/index-a1.js"></script>');
  put("assets/index-a1.js", 'import("./map-b2.js");const mark="/logo.png",icons="/acp-icons/";');
  put("assets/map-b2.js", "map()");
  put("assets/index-a1.css", "@font-face{src:url(/assets/mono-c3.woff2)}");
  put("assets/mono-c3.woff2", "font");
  put("logo.png", "png");
  put("acp-icons/claude.svg", "<svg/>");
  return { folder, put };
}

afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

describe("appFolderProblems", () => {
  it("accepts a folder of a document, the chunks and fonts it names, and the public files the code names", () => {
    assert.deepEqual(appFolderProblems(makeAppFolder().folder), []);
  });

  it("refuses the website's og-image.png and sitemap.xml and the raw docs-vault copies even when a chunk names them", () => {
    const { folder, put } = makeAppFolder();
    // The page head's code is bundled in the app too, so a chunk spells the address the window never asks for.
    put("assets/index-a1.js", 'import("./map-b2.js");const mark="/logo.png",icons="/acp-icons/",card="/og-image.png";');
    put("og-image.png");
    put("sitemap.xml");
    put("docs-vault/ontology/README.md");
    const problems = appFolderProblems(folder);
    assert.equal(problems.length, 3);
    assert.match(problems.join("\n"), /docs-vault\/ontology\/README\.md is a file only the website serves/);
    assert.match(problems.join("\n"), /og-image\.png is a file only the website serves/);
    assert.match(problems.join("\n"), /sitemap\.xml is a file only the website serves/);
  });

  it("refuses a bundle file no chunk names and a public file no code names", () => {
    const { folder, put } = makeAppFolder();
    put("assets/left-over-d4.js");
    put("brand/unused.svg");
    assert.deepEqual(appFolderProblems(folder).map((problem) => problem.split(" ")[0]), ["assets/left-over-d4.js", "brand/unused.svg"]);
  });

  it("refuses a style element or attribute in the document, which the app's policy would ignore", () => {
    const { folder, put } = makeAppFolder();
    put("index.html", '<!doctype html><style>body{}</style><script type="module" src="/assets/index-a1.js"></script><link href="/assets/index-a1.css">');
    assert.match(appFolderProblems(folder).join("\n"), /<style> element or a style attribute/);
    put("index.html", '<!doctype html><div style="color:red"></div><script type="module" src="/assets/index-a1.js"></script><link href="/assets/index-a1.css">');
    assert.match(appFolderProblems(folder).join("\n"), /<style> element or a style attribute/);
  });

  it("says to build first when there is no document", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-app-folder-"));
    folders.push(folder);
    assert.match(appFolderProblems(folder)[0], /no index\.html: build the app first/);
  });
});
