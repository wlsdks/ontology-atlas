//! Who this repository says it is: project identity from package manifests, `configure.ac` or the
//! README title; the domain candidates a README's second-level headings suggest; and the ontology
//! nodes an existing vault already contributes.

use std::collections::BTreeSet;
use std::sync::LazyLock;

use answer_format::utf16;
use answer_format::whitespace::{is_whitespace, trim};
use regex::Regex;
use repository_survey::js_regex;
use serde::Serialize;

use crate::authored_markdown::authored_markdown_lines;
use crate::candidate_text::{clean_heading_label, humanize, is_heading_adornment, slugify};
use crate::package_contracts::{extract_python_pyproject_contract, extract_python_setup_contract};
use crate::repository_files::{join, Probe, ReadFailure, RepositoryFiles, SkipLog};
use crate::scan_limits::{
    AUTOTOOLS_IDENTITY_MAX_BYTES, AUTOTOOLS_IDENTITY_MAX_LENGTH, ONTOLOGY_EVIDENCE_MAX_ENTRIES,
    ONTOLOGY_EVIDENCE_MAX_FILES, PYTHON_PROJECT_MAX_BYTES, PYTHON_SETUP_MAX_BYTES,
    SEMANTIC_EVIDENCE_MAX_BYTES,
};
use crate::scan_tables::{AUTOTOOLS_IDENTITY_FILES, STARTER_ONTOLOGY_SLUGS};

const VAULT_SOURCES_DIR: &str = "sources";

/// The project the repository names itself as.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectCandidate {
    pub slug: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence: Option<Vec<String>>,
}

/// A second-level README heading offered as a domain.
#[derive(Debug, Clone, Serialize)]
pub struct DomainCandidate {
    pub slug: String,
    pub title: String,
    pub evidence: DomainEvidence,
}

#[derive(Debug, Clone, Serialize)]
pub struct DomainEvidence {
    pub source: String,
    pub line: usize,
}

/// A domain or capability a vault in the repository already declares.
#[derive(Debug, Clone, Serialize)]
pub struct ExistingOntologyNode {
    pub slug: String,
    pub kind: String,
    pub source: String,
    pub elements: Vec<String>,
}

