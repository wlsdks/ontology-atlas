//! Implementation evidence for repositories that are not JavaScript: Autotools/C role assignment
//! read out of `Makefile.am` and friends, and Cargo target and module evidence read out of
//! `Cargo.toml` plus the Rust sources it names.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::LazyLock;

use answer_format::collation::compare_text;
use answer_format::utf16;
use answer_format::whitespace::{is_whitespace, trim};
use regex::Regex;
use repository_survey::js_regex;

use crate::candidate_nodes::ElementCandidate;
use crate::candidate_text::{humanize, slugify, ForwardFinder};
use crate::package_contracts::extract_cargo_contract;
use crate::repository_files::{file_name, join, parent_of, Probe, ReadFailure, RepositoryFiles, SkipLog};
use crate::scan_limits::{
    AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT, AUTOTOOLS_ROLE_LITERAL_PATH_MAX_LENGTH,
    AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES, AUTOTOOLS_ROLE_TARGET_LIMIT, CARGO_MANIFEST_MAX_BYTES,
    NATIVE_DOC_BUILD_ELEMENT_LIMIT, NATIVE_SOURCE_ELEMENT_LIMIT, RUST_IMPLEMENTATION_ELEMENT_LIMIT,
    RUST_MODULES_PER_TARGET_LIMIT, RUST_SOURCE_MAX_BYTES,
};
use crate::scan_tables::{
    AUTOTOOLS_IDENTITY_FILES, AUTOTOOLS_IMPLEMENTATION_MANIFESTS, NATIVE_ROLE_EVIDENCE_FILE,
    NATIVE_SOURCE_FILE, SOURCE_FOLDERS,
};

const PUBLIC_INTERFACE: &str = "Public interface contract";
const CORE_SOURCE: &str = "Core implementation source";
const SPECIALIZED_API: &str = "Specialized API source";
const PLATFORM_BACKEND: &str = "Selectable platform backend";
const UNCLASSIFIED: &str = "Unclassified native source evidence";

const ROLE_SELECTION: [&str; 5] = [
    PUBLIC_INTERFACE,
    CORE_SOURCE,
    SPECIALIZED_API,
    PLATFORM_BACKEND,
    UNCLASSIFIED,
];

fn selection_priority(role: &str) -> usize {
    ROLE_SELECTION
        .iter()
        .position(|candidate| *candidate == role)
        .unwrap_or(usize::MAX)
}

fn classification_priority(role: &str) -> usize {
    [PUBLIC_INTERFACE, SPECIALIZED_API, CORE_SOURCE, PLATFORM_BACKEND]
        .iter()
        .position(|candidate| *candidate == role)
        .unwrap_or(usize::MAX)
}

static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)^\s*(?:dnl\b|#)"));
static STATIC_PATH: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$"));
static STATIC_SEGMENT: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^[A-Za-z0-9][A-Za-z0-9._-]*$"));
static CONFIG_FILES: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bAC_CONFIG_FILES\s*\(\s*"));
static CLOSING_PAREN: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\s*\)"));
static ASSIGNMENT: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^([A-Za-z][A-Za-z0-9_]*)\s*(?:\+?=|:=)\s*(.+)$"));
static HEADERS_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"_HEADERS$"));
static SOURCES_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"_SOURCES$"));
static INCLUDE_HEADERS: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?:^|_)(?:include|pkginclude)_HEADERS$"));
static HEADER_FILE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)\.h(?:\.in)?$"));
static PLAIN_HEADER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)\.h$"));
static TEMPLATE_HEADER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)\.h\.in$"));
static API_NAME: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?i)(?:^|[-_.])(raw|api)(?:[-_.]|$)"));
static PREP_STEM: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?:^|[-_.])prep(?:[-_.]|$)"));
static CORE_STEM: LazyLock<Regex> = LazyLock::new(|| js_regex(r"(?:^|[-_.])(main|core)(?:[-_.]|$)"));
static API_STEM: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(?:raw[-_.]?api|api)$"));
static DOC_BUILD_SCRIPT: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?i)^build_[A-Za-z0-9_-]+\.py$"));

fn static_lines(contents: &str) -> Vec<String> {
    contents
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .filter(|line| !COMMENT_LINE.is_match(line))
        .map(|line| trim(line).to_string())
        .collect()
}

