//! Every area of a survey listed by area, measured by evidence. An ability the survey found is on
//! the map when a capability or element points at its file: by `path:` (a folder strictly below
//! its area's folder points at the files under it), or by cited lines that exist in the file;
//! nothing else counts. An ability whose file, or a folder above it, the project leaves out is
//! not counted, nor is an area left out whole or one whose every ability file is left out.
//!
//! Not mapped yet: an area holding a counted ability not on the map, or one holding none that no
//! node's path falls in and no domain names. Largest gap first, ties by lines. The measure reads
//! the vault's first project only.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use confined_files::SourceFiles;
use regex::Regex;
use repository_survey::{AbilityFile, AreaLocator, AreaRow};
use source_reads::ReadsUnder;
use vault_document::LoadedDocument;

use crate::ability_placement::NOT_MAPPED_LINE;
use crate::line_cites::{line_cites, pattern};
use crate::node_fields::{kind_of, node_path, project_of, section_of};

/// The measure of a survey by area.
#[derive(Debug)]
pub(crate) struct AreaCoverage<'a> {
    pub counted: usize,
    pub abilities: usize,
    pub uncovered: usize,
    /// Largest gap first.
    pub not_mapped: Vec<NotMappedArea<'a>>,
}

#[derive(Debug)]
pub(crate) struct NotMappedArea<'a> {
    pub area: &'a AreaRow,
    pub abilities: usize,
    pub uncovered: usize,
    /// The files holding abilities no node points at, most abilities first.
    pub uncovered_files: Vec<&'a AbilityFile>,
}