static AUTOTOOLS_INIT: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r#"(?m)^\s*AC_INIT\s*\(\s*(\[[^\]\r\n]{1,160}\]|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')\s*(?:,|\))"#,
    )
});
static CONTROL_OR_SHELL: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"[\x{0}-\x{1f}\x{7f}]|[`$\\]"));
static MACRO_CALL: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?i)\b(?:m4_[A-Za-z0-9_]+|esyscmd|syscmd|eval|include|ifdef|ifelse)\s*\(")
});
static SEPARATORS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"[_/]+"));
static LEADING_AT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^@"));
static FENCE_LINE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*(`{3,}|~{3,})"));
static MARKDOWN_TITLE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^#\s+(.+?)\s*$"));
static HTML_TITLE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)<h1\b[^>]*>(.*?)</h1>"));
static SECOND_LEVEL: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^##\s+(.+?)\s*$"));
static LEADING_SYMBOLS: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)^[^a-z0-9가-힣]+"));
static GENERIC_SECTION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)^(usage|installation|getting started|quick start|license|contributing|requirements|features|setup|status|tech stack|architecture|folder map|routes|tests?|documentation|overview|development|deployment|changelog|roadmap|faq|demo|examples?|guides?|table of contents|toc|acknowledge?ments?|sponsors?)$",
    )
});
static OPERATIONAL_SECTION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)\bin numbers$|^install\b|^core capabilities$|^providers? and (?:local|offline) (?:path|setup|mode)$|^verification$|^community(?:\s+(?:and|&)\s+support)?$",
    )
});
static DOCUMENTATION_SECTION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)^(?:documentation\s+(?:and|&)\s+community(?:\s+support|\s+(?:and|&)\s+support)|documentation\s+(?:and|&)\s+support)$",
    )
});
static QUESTION_SECTION: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)^(why|what|how|when|where|who)\b"));
static GUIDE_SECTION: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)가이드|\bguide\b"));
static LANGUAGE_SECTION: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)^(한국어|한글|english|日本語|中文|简体中文|繁體中文|español|français|deutsch|português|русский|italiano|türkçe)$",
    )
});
static ITEM_LINE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s+-\s+(.+)$"));

fn basename(label: &str) -> String {
    label
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(label)
        .to_string()
}

fn static_autotools_identity(text: &str) -> String {
    let Some(found) = AUTOTOOLS_INIT.captures(text) else {
        return String::new();
    };
    let literal = found.get(1).map_or("", |literal| literal.as_str());
    let inner = literal
        .get(1..literal.len().saturating_sub(1))
        .unwrap_or_default();
    let identity = trim(inner);
    if identity.is_empty()
        || utf16::len(identity) > AUTOTOOLS_IDENTITY_MAX_LENGTH
        || CONTROL_OR_SHELL.is_match(identity)
        || MACRO_CALL.is_match(identity)
    {
        return String::new();
    }
    identity.to_string()
}

fn detect_autotools_identity(
    files: &RepositoryFiles<'_>,
    skipped: &mut SkipLog,
) -> Option<ProjectCandidate> {
    for source in AUTOTOOLS_IDENTITY_FILES {
        match files.probe(source) {
            Probe::File => {}
            Probe::OutsideRoot => {
                skipped.push_once(
                    files.display(source),
                    format!("project-identity-skip: {source} resolves outside repository root"),
                );
                continue;
            }
            _ => continue,
        }
        let text = match files.text(source) {
            Ok(text) if text.len() > AUTOTOOLS_IDENTITY_MAX_BYTES => {
                skipped.push_once(
                    files.display(source),
                    format!(
                        "project-identity-skip: {source} exceeds {AUTOTOOLS_IDENTITY_MAX_BYTES} bytes"
                    ),
                );
                continue;
            }
            Ok(text) => text,
            Err(ReadFailure::TooLarge) => {
                skipped.push_once(
                    files.display(source),
                    format!(
                        "project-identity-skip: {source} exceeds {AUTOTOOLS_IDENTITY_MAX_BYTES} bytes"
                    ),
                );
                continue;
            }
            Err(_) => continue,
        };
        let identity = static_autotools_identity(&text);
        let slug = if identity.is_empty() {
            String::new()
        } else {
            slugify(&SEPARATORS.replace_all(&identity, "-"))
        };
        if !identity.is_empty() && !slug.is_empty() {
            return Some(ProjectCandidate {
                slug,
                title: identity,
                evidence: Some(vec![source.to_string()]),
            });
        }
    }
    None
}

fn json_text(value: Option<&serde_json::Value>) -> Option<String> {
    match value? {
        serde_json::Value::String(text) if !text.is_empty() => Some(text.clone()),
        serde_json::Value::Number(number) => Some(number.to_string()),
        serde_json::Value::Bool(true) => Some("true".to_string()),
        _ => None,
    }
}

pub fn detect_project(
    files: &RepositoryFiles<'_>,
    skipped: &mut SkipLog,
) -> ProjectCandidate {
    if let Some(identity) = detect_autotools_identity(files, skipped) {
        return identity;
    }
    let root_name = basename(files.label());
    if files.probe("package.json") != Probe::Missing {
        match files.text("package.json") {
            Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(package) => {
                    let name = json_text(package.get("name")).unwrap_or_else(|| root_name.clone());
                    let slug = LEADING_AT.replace(&name, "").replace('/', "-");
                    let title = detect_readme_title(files).unwrap_or_else(|| humanize(&slug));
                    return ProjectCandidate {
                        slug,
                        title,
                        evidence: None,
                    };
                }
                Err(error) => skipped.push(
                    files.display("package.json"),
                    format!("package-json-parse-error: {error}"),
                ),
            },
            Err(_) => skipped.push(
                files.display("package.json"),
                "package-json-parse-error: unreadable".to_string(),
            ),
        }
    }
    for (source, max_bytes, extract) in [
        (
            "pyproject.toml",
            PYTHON_PROJECT_MAX_BYTES,
            extract_python_pyproject_contract as fn(&str) -> _,
        ),
        ("setup.py", PYTHON_SETUP_MAX_BYTES, extract_python_setup_contract),
    ] {
        if files.probe(source) == Probe::Missing {
            continue;
        }
        match crate::semantic_evidence::package_contract_issue(files, source, max_bytes) {
            Err(reason) => skipped.push_once(files.display(source), reason),
            Ok(text) => {
                if let Ok(contract) = extract(&text) {
                    let slug = slugify(&contract.package_name.replace('_', "-"));
                    if !slug.is_empty() {
                        return ProjectCandidate {
                            slug,
                            title: detect_readme_title(files)
                                .unwrap_or_else(|| humanize(&contract.package_name)),
                            evidence: None,
                        };
                    }
                }
            }
        }
    }
    let title = detect_readme_title(files).unwrap_or_else(|| humanize(&root_name));
    ProjectCandidate {
        slug: root_name,
        title,
        evidence: None,
    }
}

/// A README is read only as far as the survey reads any document.
fn document_head(files: &RepositoryFiles<'_>, source: &str) -> Option<String> {
    files.head(source, SEMANTIC_EVIDENCE_MAX_BYTES).ok()
}

fn detect_readme_title(files: &RepositoryFiles<'_>) -> Option<String> {
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for candidate in ["README.md", "readme.md", "README.rst", "readme.rst", "README"] {
        let Some(source) = files.existing_source_case(candidate) else {
            continue;
        };
        if !seen.insert(source.clone()) {
            continue;
        }
        let Some(text) = document_head(files, &source) else {
            continue;
        };
        let is_rst = source.to_lowercase().ends_with(".rst");
        let lines: Vec<String> = if is_rst {
            crate::authored_markdown::document_lines(&text)
                .into_iter()
                .map(str::to_string)
                .collect()
        } else {
            authored_markdown_lines(&text)
        };
        let mut fence: Option<char> = None;
        for (index, line) in lines.iter().enumerate() {
            if let Some(found) = FENCE_LINE.captures(line) {
                let marker = found
                    .get(1)
                    .and_then(|text| text.as_str().chars().next())
                    .unwrap_or('`');
                fence = if fence == Some(marker) {
                    None
                } else {
                    fence.or(Some(marker))
                };
                continue;
            }
            if fence.is_some() {
                continue;
            }
            let next_line = lines.get(index + 1).map_or("", |next| trim(next));
            if !trim(line).is_empty()
                && is_heading_adornment(next_line)
                && (is_rst || next_line.starts_with('='))
            {
                let title = clean_heading_label(line);
                if !title.is_empty() {
                    return Some(title);
                }
            }
            if let Some(found) = MARKDOWN_TITLE.captures(line) {
                let title = clean_heading_label(found.get(1).map_or("", |text| text.as_str()));
                if !title.is_empty() {
                    return Some(title);
                }
            }
            if let Some(found) = HTML_TITLE.captures(line) {
                let title = clean_heading_label(found.get(1).map_or("", |text| text.as_str()));
                if !title.is_empty() {
                    return Some(title);
                }
            }
        }
    }
    None
}

