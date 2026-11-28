//! What a wiki page is: its frontmatter, its five sections and the syntax of a citation.
//! The `message` of a missing field quotes the field's description, so the descriptions are part of
//! the answer an agent reads.

use std::sync::LazyLock;

use regex::Regex;

pub const WIKI_DIR: &str = "wiki";
pub(crate) const WIKI_SOURCES_DIR: &str = "sources";

/// Folder findings true of a young, uncross-linked wiki rather than of a page.
pub const WIKI_ADVISORY_CODES: [&str; 2] = ["orphan-page", "shared-source-unlinked"];

pub fn is_advisory_code(code: &str) -> bool {
    WIKI_ADVISORY_CODES.contains(&code)
}

/// A file under `wiki/` whose name starts with `_` (`_template.md`, `_log.md`) is furniture, not a
/// page: never judged, listed, compiled or linked.
pub fn is_wiki_furniture_slug(slug: &str) -> bool {
    slug.rsplit('/').next().is_some_and(|name| name.starts_with('_'))
}

/// A frontmatter key every page must carry, in template order.
pub(crate) struct Field {
    pub key: &'static str,
    pub description: &'static str,
}

pub(crate) const REQUIRED_FIELDS: [Field; 7] = [
    Field { key: "title", description: "The page name a person reads. One line, no trailing punctuation." },
    Field { key: "created_by", description: "Who wrote it: `agent:<runtime>` (an ACP agent, e.g. `agent:claude`), `model:<name>` (a local or connected model, e.g. `model:llama3.1`), or `human`." },
    Field { key: "compiled_at", description: "ISO-8601 timestamp of the run that produced this text." },
    Field { key: "sources", description: "List of vault-relative paths under `sources/`. May be empty." },
    Field { key: "source_hash", description: "Map of the same paths to the sha256 of the bytes that were read. This is what lets a page report itself stale when the file changes. May be empty." },
    Field { key: "status", description: "`draft` until a person has read it; `reviewed` after." },
    Field { key: "summary", description: "One sentence. What this page is about, not how it was made." },
];

/// The five level-2 sections, always all five in this order.
pub(crate) const SECTION_ORDER: [&str; 5] =
    ["Summary", "Facts", "Decisions", "Open questions", "Not in sources"];

const ANCHOR: &str = "p[0-9]+|s[0-9]+(?:r[0-9]+)?|r[0-9]+|l[0-9]+|h:[a-z0-9][a-z0-9-]*";

/// `[[src:sources/<path>#<anchor>]]`. The path stops at `[`, `]`, `#` and a line break, so a scan
/// from one `[[src:` never passes the next `[`.
fn citation_pattern() -> String {
    format!(r"\[\[src:(sources/[^\]\[#\n]+)#({ANCHOR})\]\]")
}

fn compiled(source: &str) -> Regex {
    #[allow(clippy::expect_used, reason = "constant patterns, built by every test run")]
    Regex::new(source).expect("wiki pattern")
}

static CITATION: LazyLock<Regex> = LazyLock::new(|| compiled(&citation_pattern()));
static WHOLE_CITATION: LazyLock<Regex> =
    LazyLock::new(|| compiled(&format!("^{}$", citation_pattern())));
/// Anything shaped like a citation, so a malformed one is reported instead of ignored.
static CITATION_SHAPED: LazyLock<Regex> = LazyLock::new(|| compiled(r"\[\[src:([^\]\[]*)\]\]"));

/// The paths of the well-formed citations in `text`, in order, repeats included.
pub fn cited_sources(text: &str) -> Vec<String> {
    CITATION
        .captures_iter(text)
        .filter_map(|found| found.get(1).map(|path| path.as_str().to_string()))
        .collect()
}

pub(crate) fn has_citation(text: &str) -> bool {
    CITATION.is_match(text)
}

pub(crate) fn is_whole_citation(text: &str) -> bool {
    WHOLE_CITATION.is_match(text)
}

/// Every `[[src:...]]`-shaped text on one line.
pub(crate) fn citation_shaped(line: &str) -> Vec<String> {
    CITATION_SHAPED
        .find_iter(line)
        .map(|found| found.as_str().to_string())
        .collect()
}
