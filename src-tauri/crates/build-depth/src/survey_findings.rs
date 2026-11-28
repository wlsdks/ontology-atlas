//! The findings that need the repository survey or this session's reads: a relation note about
//! nodes nobody read, a `path:` on a file without code, a path many nodes share, and a project
//! whose `Not mapped yet` summary is not the measured one. Each message names the node and the
//! files; what to do is the code's remedy, stated once per answer.

use std::collections::HashMap;

use confined_files::SourceFiles;
use repository_survey::Collection;
use source_reads::ReadsUnder;
use vault_document::frontmatter::Value;
use vault_document::{Issue, LoadedDocument};

use crate::area_coverage::AreaCoverage;
use crate::code_in_text::has_code;
use crate::line_cites::{cited_symbol, read_small_source};
use crate::node_fields::{
    kind_of, node_path, project_of, refs_of, says_outlined_only, SlugResolver,
};
use crate::not_mapped_lines::line_gap;

/// Nodes sharing one `path:` beyond this many are told apart by their file.
const SHARED_PATH_LIMIT: usize = 5;
const SHARED_PATH_LISTED: usize = 6;
const NEARBY_FILES: usize = 3;
const NOTE_KEYS: [(&str, &str); 5] = [
    ("dependencies", "depends_on"),
    ("depends_on", "depends_on"),
    ("relates", "relates"),
    ("elements", "elements"),
    ("capabilities", "capabilities"),
];

/// Up to three product files near `path`, longest first: its unit's, then its folder's.
fn nearby_files(collection: &Collection, path: &str) -> Vec<String> {
    let unit = collection.unit_of_file.get(path).copied();
    let folder = path.rsplit_once('/').map_or("", |(folder, _)| folder);
    let in_folder = format!("{folder}/");
    let mut candidates: Vec<(&str, usize)> = collection
        .product_files_listed()
        .filter(|file| file.path != path && file.lines > 0)
        .filter(|file| {
            (unit.is_some() && collection.unit_of_file.get(&file.path).copied() == unit)
                || file.path.starts_with(&in_folder)
        })
        .map(|file| (file.path.as_str(), file.lines))
        .collect();
    candidates.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| answer_format::collation::compare_text(left.0, right.0))
    });
    candidates
        .into_iter()
        .take(NEARBY_FILES)
        .map(|(path, _)| path.to_string())
        .collect()
}

fn nearby_text(collection: &Collection, path: &str) -> String {
    let nearby = nearby_files(collection, path);
    if nearby.is_empty() {
        String::new()
    } else {
        format!("; nearby: {}", nearby.join(", "))
    }
}

/// Whether a node's subject was left unread: with this session's reads, a node whose `path:` file
/// was never served; without them (a restarted server), a node whose `## Uncertainty` says so.
fn is_unread(document: &LoadedDocument, reads: &ReadsUnder) -> bool {
    if reads.reads.is_empty() {
        return document
            .body()
            .is_ok_and(|body| says_outlined_only(&body));
    }
    node_path(document).is_some_and(|path| !reads.reads.contains_key(&path))
}