enum FrontmatterValue {
    Text(String),
    List(Vec<String>),
}

fn strip_quotes(value: &str) -> String {
    let without_open = value
        .strip_prefix(['\'', '"'])
        .unwrap_or(value);
    without_open
        .strip_suffix(['\'', '"'])
        .unwrap_or(without_open)
        .to_string()
}

fn parse_simple_frontmatter(text: &str) -> Vec<(String, FrontmatterValue)> {
    if !text.starts_with("---") {
        return Vec::new();
    }
    let Some(end) = text.get(3..).and_then(|rest| rest.find("\n---")) else {
        return Vec::new();
    };
    let block = trim(text.get(4..end + 3).unwrap_or_default());
    let lines: Vec<&str> = block
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect();
    let mut found: Vec<(String, FrontmatterValue)> = Vec::new();
    let mut put = |key: String, value: FrontmatterValue| {
        if let Some(slot) = found.iter_mut().find(|(held, _)| *held == key) {
            slot.1 = value;
        } else {
            found.push((key, value));
        }
    };
    let mut index = 0;
    while index < lines.len() {
        let line = lines.get(index).copied().unwrap_or_default();
        index += 1;
        let Some((raw_key, raw_value)) = line.split_once(':') else {
            continue;
        };
        let key = trim(raw_key);
        let value = trim(raw_value);
        if key.is_empty() {
            continue;
        }
        if value.is_empty() {
            let mut items = Vec::new();
            let mut next = index;
            while let Some(candidate) = lines.get(next) {
                let Some(item) = ITEM_LINE.captures(candidate) else {
                    break;
                };
                items.push(strip_quotes(trim(item.get(1).map_or("", |text| text.as_str()))));
                next += 1;
            }
            if !items.is_empty() {
                put(key.to_string(), FrontmatterValue::List(items));
                index = next;
            }
            continue;
        }
        if value.starts_with('[') && value.ends_with(']') {
            let inner = value.get(1..value.len() - 1).unwrap_or_default();
            let items = inner
                .split(',')
                .map(|item| strip_quotes(trim(item)))
                .filter(|item| !item.is_empty())
                .collect();
            put(key.to_string(), FrontmatterValue::List(items));
            continue;
        }
        put(key.to_string(), FrontmatterValue::Text(strip_quotes(value)));
    }
    found
}