fn is_static_role_path(value: &str) -> bool {
    if value.is_empty()
        || utf16::len(value) > AUTOTOOLS_ROLE_LITERAL_PATH_MAX_LENGTH
        || value.starts_with('/')
        || value.contains('\\')
        || !STATIC_PATH.is_match(value)
    {
        return false;
    }
    value
        .split('/')
        .all(|segment| segment != "." && segment != ".." && STATIC_SEGMENT.is_match(segment))
}

fn words(value: &str) -> Vec<&str> {
    value.split(is_whitespace).filter(|part| !part.is_empty()).collect()
}

fn read_role_manifest(
    files: &RepositoryFiles<'_>,
    source: &str,
    skipped: &mut SkipLog,
) -> Option<String> {
    match files.probe(source) {
        Probe::File => {}
        Probe::OutsideRoot => {
            skipped.push_once(
                files.display(source),
                format!("autotools-role-evidence-skip: {source} resolves outside repository root"),
            );
            return None;
        }
        _ => return None,
    }
    match files.text(source) {
        Ok(text) if text.len() > AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES => {
            skipped.push_once(
                files.display(source),
                format!(
                    "autotools-role-evidence-skip: {source} exceeds {AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES} bytes"
                ),
            );
            None
        }
        Ok(text) => Some(text),
        Err(ReadFailure::TooLarge) => {
            skipped.push_once(
                files.display(source),
                format!(
                    "autotools-role-evidence-skip: {source} exceeds {AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES} bytes"
                ),
            );
            None
        }
        Err(_) => {
            skipped.push_once(
                files.display(source),
                format!("autotools-role-evidence-skip: {source} is unreadable"),
            );
            None
        }
    }
}

fn extract_makefile_targets(contents: &str) -> Vec<String> {
    let mut targets: BTreeSet<String> = BTreeSet::new();
    let source = static_lines(contents).join("\n");
    let mut finder = ForwardFinder::new(&source);
    let mut from = 0;
    while let Some(found) = CONFIG_FILES.find_at(&source, from) {
        from = found.end();
        let start = found.end();
        let quoted = source.get(start..).is_some_and(|rest| rest.starts_with('['));
        let needle = if quoted { "]" } else { ")" };
        let Some(end) = finder.find(needle, if quoted { start + 1 } else { start }) else {
            continue;
        };
        if quoted {
            let after = source.get(end + 1..).unwrap_or_default();
            if !CLOSING_PAREN.is_match(utf16::prefix(after, 200)) {
                continue;
            }
        }
        from = end + 1;
        let body = trim(
            source
                .get(if quoted { start + 1 } else { start }..end)
                .unwrap_or_default(),
        );
        let candidates = words(body);
        if candidates.is_empty()
            || candidates.len() > AUTOTOOLS_ROLE_TARGET_LIMIT
            || !candidates.iter().all(|candidate| is_static_role_path(candidate))
        {
            continue;
        }
        for candidate in candidates {
            let segments: Vec<&str> = candidate.split('/').collect();
            if candidate == "Makefile" || (segments.len() == 2 && segments.get(1) == Some(&"Makefile")) {
                targets.insert(candidate.to_string());
            }
        }
    }
    let mut sorted: Vec<String> = targets.into_iter().collect();
    utf16::sort(&mut sorted);
    sorted.truncate(AUTOTOOLS_ROLE_TARGET_LIMIT);
    sorted
}

fn makefile_am_for_target(target: &str) -> String {
    if target == "Makefile" {
        "Makefile.am".to_string()
    } else {
        format!(
            "{}/Makefile.am",
            target.strip_suffix("/Makefile").unwrap_or(target)
        )
    }
}

struct RoleAssignment {
    name: String,
    values: Vec<String>,
}