fn relation_note_findings(
    documents: &[LoadedDocument],
    reads: &ReadsUnder,
) -> Vec<(String, Issue)> {
    let resolver = SlugResolver::of(documents);
    let by_slug: HashMap<&str, &LoadedDocument> = documents
        .iter()
        .map(|document| (document.slug(), document))
        .collect();
    let mut findings = Vec::new();
    for document in documents {
        let Some(notes) = document
            .frontmatter()
            .get("relation_notes")
            .and_then(Value::as_map)
        else {
            continue;
        };
        let mut listed: Vec<&str> = Vec::new();
        for (key, _) in NOTE_KEYS {
            listed.extend(refs_of(document, &[key]));
        }
        for (reference, note) in notes.iter() {
            let says_something = matches!(
                note,
                vault_document::frontmatter::Scalar::Text(text)
                    if !answer_format::whitespace::trim(text).is_empty()
            );
            if !says_something || !listed.contains(&reference.as_str()) {
                continue;
            }
            let Some(target) = resolver
                .resolve(reference)
                .and_then(|slug| by_slug.get(slug).copied())
            else {
                continue;
            };
            let unread: Vec<&LoadedDocument> = [document, target]
                .into_iter()
                .filter(|node| is_unread(node, reads))
                .collect();
            if unread.is_empty() {
                continue;
            }
            let names: Vec<&str> = unread.iter().map(|node| node.slug()).collect();
            let reason = if reads.reads.is_empty() {
                "says it was not read"
            } else if unread.len() > 1 {
                "were never read this session"
            } else {
                "was never read this session"
            };
            let selectors: Vec<String> = unread
                .iter()
                .filter_map(|node| {
                    let path = node_path(node)?;
                    let body = node.body().ok()?;
                    Some(match cited_symbol(&body, &path) {
                        Some(symbol) => format!("`{path}` symbol `{symbol}`"),
                        None => format!("`{path}`"),
                    })
                })
                .collect();
            let read = if selectors.is_empty() {
                String::new()
            } else {
                format!("; read {}", selectors.join(", "))
            };
            findings.push((
                document.slug().to_string(),
                Issue::warning(
                    "relation-note-on-unread",
                    format!(
                        "The why on {} -> {} says how they work together, but {} {reason}{read}",
                        document.slug(),
                        target.slug(),
                        names.join(" and ")
                    ),
                ),
            ));
        }
    }
    findings
}

fn entry_path_findings(
    documents: &[LoadedDocument],
    source: &dyn SourceFiles,
    collection: &Collection,
) -> Vec<(String, Issue)> {
    let mut findings = Vec::new();
    let mut by_path: Vec<(String, Vec<&str>)> = Vec::new();
    let mut at: HashMap<String, usize> = HashMap::new();
    for document in documents {
        if !matches!(kind_of(document), "capability" | "element") {
            continue;
        }
        let Some(path) = node_path(document) else {
            continue;
        };
        match at.get(&path) {
            Some(index) => {
                if let Some((_, slugs)) = by_path.get_mut(*index) {
                    slugs.push(document.slug());
                }
            }
            None => {
                at.insert(path.clone(), by_path.len());
                by_path.push((path.clone(), vec![document.slug()]));
            }
        }
        let Some(text) = read_small_source(source, &path) else {
            continue;
        };
        if has_code(&text, &path) {
            continue;
        }
        findings.push((
            document.slug().to_string(),
            Issue::warning(
                "path-without-code",
                format!(
                    "path: {path} holds no code{}",
                    nearby_text(collection, &path)
                ),
            ),
        ));
    }
    for (path, slugs) in by_path {
        if slugs.len() <= SHARED_PATH_LIMIT {
            continue;
        }
        let more = slugs.len().saturating_sub(SHARED_PATH_LISTED);
        let mut listed = slugs
            .iter()
            .take(SHARED_PATH_LISTED)
            .copied()
            .collect::<Vec<_>>()
            .join(", ");
        if more > 0 {
            listed.push_str(&format!(" and {more} more"));
        }
        let message = format!(
            "{} nodes share path: {path} ({listed}){}",
            slugs.len(),
            nearby_text(collection, &path)
        );
        for slug in slugs {
            findings.push((
                slug.to_string(),
                Issue::warning("path-shared", message.clone()),
            ));
        }
    }
    findings
}

fn not_mapped_line_findings(
    documents: &[LoadedDocument],
    coverage: Option<&AreaCoverage<'_>>,
) -> Vec<(String, Issue)> {
    let (Some(project), Some(coverage)) = (project_of(documents), coverage) else {
        return Vec::new();
    };
    let Ok(body) = project.body() else {
        return Vec::new();
    };
    line_gap(&body, coverage).map_or_else(Vec::new, |gap| {
        vec![(
            project.slug().to_string(),
            Issue::warning(
                "not-mapped-line-mismatch",
                format!("{} {gap}", project.slug()),
            ),
        )]
    })
}

/// What the survey and the session's reads give the findings besides the vault itself.
pub(crate) struct SurveyEvidence<'a> {
    pub source: &'a dyn SourceFiles,
    pub collection: &'a Collection,
    pub reads: &'a ReadsUnder,
}