fn frontmatter_text<'a>(
    frontmatter: &'a [(String, FrontmatterValue)],
    key: &str,
) -> Option<&'a str> {
    frontmatter.iter().find_map(|(held, value)| match value {
        FrontmatterValue::Text(text) if held == key && !text.is_empty() => Some(text.as_str()),
        _ => None,
    })
}

fn read_ontology_evidence(
    files: &RepositoryFiles<'_>,
    path: &str,
) -> Option<ExistingOntologyNode> {
    let text = files.text(path).ok()?;
    let frontmatter = parse_simple_frontmatter(&text);
    let kind = frontmatter_text(&frontmatter, "kind")?;
    if kind != "domain" && kind != "capability" {
        return None;
    }
    let slug = frontmatter_text(&frontmatter, "slug")
        .map(str::to_string)
        .unwrap_or_else(|| {
            let below = path.strip_prefix("docs/ontology/").unwrap_or(path);
            below
                .strip_suffix(".md")
                .or_else(|| below.strip_suffix(".MD"))
                .unwrap_or(below)
                .to_string()
        });
    if STARTER_ONTOLOGY_SLUGS.contains(&slug.as_str()) {
        return None;
    }
    let elements = frontmatter
        .iter()
        .find_map(|(held, value)| match value {
            FrontmatterValue::List(items) if held == "elements" => Some(items.clone()),
            _ => None,
        })
        .unwrap_or_default();
    Some(ExistingOntologyNode {
        slug,
        kind: kind.to_string(),
        source: path.to_string(),
        elements,
    })
}

struct OntologyWalk {
    entries_seen: usize,
    files_seen: usize,
    budget_spent: bool,
    seen: BTreeSet<String>,
    rows: Vec<ExistingOntologyNode>,
}

impl OntologyWalk {
    fn budget_reached(
        &mut self,
        files: &RepositoryFiles<'_>,
        skipped: &mut SkipLog,
        directory: &str,
    ) -> bool {
        if self.budget_spent {
            return true;
        }
        let budget = if self.entries_seen >= ONTOLOGY_EVIDENCE_MAX_ENTRIES {
            format!("{ONTOLOGY_EVIDENCE_MAX_ENTRIES} entry")
        } else if self.files_seen >= ONTOLOGY_EVIDENCE_MAX_FILES {
            format!("{ONTOLOGY_EVIDENCE_MAX_FILES} Markdown file")
        } else {
            return false;
        };
        self.budget_spent = true;
        skipped.push_once(
            files.display(directory),
            format!("ontology-evidence-skip: {directory} reached {budget} walk budget"),
        );
        true
    }