fn extract_role_assignments(contents: &str) -> Vec<RoleAssignment> {
    let mut assignments = Vec::new();
    let mut pending = String::new();
    let flush = |line: &str, assignments: &mut Vec<RoleAssignment>| {
        let Some(found) = ASSIGNMENT.captures(line) else {
            return;
        };
        let name = found.get(1).map_or("", |text| text.as_str());
        if !HEADERS_NAME.is_match(name) && !SOURCES_NAME.is_match(name) {
            return;
        }
        let values: Vec<String> = words(trim(found.get(2).map_or("", |text| text.as_str())))
            .into_iter()
            .map(str::to_string)
            .collect();
        if values.is_empty()
            || values.len() > AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT
            || !values.iter().all(|value| is_static_role_path(value))
        {
            return;
        }
        assignments.push(RoleAssignment {
            name: name.to_string(),
            values,
        });
    };
    for line in static_lines(contents) {
        if line.is_empty() {
            continue;
        }
        let current = if pending.is_empty() {
            line
        } else {
            format!("{pending} {line}")
        };
        if let Some(without) = current.strip_suffix('\\') {
            pending = trim(without).to_string();
            continue;
        }
        flush(&current, &mut assignments);
        pending.clear();
        if assignments.len() >= AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT {
            break;
        }
    }
    assignments
}

fn resolve_role_file(files: &RepositoryFiles<'_>, manifest: &str, literal: &str) -> Option<String> {
    if !is_static_role_path(literal) {
        return None;
    }
    let path = join(parent_of(manifest), literal);
    files.is_file(&path).then_some(path)
}

fn resolve_header_file(files: &RepositoryFiles<'_>, manifest: &str, literal: &str) -> Option<String> {
    if !HEADER_FILE.is_match(literal) {
        return None;
    }
    if let Some(direct) = resolve_role_file(files, manifest, literal) {
        if NATIVE_ROLE_EVIDENCE_FILE.is_match(&direct) {
            return Some(direct);
        }
    }
    if !PLAIN_HEADER.is_match(literal) {
        return None;
    }
    let template = resolve_role_file(files, manifest, &format!("{literal}.in"))?;
    TEMPLATE_HEADER.is_match(&template).then_some(template)
}

fn native_role_for_source(path: &str, is_extra: bool, source: &str) -> &'static str {
    let name = NATIVE_ROLE_EVIDENCE_FILE.replace(file_name(path), "");
    if API_NAME.is_match(&name) {
        SPECIALIZED_API
    } else if is_extra && source.contains('/') {
        PLATFORM_BACKEND
    } else {
        CORE_SOURCE
    }
}

struct RoleCandidate {
    role: &'static str,
    evidence_source: String,
}

fn discover_declared_roles(
    files: &RepositoryFiles<'_>,
    skipped: &mut SkipLog,
) -> BTreeMap<String, RoleCandidate> {
    let mut candidates: BTreeMap<String, RoleCandidate> = BTreeMap::new();
    let mut add = |path: String, role: &'static str, evidence_source: String| {
        if !NATIVE_ROLE_EVIDENCE_FILE.is_match(&path) {
            return;
        }
        let better = candidates
            .get(&path)
            .is_none_or(|held| classification_priority(role) < classification_priority(held.role));
        if better {
            candidates.insert(path, RoleCandidate { role, evidence_source });
        }
    };
    let mut makefiles: BTreeSet<String> = BTreeSet::new();
    for config in AUTOTOOLS_IDENTITY_FILES {
        let Some(contents) = read_role_manifest(files, config, skipped) else {
            continue;
        };
        if contents.is_empty() {
            continue;
        }
        for target in extract_makefile_targets(&contents) {
            makefiles.insert(makefile_am_for_target(&target));
        }
    }
    let mut ordered: Vec<String> = makefiles.into_iter().collect();
    utf16::sort(&mut ordered);
    for manifest in ordered {
        let Some(contents) = read_role_manifest(files, &manifest, skipped) else {
            continue;
        };
        if contents.is_empty() {
            continue;
        }
        for assignment in extract_role_assignments(&contents) {
            if INCLUDE_HEADERS.is_match(&assignment.name) {
                for literal in &assignment.values {
                    if let Some(path) = resolve_header_file(files, &manifest, literal) {
                        add(path, PUBLIC_INTERFACE, manifest.clone());
                    }
                }
                continue;
            }
            if assignment.name.ends_with("_HEADERS") {
                continue;
            }
            let is_extra = assignment.name.starts_with("EXTRA_");
            for literal in &assignment.values {
                let Some(path) = resolve_role_file(files, &manifest, literal) else {
                    continue;
                };
                if !NATIVE_SOURCE_FILE.is_match(&path) {
                    continue;
                }
                let role = native_role_for_source(&path, is_extra, &path);
                let evidence = if role == SPECIALIZED_API {
                    path.clone()
                } else {
                    manifest.clone()
                };
                add(path, role, evidence);
            }
        }
    }
    candidates
}