pub(crate) fn survey_findings(
    documents: &[LoadedDocument],
    evidence: &SurveyEvidence<'_>,
    coverage: Option<&AreaCoverage<'_>>,
) -> Vec<(String, Issue)> {
    let mut findings = relation_note_findings(documents, evidence.reads);
    findings.extend(entry_path_findings(
        documents,
        evidence.source,
        evidence.collection,
    ));
    findings.extend(not_mapped_line_findings(documents, coverage));
    findings
}

#[cfg(test)]
mod tests {
    #![allow(
        clippy::disallowed_methods,
        clippy::indexing_slicing,
        reason = "a test plants the repository and the vault the findings read"
    )]

    use std::path::Path;
    use std::sync::Arc;

    use confined_files::{DiskSource, ScanRoots, SourceRoot, VaultRoot};
    use repository_survey::{Survey, SurveyAsked, SurveyCache, SurveyFiles};
    use vault_document::{DocumentCache, LoadedVault};

    use super::*;
    use crate::area_coverage::NotMappedArea;
    use crate::not_mapped_lines::summary_line;

    struct Scene {
        _folder: tempfile::TempDir,
        root: SourceRoot,
        survey: Arc<Survey>,
        vault: LoadedVault,
    }

    fn write(root: &Path, name: &str, text: &str) {
        let file = root.join(name);
        std::fs::create_dir_all(file.parent().expect("a parent")).expect("folder");
        std::fs::write(file, text).expect("write");
    }

    fn scene(sources: &[(&str, &str)], nodes: &[(String, String)]) -> Scene {
        let folder = tempfile::tempdir().expect("temp dir");
        let base = folder.path().canonicalize().expect("real");
        let (repository, vault) = (base.join("repo"), base.join("vault"));
        std::fs::create_dir_all(&repository).expect("repository");
        for (name, text) in sources {
            write(&repository, name, text);
        }
        for (name, text) in nodes {
            write(&vault, name, text);
        }
        let root = ScanRoots::new(repository.clone(), repository.clone())
            .expect("roots")
            .allow(&repository, "rootPath")
            .expect("allowed");
        let survey = {
            let source = DiskSource::new(&root, 1024 * 1024);
            let asked = SurveyAsked {
                label: "repo".to_string(),
                ignore: Vec::new(),
                vault_exclusion: None,
            };
            SurveyCache::default().survey(&root, &SurveyFiles::new(&source), &asked)
        };
        let vault = LoadedVault::load(
            &VaultRoot::open(&vault).expect("vault root"),
            &DocumentCache::new(),
        )
        .expect("vault");
        Scene {
            _folder: folder,
            root,
            survey,
            vault,
        }
    }

    fn findings_of(scene: &Scene, reads: &ReadsUnder) -> Vec<(String, Issue)> {
        let source = DiskSource::new(&scene.root, 1024 * 1024);
        survey_findings(
            scene.vault.documents(),
            &SurveyEvidence {
                source: &source,
                collection: &scene.survey.collection,
                reads,
            },
            None,
        )
    }

    fn slugs_with(findings: &[(String, Issue)], code: &str) -> Vec<String> {
        findings
            .iter()
            .filter(|(_, issue)| issue.code == code)
            .map(|(slug, _)| slug.clone())
            .collect()
    }

    fn message_of(findings: &[(String, Issue)], code: &str) -> String {
        findings
            .iter()
            .find(|(_, issue)| issue.code == code)
            .and_then(|(_, issue)| issue.message.clone())
            .expect("a message")
    }

    const CODE: &str = "export function run() { return 1; }\n";

    fn node(slug: &str, path: &str, more: &str, body: &str) -> (String, String) {
        (
            format!("{slug}.md"),
            format!("---\nkind: capability\ntitle: {slug}\npath: {path}\n{more}---\n{body}\n"),
        )
    }

    #[test]
    fn a_relation_note_between_nodes_nobody_read_is_a_finding_and_between_read_ones_it_is_not() {
        let unread = "## Uncertainty\n\n- Outlined only, not read.\n";
        let scene = scene(
            &[("src/order.ts", CODE), ("src/refund.ts", CODE)],
            &[
                node(
                    "capabilities/order",
                    "src/order.ts",
                    "depends_on: [capabilities/refund]\nrelation_notes:\n  capabilities/refund: \"Order asks refund for the window\"\n",
                    unread,
                ),
                node("capabilities/refund", "src/refund.ts", "", unread),
            ],
        );

        let none_read = findings_of(&scene, &ReadsUnder::default());
        assert_eq!(
            slugs_with(&none_read, "relation-note-on-unread"),
            ["capabilities/order"]
        );
        let message = message_of(&none_read, "relation-note-on-unread");
        assert!(
            message.contains("capabilities/order -> capabilities/refund"),
            "{message}"
        );
        assert!(message.contains("says it was not read"), "{message}");

        let mut reads = ReadsUnder::default();
        for path in ["src/order.ts", "src/refund.ts"] {
            reads.reads.insert(path.to_string(), Vec::new());
        }
        assert!(slugs_with(&findings_of(&scene, &reads), "relation-note-on-unread").is_empty());
    }

    #[test]
    fn a_path_on_a_file_without_code_is_a_finding_and_names_the_files_beside_it() {
        let scene = scene(
            &[
                ("src/empty.ts", "// nothing is declared here yet\n"),
                ("src/order.ts", CODE),
            ],
            &[
                node("capabilities/empty", "src/empty.ts", "", "Body."),
                node("capabilities/order", "src/order.ts", "", "Body."),
            ],
        );
        let findings = findings_of(&scene, &ReadsUnder::default());
        assert_eq!(
            slugs_with(&findings, "path-without-code"),
            ["capabilities/empty"]
        );
        assert_eq!(
            message_of(&findings, "path-without-code"),
            "path: src/empty.ts holds no code; nearby: src/order.ts"
        );
    }

    #[test]
    fn six_nodes_on_one_path_are_each_a_finding_and_five_are_not() {
        let sources = [("src/shared.ts", CODE)];
        let nodes_of = |count: usize| -> Vec<(String, String)> {
            (1..=count)
                .map(|at| node(&format!("capabilities/shared-{at}"), "src/shared.ts", "", "Body."))
                .collect()
        };

        let six = scene(&sources, &nodes_of(6));
        let findings = findings_of(&six, &ReadsUnder::default());
        assert_eq!(slugs_with(&findings, "path-shared").len(), 6);
        let message = message_of(&findings, "path-shared");
        assert!(
            message.starts_with("6 nodes share path: src/shared.ts ("),
            "{message}"
        );

        let five = scene(&sources, &nodes_of(5));
        assert!(slugs_with(&findings_of(&five, &ReadsUnder::default()), "path-shared").is_empty());
    }

    #[test]
    fn a_project_whose_not_mapped_summary_is_not_the_measured_one_is_a_finding() {
        let area = repository_survey::AreaRow {
            path: "src".to_string(),
            files: 2,
            lines: 20,
            own: false,
            rest: false,
            members: Vec::new(),
            main_files: Vec::new(),
            abilities: 4,
            ability_files: Vec::new(),
        };
        let coverage = AreaCoverage {
            counted: 3,
            abilities: 9,
            uncovered: 4,
            not_mapped: vec![NotMappedArea {
                area: &area,
                abilities: 4,
                uncovered: 4,
                uncovered_files: Vec::new(),
            }],
        };
        let project = |summary: &str| {
            scene(
                &[],
                &[(
                    "projects/shop.md".to_string(),
                    format!("---\nkind: project\ntitle: Shop\n---\nA shop.\n\n## Uncertainty\n\n- {summary}\n"),
                )],
            )
        };

        let stale = project("Not mapped yet: 1 of 3 areas, 2 of 9 abilities.");
        let found = not_mapped_line_findings(stale.vault.documents(), Some(&coverage));
        assert_eq!(
            slugs_with(&found, "not-mapped-line-mismatch"),
            ["projects/shop"]
        );

        let current = project(&summary_line(&coverage));
        assert!(not_mapped_line_findings(current.vault.documents(), Some(&coverage)).is_empty());
    }
}