    fn visit(&mut self, files: &RepositoryFiles<'_>, skipped: &mut SkipLog, directory: &str) {
        if directory == format!("docs/ontology/{VAULT_SOURCES_DIR}") {
            return;
        }
        for (entry, probe) in files.entries(directory) {
            if self.budget_reached(files, skipped, directory) {
                return;
            }
            self.entries_seen += 1;
            let path = join(directory, &entry);
            match probe {
                Probe::OutsideRoot => skipped.push_once(
                    files.display(&path),
                    format!("ontology-evidence-skip: {path} resolves outside repository root"),
                ),
                Probe::Folder => self.visit(files, skipped, &path),
                Probe::File if entry.ends_with(".md") => {
                    self.files_seen += 1;
                    let Some(evidence) = read_ontology_evidence(files, &path) else {
                        continue;
                    };
                    if self.seen.insert(evidence.slug.clone()) {
                        self.rows.push(evidence);
                    }
                }
                _ => {}
            }
        }
    }
}

pub fn detect_existing_ontology(
    files: &RepositoryFiles<'_>,
    skipped: &mut SkipLog,
) -> Vec<ExistingOntologyNode> {
    match files.probe("docs/ontology") {
        Probe::Folder => {}
        Probe::OutsideRoot => {
            skipped.push_once(
                files.display("docs/ontology"),
                "ontology-evidence-skip: docs/ontology resolves outside repository root"
                    .to_string(),
            );
            return Vec::new();
        }
        _ => return Vec::new(),
    }
    let mut walk = OntologyWalk {
        entries_seen: 0,
        files_seen: 0,
        budget_spent: false,
        seen: BTreeSet::new(),
        rows: Vec::new(),
    };
    walk.visit(files, skipped, "docs/ontology");
    walk.rows
}

fn is_ruled_out_heading(title: &str, normalized: &str) -> bool {
    let word_count = title.split(is_whitespace).filter(|part| !part.is_empty()).count();
    GENERIC_SECTION.is_match(normalized)
        || OPERATIONAL_SECTION.is_match(normalized)
        || DOCUMENTATION_SECTION.is_match(normalized)
        || QUESTION_SECTION.is_match(normalized)
        || GUIDE_SECTION.is_match(normalized)
        || LANGUAGE_SECTION.is_match(normalized)
        || title.contains(',')
        || word_count > 5
}

/// The README's second-level headings that can be a domain.
pub fn detect_domains_from_readme(files: &RepositoryFiles<'_>) -> Vec<DomainCandidate> {
    let mut seen_sources: BTreeSet<String> = BTreeSet::new();
    for candidate in ["README.md", "readme.md", "README"] {
        let Some(source) = files.existing_source_case(candidate) else {
            continue;
        };
        if !seen_sources.insert(source.clone()) {
            continue;
        }
        let Some(text) = document_head(files, &source) else {
            continue;
        };
        let lines = authored_markdown_lines(&text);
        let mut domains: Vec<DomainCandidate> = Vec::new();
        let mut seen: BTreeSet<String> = BTreeSet::new();
        for (index, line) in lines.iter().enumerate() {
            let Some(found) = SECOND_LEVEL.captures(line) else {
                continue;
            };
            let title = trim(found.get(1).map_or("", |text| text.as_str()));
            let normalized = trim(&LEADING_SYMBOLS.replace(title, "")).to_string();
            if is_ruled_out_heading(title, &normalized) {
                continue;
            }
            let raw_slug = slugify(title);
            if raw_slug.is_empty() {
                continue;
            }
            let slug = format!("domains/{raw_slug}");
            if !seen.insert(slug.clone()) {
                continue;
            }
            domains.push(DomainCandidate {
                slug,
                title: title.to_string(),
                evidence: DomainEvidence {
                    source: source.clone(),
                    line: index + 1,
                },
            });
            if domains.len() >= 12 {
                break;
            }
        }
        return domains;
    }
    Vec::new()
}