fn evidence_title(source: &str, role: &str) -> String {
    let stem = slugify(&NATIVE_ROLE_EVIDENCE_FILE.replace(file_name(source), ""));
    format!("{role}: {}", humanize(&stem))
}

struct SourceRow {
    source: String,
    role: &'static str,
}

fn representative_priority(candidate: &SourceRow) -> usize {
    let name = file_name(&candidate.source).to_lowercase();
    let stem = NATIVE_ROLE_EVIDENCE_FILE.replace(&name, "").into_owned();
    match candidate.role {
        PUBLIC_INTERFACE => {
            if name.ends_with(".h.in") {
                0
            } else if candidate.source.starts_with("include/") {
                1
            } else {
                2
            }
        }
        CORE_SOURCE => {
            if PREP_STEM.is_match(&stem) {
                0
            } else if CORE_STEM.is_match(&stem) {
                1
            } else {
                2
            }
        }
        SPECIALIZED_API => usize::from(!API_STEM.is_match(&stem)),
        _ => 0,
    }
}

fn compare_candidates(left: &SourceRow, right: &SourceRow) -> std::cmp::Ordering {
    selection_priority(left.role)
        .cmp(&selection_priority(right.role))
        .then_with(|| representative_priority(left).cmp(&representative_priority(right)))
        .then_with(|| {
            let base_priority = |source: &str| {
                let base = file_name(source).to_lowercase();
                if base == "main.c" || base == "main.h" {
                    0
                } else if base.ends_with(".c") {
                    1
                } else {
                    2
                }
            };
            base_priority(&left.source)
                .cmp(&base_priority(&right.source))
                .then_with(|| compare_text(&left.source, &right.source))
        })
}

pub struct AutotoolsEvidence {
    pub is_native_project: bool,
    pub elements: Vec<ElementCandidate>,
}

struct SourceWalk {
    entries_seen: usize,
}

impl SourceWalk {
    fn visit(
        &mut self,
        files: &RepositoryFiles<'_>,
        ignore: &BTreeSet<String>,
        directory: &str,
        depth: usize,
        descend: bool,
        candidates: &mut BTreeSet<String>,
    ) {
        if depth > 3 || self.entries_seen >= 2000 {
            return;
        }
        for (entry, probe) in files.entries(directory) {
            if self.entries_seen >= 2000 {
                break;
            }
            self.entries_seen += 1;
            if ignore.contains(&entry) || entry.starts_with('.') {
                continue;
            }
            let path = join(directory, &entry);
            match probe {
                Probe::Folder if descend => {
                    self.visit(files, ignore, &path, depth + 1, true, candidates);
                }
                Probe::File if NATIVE_SOURCE_FILE.is_match(&path) => {
                    candidates.insert(path);
                }
                _ => {}
            }
        }
    }
}