static LEFT_OUT: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?i-u)\b(?:exclud\w*|left\s+out|leaves?\s+out|out\s+of\s+scope|not\s+(?:a\s+|the\s+)?(?:product|part\s+of\s+the\s+product)|tooling|build\s+(?:tool|plugin|script)s?|generated|vendored|third[-\s]party|demo|examples?|samples?|tests?|fixtures?|benchmarks?)\b",
    )
});
static STILL_TO_MAP: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?i-u)\b(?:unopened|unread|unmapped|not\s+(?:yet\s+)?(?:opened|read|mapped|traced|inspected)|never\s+opened|outlined?\s+only|later)\b",
    )
});
static LINE_CITE_AFTER: LazyLock<Regex> = LazyLock::new(|| pattern(r"^[:#]L?[0-9]"));
static FILE_EXTENSION: LazyLock<Regex> = LazyLock::new(|| pattern(r"\.[A-Za-z][A-Za-z0-9_]{0,9}$"));
static LINE_LEAD: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^\s*(?:(?:[-*+]|[0-9]+[.)])\s+)?[`*_]*$"));

/// `path` as `path.posix.normalize` writes it: no `.` or empty part, a `..` cancelling the part
/// before it.
pub(crate) fn normalize_path(path: &str) -> String {
    let rooted = path.starts_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." if parts.last().is_some_and(|last| *last != "..") => {
                parts.pop();
            }
            ".." if rooted => {}
            other => parts.push(other),
        }
    }
    let joined = parts.join("/");
    match (rooted, joined.is_empty()) {
        (true, _) => format!("/{joined}"),
        (false, true) => ".".to_string(),
        (false, false) => joined,
    }
}

/// `path` and every folder above it, longest first.
fn path_and_folders(path: &str) -> Vec<String> {
    let parts: Vec<&str> = path.split('/').collect();
    (0..parts.len())
        .filter_map(|cut| parts.get(..parts.len() - cut).map(|head| head.join("/")))
        .collect()
}

struct Mention {
    at: usize,
    end: usize,
    folder_suffix: bool,
}

fn is_name_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// Each place `text` names `path` as a whole path, not part of a longer path, file or word; a
/// trailing `/` or `/**` belongs to the name. `.` is never named.
fn path_mentions(text: &str, path: &str) -> Vec<Mention> {
    if path.is_empty() || path == "." {
        return Vec::new();
    }
    let mut found = Vec::new();
    for (at, _) in text.match_indices(path) {
        let before = text.get(..at).and_then(|head| head.chars().next_back());
        if before.is_some_and(|c| is_name_character(c) || matches!(c, '/' | '.' | '-')) {
            continue;
        }
        let tail = text.get(at + path.len()..).unwrap_or("");
        let suffix = if tail.starts_with("/**") {
            "/**"
        } else if tail.starts_with('/') {
            "/"
        } else {
            ""
        };
        let end = at + path.len() + suffix.len();
        let after = text.get(end..).unwrap_or("");
        let mut after_characters = after.chars();
        let first = after_characters.next();
        let second = after_characters.next();
        if first.is_some_and(|c| is_name_character(c) || matches!(c, '/' | '-'))
            || (first == Some('.') && second.is_some_and(is_name_character))
        {
            continue;
        }
        found.push(Mention {
            at,
            end,
            folder_suffix: !suffix.is_empty(),
        });
    }
    found
}

fn names_path(text: &str, path: &str) -> bool {
    !path_mentions(text, path).is_empty()
}

/// Whether `text` leaves `path` out. A path of two or more segments, or a file name, counts
/// wherever it is named; one folder name counts only in code form (backticked, `name/`, `name/**`)
/// or leading its line, so a word in a sentence ("no public api") leaves nothing out. A cite of
/// lines (`path:L12`) points at one row, never the whole file.
fn leaves_out_path(text: &str, path: &str) -> bool {
    let one_name = !path.contains('/') && !FILE_EXTENSION.is_match(path);
    for mention in path_mentions(text, path) {
        let after_cite: String = text
            .get(mention.end..)
            .unwrap_or("")
            .chars()
            .take(3)
            .collect();
        if LINE_CITE_AFTER.is_match(&after_cite) {
            continue;
        }
        let head = text.get(..mention.at).unwrap_or("");
        let in_code = head.ends_with('`') && text.get(mention.end..).is_some_and(|t| t.starts_with('`'));
        if !one_name || mention.folder_suffix || in_code {
            return true;
        }
        let line_start = head.rfind('\n').map_or(0, |newline| newline + 1);
        if LINE_LEAD.is_match(head.get(line_start..).unwrap_or("")) {
            return true;
        }
    }
    false
}

fn area_named_by(
    names: fn(&str, &str) -> bool,
    text: &str,
    area: &AreaRow,
) -> bool {
    if area.rest {
        area.members.iter().all(|member| names(text, member))
    } else {
        names(text, &area.path)
    }
}

/// The project's text that leaves files, folders and areas out: its `## Excludes`, and each
/// Uncertainty line that says so.
fn exclusion_text(documents: &[LoadedDocument]) -> String {
    let Some(body) = project_of(documents).and_then(|project| project.body().ok()) else {
        return String::new();
    };
    let left_out: Vec<&str> = section_of(&body, "Uncertainty")
        .split('\n')
        .filter(|line| {
            !NOT_MAPPED_LINE.is_match(line) && LEFT_OUT.is_match(line) && !STILL_TO_MAP.is_match(line)
        })
        .collect();
    let mut text = section_of(&body, "Excludes").to_string();
    for line in left_out {
        text.push('\n');
        text.push_str(line);
    }
    text
}

/// What capabilities and elements point at: `paths` each `path:` and each file whose cited lines
/// exist, with the folders above, since a family the survey found is one ability whose path is
/// its folder; `folders` a `path:` that is a folder strictly below its area's own folder, which
/// points at every file under it.
struct PointedAt {
    paths: HashSet<String>,
    folders: HashSet<String>,
}

impl PointedAt {
    fn holds(&self, file: &str) -> bool {
        self.paths.contains(file)
            || path_and_folders(file)
                .iter()
                .any(|folder| self.folders.contains(folder))
    }
}

fn area_folder<'a>(area: &'a AreaRow, path: &str) -> &'a str {
    if !area.rest {
        return &area.path;
    }
    area.members
        .iter()
        .find(|member| path == member.as_str() || path.starts_with(&format!("{member}/")))
        .map_or(area.path.as_str(), String::as_str)
}

fn pointed_at(
    documents: &[LoadedDocument],
    areas: &[AreaRow],
    locator: &AreaLocator,
    file_lines: &HashMap<&str, usize>,
    reads: Option<&ReadsUnder>,
    source: &dyn SourceFiles,
) -> PointedAt {
    let mut pointed = PointedAt {
        paths: HashSet::new(),
        folders: HashSet::new(),
    };
    for document in documents {
        if !matches!(kind_of(document), "capability" | "element") {
            continue;
        }
        let path = node_path(document).map(|path| {
            normalize_path(&path)
                .trim_end_matches('/')
                .to_string()
        });
        let body = document.body().map(std::borrow::Cow::into_owned).unwrap_or_default();
        let cited: Vec<String> = line_cites(&body, Some(source))
            .into_iter()
            .map(|mut cite| {
                if let Some(reads) = reads {
                    cite.path = reads.read_path(&cite.path).to_string();
                }
                cite
            })
            .filter(|cite| {
                file_lines
                    .get(normalize_path(&cite.path).as_str())
                    .copied()
                    .unwrap_or(0)
                    >= cite.end_line
            })
            .map(|cite| normalize_path(&cite.path))
            .collect();
        for file in path.iter().chain(&cited) {
            pointed.paths.extend(path_and_folders(file));
        }
        let Some(path) = path else { continue };
        if file_lines.contains_key(path.as_str()) {
            continue;
        }
        let Some(area) = locator.locate(&path).and_then(|at| areas.get(at)) else {
            continue;
        };
        let folder = area_folder(area, &path);
        if path != folder && (folder == "." || path.starts_with(&format!("{folder}/"))) {
            pointed.folders.insert(path);
        }
    }
    pointed
}

/// The survey's areas measured against the vault. `None` for a survey that is not by area.
pub(crate) fn measure_areas<'a>(
    documents: &[LoadedDocument],
    areas: Option<&'a [AreaRow]>,
    file_lines: &HashMap<&str, usize>,
    reads: Option<&ReadsUnder>,
    source: &dyn SourceFiles,
) -> Option<AreaCoverage<'a>> {
    let areas = areas?;
    let locator = AreaLocator::of_rows(areas);
    let placed: HashSet<usize> = documents
        .iter()
        .filter_map(|document| node_path(document).and_then(|path| locator.locate(&path)))
        .collect();
    let on_the_map = pointed_at(documents, areas, &locator, file_lines, reads, source);
    let domains: String = documents
        .iter()
        .filter(|document| kind_of(document) == "domain")
        .map(|document| document.body().map(std::borrow::Cow::into_owned).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("\n");
    let excludes = exclusion_text(documents);
    struct Counted<'a> {
        area: &'a AreaRow,
        index: usize,
        abilities: usize,
        uncovered: usize,
        uncovered_files: Vec<&'a AbilityFile>,
    }
    let mut counted: Vec<Counted<'a>> = Vec::new();
    for (index, area) in areas.iter().enumerate() {
        if area_named_by(leaves_out_path, &excludes, area) {
            continue;
        }
        let files: Vec<&AbilityFile> = area
            .ability_files
            .iter()
            .filter(|file| {
                !path_and_folders(&file.path)
                    .iter()
                    .any(|path| leaves_out_path(&excludes, path))
            })
            .collect();
        if !area.ability_files.is_empty() && files.is_empty() {
            continue;
        }
        let mut uncovered_files: Vec<&AbilityFile> = files
            .iter()
            .copied()
            .filter(|file| !on_the_map.holds(&file.path))
            .collect();
        uncovered_files.sort_by(|left, right| {
            right.abilities.cmp(&left.abilities).then_with(|| {
                answer_format::collation::compare_text(&left.path, &right.path)
            })
        });
        counted.push(Counted {
            area,
            index,
            abilities: files.iter().map(|file| file.abilities).sum(),
            uncovered: uncovered_files.iter().map(|file| file.abilities).sum(),
            uncovered_files,
        });
    }
    let abilities = counted.iter().map(|area| area.abilities).sum();
    let uncovered = counted.iter().map(|area| area.uncovered).sum();
    let counted_areas = counted.len();
    let mut not_mapped: Vec<NotMappedArea<'a>> = counted
        .into_iter()
        .filter(|entry| {
            if entry.abilities > 0 {
                entry.uncovered > 0
            } else {
                !placed.contains(&entry.index) && !area_named_by(names_path, &domains, entry.area)
            }
        })
        .map(|entry| NotMappedArea {
            area: entry.area,
            abilities: entry.abilities,
            uncovered: entry.uncovered,
            uncovered_files: entry.uncovered_files,
        })
        .collect();
    not_mapped.sort_by(|left, right| {
        right
            .uncovered
            .cmp(&left.uncovered)
            .then_with(|| right.area.lines.cmp(&left.area.lines))
    });
    Some(AreaCoverage {
        counted: counted_areas,
        abilities,
        uncovered,
        not_mapped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_is_normalized_as_a_posix_path_is() {
        assert_eq!(normalize_path("a//b/./c/../d"), "a/b/d");
        assert_eq!(normalize_path("./"), ".");
        assert_eq!(normalize_path("../a"), "../a");
    }

    #[test]
    fn a_folder_name_in_a_sentence_leaves_nothing_out_but_its_code_form_and_its_own_line_do() {
        assert!(!leaves_out_path("There is no public api here.", "api"));
        assert!(leaves_out_path("- `api` is generated", "api"));
        assert!(leaves_out_path("api/ is generated", "api"));
        assert!(leaves_out_path("- api is generated", "api"));
        assert!(leaves_out_path("see tools/gen is generated", "tools/gen"));
        assert!(!leaves_out_path("see tools/gen:L12 for the entry", "tools/gen"));
        assert!(!leaves_out_path("src/apis is generated", "src/api"));
    }
}