pub fn discover_autotools_evidence(
    files: &RepositoryFiles<'_>,
    ignore: &BTreeSet<String>,
    skipped: &mut SkipLog,
) -> AutotoolsEvidence {
    let none = AutotoolsEvidence {
        is_native_project: false,
        elements: Vec::new(),
    };
    if !AUTOTOOLS_IMPLEMENTATION_MANIFESTS
        .iter()
        .any(|manifest| files.is_file(manifest.file))
    {
        return none;
    }
    let mut candidates: BTreeSet<String> = BTreeSet::new();
    let mut walk = SourceWalk { entries_seen: 0 };
    walk.visit(files, ignore, "", 0, false, &mut candidates);
    for folder in SOURCE_FOLDERS {
        if files.is_folder(folder) {
            walk.visit(files, ignore, folder, 0, true, &mut candidates);
        }
    }
    let declared = discover_declared_roles(files, skipped);
    for source in declared.keys() {
        candidates.insert(source.clone());
    }
    if candidates.is_empty() {
        return none;
    }
    let mut elements: Vec<ElementCandidate> = Vec::new();
    let mut claimed: BTreeSet<String> = BTreeSet::new();
    let mut add = |element: ElementCandidate, elements: &mut Vec<ElementCandidate>| {
        if claimed.insert(element.slug.clone()) {
            elements.push(element);
        }
    };
    for manifest in AUTOTOOLS_IMPLEMENTATION_MANIFESTS.iter() {
        if files.is_file(manifest.file) {
            add(
                ElementCandidate::at(manifest.slug, manifest.title, None, manifest.file),
                &mut elements,
            );
        }
    }
    if files.is_file("docs/Pipfile") {
        add(
            ElementCandidate::at(
                "elements/docs-dependencies",
                "Documentation Dependencies",
                None,
                "docs/Pipfile",
            ),
            &mut elements,
        );
    }
    let mut build_scripts: Vec<String> = Vec::new();
    if files.is_folder("docs") {
        for name in files.names("docs") {
            if DOC_BUILD_SCRIPT.is_match(&name) && files.is_file(&join("docs", &name)) {
                build_scripts.push(name);
            }
        }
        build_scripts.truncate(NATIVE_DOC_BUILD_ELEMENT_LIMIT);
    }
    for entry in build_scripts {
        let source = format!("docs/{entry}");
        let inner = entry
            .get("build_".len()..entry.len().saturating_sub(".py".len()))
            .unwrap_or_default();
        let suffix = slugify(inner);
        if suffix.is_empty() {
            continue;
        }
        add(
            ElementCandidate::at(
                format!("elements/docs-build-{suffix}"),
                format!("Documentation Build {}", humanize(&suffix)),
                None,
                &source,
            ),
            &mut elements,
        );
    }
    let mut sorted: Vec<SourceRow> = candidates
        .into_iter()
        .map(|source| SourceRow {
            role: declared
                .get(&source)
                .map_or(UNCLASSIFIED, |candidate| candidate.role),
            source,
        })
        .collect();
    sorted.sort_by(compare_candidates);
    let mut selected: Vec<usize> = Vec::new();
    for role in ROLE_SELECTION {
        if let Some(index) = sorted.iter().position(|row| row.role == role) {
            if !selected.contains(&index) {
                selected.push(index);
            }
        }
    }
    for index in 0..sorted.len() {
        if selected.len() >= NATIVE_SOURCE_ELEMENT_LIMIT {
            break;
        }
        if !selected.contains(&index) {
            selected.push(index);
        }
    }
    if sorted.len() > selected.len() {
        skipped.push_once(
            files.label().to_string(),
            format!(
                "native-source-element-limit: omitted {} C/C header paths after {NATIVE_SOURCE_ELEMENT_LIMIT}",
                sorted.len() - selected.len()
            ),
        );
    }
    let mut stem_counts: BTreeMap<String, usize> = BTreeMap::new();
    for index in selected {
        let Some(row) = sorted.get(index) else {
            continue;
        };
        let stem = slugify(&NATIVE_ROLE_EVIDENCE_FILE.replace(file_name(&row.source), ""));
        if stem.is_empty() {
            continue;
        }
        let count = stem_counts.entry(stem.clone()).or_insert(0);
        let slug = if *count == 0 {
            format!("elements/{stem}")
        } else {
            let parent = file_name(parent_of(&row.source));
            let suffix = if parent_of(&row.source).is_empty() {
                String::new()
            } else {
                slugify(parent)
            };
            format!(
                "elements/{stem}-{}",
                if suffix.is_empty() { "native" } else { suffix.as_str() }
            )
        };
        *count += 1;
        let evidence_source = declared
            .get(&row.source)
            .map_or_else(|| row.source.clone(), |candidate| candidate.evidence_source.clone());
        add(
            ElementCandidate::new(
                slug,
                evidence_title(&row.source, row.role),
                None,
                row.source.clone(),
                evidence_source,
            ),
            &mut elements,
        );
    }
    AutotoolsEvidence {
        is_native_project: true,
        elements,
    }
}

/// A Cargo target or module the repository's own sources name.
#[derive(Debug, Clone)]
pub struct RustRow {
    pub path: String,
    pub name: String,
    pub kind: &'static str,
}

pub struct RustEvidence {
    pub rows: Vec<RustRow>,
    pub skip_directories: BTreeSet<String>,
}

fn strip_rust_non_code(text: &str) -> String {
    let characters: Vec<char> = text.chars().collect();
    let blank = |slice: &[char]| -> String {
        slice
            .iter()
            .map(|character| if *character == '\n' { '\n' } else { ' ' })
            .collect()
    };
    let mut output = String::new();
    let mut index = 0;
    while index < characters.len() {
        let here = characters.get(index).copied().unwrap_or_default();
        let next = characters.get(index + 1).copied();
        if here == '/' && next == Some('/') {
            let end = characters
                .get(index + 2..)
                .and_then(|rest| rest.iter().position(|character| *character == '\n'))
                .map_or(characters.len(), |offset| index + 2 + offset);
            output.push_str(&blank(characters.get(index..end).unwrap_or_default()));
            index = end;
            continue;
        }
        if here == '/' && next == Some('*') {
            let mut depth = 1;
            let mut cursor = index + 2;
            while cursor < characters.len() && depth > 0 {
                let a = characters.get(cursor).copied();
                let b = characters.get(cursor + 1).copied();
                if a == Some('/') && b == Some('*') {
                    depth += 1;
                    cursor += 2;
                } else if a == Some('*') && b == Some('/') {
                    depth -= 1;
                    cursor += 2;
                } else {
                    cursor += 1;
                }
            }
            output.push_str(&blank(characters.get(index..cursor).unwrap_or_default()));
            index = cursor;
            continue;
        }
        if let Some(end) = raw_string_end(&characters, index) {
            output.push_str(&blank(characters.get(index..end).unwrap_or_default()));
            index = end;
            continue;
        }
        if here == '"' {
            let mut escaped = false;
            let mut cursor = index + 1;
            let mut end = characters.len();
            while cursor < characters.len() {
                let character = characters.get(cursor).copied().unwrap_or_default();
                if escaped {
                    escaped = false;
                } else if character == '\\' {
                    escaped = true;
                } else if character == '"' {
                    end = cursor + 1;
                    break;
                }
                cursor += 1;
            }
            output.push_str(&blank(characters.get(index..end).unwrap_or_default()));
            index = end;
            continue;
        }
        output.push(here);
        index += 1;
    }
    output
}

/// The end of a raw string (`r"…"`, `br#"…"#`) that starts at `start`, `None` when none does.
fn raw_string_end(characters: &[char], start: usize) -> Option<usize> {
    let first = characters.get(start).copied()?;
    if first != 'r' && first != 'b' {
        return None;
    }
    let mut cursor = start;
    if first == 'b' {
        if characters.get(cursor + 1) != Some(&'r') {
            return None;
        }
        cursor += 2;
    } else {
        cursor += 1;
    }
    let mut hashes = 0;
    while characters.get(cursor) == Some(&'#') {
        hashes += 1;
        cursor += 1;
    }
    if characters.get(cursor) != Some(&'"') {
        return None;
    }
    cursor += 1;
    let terminator: Vec<char> = std::iter::once('"')
        .chain(std::iter::repeat_n('#', hashes))
        .collect();
    let mut at = cursor;
    while at + terminator.len() <= characters.len() {
        if characters.get(at..at + terminator.len()) == Some(terminator.as_slice()) {
            return Some(at + terminator.len());
        }
        at += 1;
    }
    Some(characters.len())
}

static MODULE_LINE: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"^\s*(?:pub(?:\s*\([^\r\n)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;")
});

fn extract_rust_module_names(text: &str) -> Vec<String> {
    let mut names: BTreeSet<String> = BTreeSet::new();
    for line in strip_rust_non_code(text).split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if let Some(found) = MODULE_LINE.captures(line) {
            if let Some(name) = found.get(1) {
                names.insert(name.as_str().to_string());
            }
        }
    }
    let mut sorted: Vec<String> = names.into_iter().collect();
    utf16::sort(&mut sorted);
    sorted
}

pub fn discover_rust_implementation_evidence(
    files: &RepositoryFiles<'_>,
    skipped: &mut SkipLog,
) -> RustEvidence {
    let empty = || RustEvidence {
        rows: Vec::new(),
        skip_directories: BTreeSet::new(),
    };
    if files.probe("Cargo.toml") == Probe::Missing {
        return empty();
    }
    match crate::semantic_evidence::package_contract_issue(files, "Cargo.toml", CARGO_MANIFEST_MAX_BYTES) {
        Err(reason) => {
            // A manifest that is a folder or cannot be opened is not a Rust package, as for the
            // script server; only a link out of the root or a size over the limit is a finding.
            if !reason.ends_with("cannot be read") {
                skipped.push_once(files.display("Cargo.toml"), reason);
            }
            return empty();
        }
        Ok(text) => {
            if extract_cargo_contract(&text).is_err() {
                return empty();
            }
        }
    }
    if !files.is_folder("src") {
        return empty();
    }
    let mut targets: Vec<RustRow> = Vec::new();
    let mut skip_directories: BTreeSet<String> = BTreeSet::new();
    let mut add_target = |path: String, name: String, files: &RepositoryFiles<'_>| {
        if files.is_file(&path) {
            targets.push(RustRow {
                path,
                name,
                kind: "rust-target",
            });
        }
    };
    add_target("src/lib.rs".to_string(), "lib".to_string(), files);
    add_target("src/main.rs".to_string(), "main".to_string(), files);
    if files.is_folder("src/bin") {
        skip_directories.insert("src/bin".to_string());
        for (entry, probe) in files.entries("src/bin") {
            if let Some(stem) = entry.strip_suffix(".rs") {
                add_target(join("src/bin", &entry), stem.to_string(), files);
            } else if probe == Probe::Folder {
                add_target(join(&join("src/bin", &entry), "main.rs"), entry.clone(), files);
            }
        }
    }
    let mut modules: Vec<RustRow> = Vec::new();
    let mut seen: BTreeSet<String> = targets.iter().map(|row| row.path.clone()).collect();
    for target in &targets {
        if modules.len() >= RUST_IMPLEMENTATION_ELEMENT_LIMIT {
            break;
        }
        let Ok(text) = files.text(&target.path) else {
            continue;
        };
        if text.len() > RUST_SOURCE_MAX_BYTES {
            continue;
        }
        let target_dir = parent_of(&target.path).to_string();
        for module in extract_rust_module_names(&text)
            .into_iter()
            .take(RUST_MODULES_PER_TARGET_LIMIT)
        {
            let candidates = [
                join(&target_dir, &format!("{module}.rs")),
                join(&join(&target_dir, &module), "mod.rs"),
            ];
            let Some(path) = candidates.into_iter().find(|candidate| files.is_file(candidate)) else {
                continue;
            };
            if !seen.insert(path.clone()) {
                continue;
            }
            let root = parent_of(&path).to_string();
            if root != "src" {
                skip_directories.insert(root);
            }
            modules.push(RustRow {
                path,
                name: module,
                kind: "rust-module",
            });
            if targets.len() + modules.len() >= RUST_IMPLEMENTATION_ELEMENT_LIMIT {
                break;
            }
        }
    }
    let rows = targets
        .into_iter()
        .chain(modules)
        .take(RUST_IMPLEMENTATION_ELEMENT_LIMIT)
        .collect();
    RustEvidence {
        rows,
        skip_directories,
    }
}

pub fn materialize_rust_implementation_elements(
    rows: &[RustRow],
    existing: &[ElementCandidate],
) -> Vec<ElementCandidate> {
    let mut claimed: BTreeSet<String> = existing.iter().map(|row| row.slug.clone()).collect();
    let mut out = Vec::new();
    for row in rows {
        let base = slugify(&row.name.replace('_', "-"));
        if base.is_empty() {
            continue;
        }
        let bare = format!("elements/{base}");
        let slug = if claimed.contains(&bare) {
            format!("elements/{base}-{}", row.kind)
        } else {
            bare
        };
        if claimed.contains(&slug) {
            continue;
        }
        claimed.insert(slug.clone());
        out.push(ElementCandidate::at(slug, humanize(&base), None, &row.path));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn module_declarations_in_comments_and_strings_are_not_modules() {
        let names = extract_rust_module_names(
            "mod real;\n// mod fake;\n/* mod nested; */\nconst S: &str = \"mod text;\";\npub(crate) mod also;\n",
        );
        assert_eq!(names, ["also", "real"]);
    }

    #[test]
    fn a_config_files_call_names_the_makefiles_it_generates() {
        let targets = extract_makefile_targets("AC_CONFIG_FILES([Makefile src/Makefile docs/api.txt])\n");
        assert_eq!(targets, ["Makefile", "src/Makefile"]);
    }
}
