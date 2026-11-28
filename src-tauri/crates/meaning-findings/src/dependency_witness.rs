//! A declared dependency its citing file never mentions. A missing import is not proof of
//! independence (a record, an event or a configuration needs none), so the finding asks for the
//! witness and does not ask for removal.
//!
//! The witness is the citing node's own file, or any repository file the edge's `relation_notes`
//! names (an edge across a boundary is witnessed by the bridge, not by either end). Only two
//! spellings count: the target's path verbatim, or its extensionless name as one word of an import
//! specifier. Silent whenever an input would be a guess: no `path:` on either end, a path outside
//! the repository, a source that cannot be read.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use answer_format::whitespace::{is_whitespace, trim};
use confined_files::{EntryKind, Refusal, SourceFiles, SourceReadError};
use vault_document::frontmatter::{Frontmatter, Scalar};
use vault_document::LoadedDocument;

use crate::finding::Finding;
use crate::module_specifiers::module_specifiers;
use crate::note_paths::path_tokens_in;
use crate::repository_path::inside_repository;

const DEPENDENCY_KEYS: [&str; 2] = ["dependencies", "depends_on"];
const MODULE_ROOT_NAMES: [&str; 3] = ["mod", "index", "__init__"];
/// A file larger than this is not read for a witness; the edge is then not judged.
pub const WITNESS_TEXT_MAX_BYTES: usize = 2 * 1024 * 1024;

/// Which implementation file each node cites: by full slug first, then by the tail every author
/// types, and only when that tail names one node, because a guess here becomes an accusation about
/// the wrong file.
pub struct CitedPaths {
    by_slug: HashMap<String, String>,
    by_tail: HashMap<String, String>,
}

impl CitedPaths {
    pub fn of(documents: &[LoadedDocument]) -> Self {
        let mut by_slug = HashMap::new();
        let mut tail_counts: HashMap<&str, usize> = HashMap::new();
        for document in documents {
            let Some(path) = document
                .frontmatter()
                .text("path")
                .map(trim)
                .filter(|path| !path.is_empty())
            else {
                continue;
            };
            by_slug.insert(document.slug().to_string(), path.to_string());
            let tail = tail_of(document.slug());
            if !tail.is_empty() && tail != document.slug() {
                *tail_counts.entry(tail).or_default() += 1;
            }
        }
        let mut by_tail = HashMap::new();
        for (slug, path) in &by_slug {
            let tail = tail_of(slug);
            if !tail.is_empty() && tail != slug && tail_counts.get(tail) == Some(&1) {
                by_tail.insert(tail.to_string(), path.clone());
            }
        }
        Self { by_slug, by_tail }
    }

    pub fn of_reference(&self, reference: &str) -> Option<&str> {
        self.by_slug
            .get(reference)
            .or_else(|| self.by_tail.get(reference))
            .map(String::as_str)
    }
}

fn tail_of(slug: &str) -> &str {
    slug.rsplit('/').next().unwrap_or_default()
}

/// The names each read file brings in, kept while one validation runs so a file cited by many
/// nodes is read once.
#[derive(Default)]
pub struct ImportedNames(HashMap<String, HashSet<String>>);

enum WitnessRead {
    Text { path: String, text: String },
    TooLarge { path: String },
}

impl WitnessRead {
    fn path(&self) -> &str {
        match self {
            Self::Text { path, .. } | Self::TooLarge { path } => path,
        }
    }
}

fn read_witness(source: &dyn SourceFiles, place: &Path, path: &str) -> Option<WitnessRead> {
    if source.kind(place).ok()? != Some(EntryKind::File) {
        return None;
    }
    match source.read_text(place) {
        Ok(text) => Some(WitnessRead::Text {
            path: path.to_string(),
            text: text.into_owned(),
        }),
        Err(SourceReadError::Refused(Refusal::FileOverSizeLimit)) => Some(WitnessRead::TooLarge {
            path: path.to_string(),
        }),
        Err(_) => None,
    }
}

fn declared_dependencies(frontmatter: &Frontmatter) -> Vec<&str> {
    let mut targets: Vec<&str> = Vec::new();
    for key in DEPENDENCY_KEYS {
        for reference in frontmatter.list(key).unwrap_or_default() {
            let reference = trim(reference);
            if !reference.is_empty() && !targets.contains(&reference) {
                targets.push(reference);
            }
        }
    }
    targets
}

/// The rationale stored for one edge, under the canonical key or its tail.
fn relation_note_text<'a>(frontmatter: &'a Frontmatter, target: &str) -> &'a str {
    let Some(notes) = frontmatter
        .get("relation_notes")
        .and_then(|value| value.as_map())
    else {
        return "";
    };
    let text_of = |scalar: &'a Scalar| match scalar {
        Scalar::Text(text) => Some(text.as_str()),
        _ => None,
    };
    if let Some(text) = notes.get(target).and_then(text_of) {
        return text;
    }
    let tail = tail_of(target);
    notes
        .iter()
        .filter_map(|(key, value)| text_of(value).map(|text| (key.as_str(), text)))
        .find(|(key, _)| *key == target || tail_of(key) == tail)
        .map_or("", |(_, text)| text)
}

fn file_stem(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    match name.rfind('.') {
        Some(at) if at + 1 < name.len() => name.get(..at).unwrap_or(name),
        _ => name,
    }
}

/// The names an import of `path` carries: `src/shared/nav.ts` is `nav`; a module root answers to
/// its folder too (`src/export/mod.rs` is `use crate::export`, `pkg/__init__.py` is `import pkg`).
fn witness_names_for(path: &str) -> Vec<String> {
    let stem = file_stem(path);
    if !MODULE_ROOT_NAMES.contains(&stem) {
        return vec![stem.to_string()];
    }
    let folder = path
        .rsplit_once('/')
        .and_then(|(directory, _)| directory.rsplit('/').next())
        .unwrap_or_default();
    if folder.is_empty() || folder == "." {
        vec![stem.to_string()]
    } else {
        vec![stem.to_string(), folder.to_string()]
    }
}

/// The words of every specifier: split at `::`, at `/ \ { } ,` and spaces, and at a dot that is
/// not an extension, each with its extension taken off.
fn words_of_specifier(specifier: &str) -> Vec<String> {
    let characters: Vec<char> = specifier.chars().collect();
    let mut words = Vec::new();
    let mut word = String::new();
    let mut index = 0;
    let mut flush = |word: &mut String| {
        words.push(strip_extension(word).to_string());
        word.clear();
    };
    while let Some(&character) = characters.get(index) {
        let separator_width = if character == ':' && characters.get(index + 1) == Some(&':') {
            Some(2)
        } else if matches!(character, '/' | '\\' | '{' | '}' | ',') || is_whitespace(character) {
            let mut width = 1;
            while characters.get(index + width).is_some_and(|next| {
                matches!(next, '/' | '\\' | '{' | '}' | ',') || is_whitespace(*next)
            }) {
                width += 1;
            }
            Some(width)
        } else if character == '.' && !is_extension_tail(&characters, index + 1) {
            Some(1)
        } else {
            None
        };
        match separator_width {
            Some(width) => {
                flush(&mut word);
                index += width;
            }
            None => {
                word.push(character);
                index += 1;
            }
        }
    }
    flush(&mut word);
    words
}

/// One to ten letters and digits up to the end: what follows a dot that is a file extension.
fn is_extension_tail(characters: &[char], from: usize) -> bool {
    let rest = characters.get(from..).unwrap_or_default();
    (1..=10).contains(&rest.len()) && rest.iter().all(char::is_ascii_alphanumeric)
}

fn strip_extension(word: &str) -> &str {
    match word.rfind('.') {
        Some(at) if at + 1 < word.len() => word.get(..at).unwrap_or(word),
        _ => word,
    }
}

fn witnesses(
    read: &WitnessRead,
    target_path: &str,
    names: &[String],
    cache: &mut ImportedNames,
) -> bool {
    let WitnessRead::Text { path, text } = read else {
        return false;
    };
    if text.contains(target_path) {
        return true;
    }
    let names: Vec<&String> = names.iter().filter(|name| !name.is_empty()).collect();
    if names.is_empty() {
        return false;
    }
    let imported = cache.0.entry(path.clone()).or_insert_with(|| {
        module_specifiers(text)
            .iter()
            .flat_map(|specifier| words_of_specifier(specifier))
            .collect()
    });
    names.iter().any(|name| imported.contains(name.as_str()))
}

fn unjudged_message(slug: &str, target: &str, unread: &[String]) -> String {
    let mebibytes = WITNESS_TEXT_MAX_BYTES / 1024 / 1024;
    let named = unread
        .iter()
        .map(|path| format!("`{path}`"))
        .collect::<Vec<_>>()
        .join(" and ");
    let verb = if unread.len() > 1 { "are" } else { "is" };
    format!("\"{slug}\" declares a dependency on \"{target}\", but {named} {verb} larger than {mebibytes} MiB, so no witness was looked for there and the edge is not judged. Cite a smaller file in `path:`, or name the file that imports the target in this relation's `why`.")
}

fn unwitnessed_message(
    slug: &str,
    source_path: &str,
    target: &str,
    target_path: &str,
    witness_name: &str,
) -> String {
    format!("\"{slug}\" depends on \"{target}\", and `{source_path}` never imports `{target_path}` (nothing there names `{witness_name}`). Nothing is blocked: a missing import is not proof of independence (a record, an event or configuration needs none), and the edge stays listed here as unwitnessed. If a file does import it, name that repository-relative file in the edge's why with replace_relation (same from, to and type, confirm:true); remove_relation only an edge that came from look-alike names.")
}

/// One finding for each dependency of `document` that its file does not witness.
pub fn dependency_witness_findings(
    document: &LoadedDocument,
    source: &dyn SourceFiles,
    cited: &CitedPaths,
    imported: &mut ImportedNames,
) -> Vec<Finding> {
    let frontmatter = document.frontmatter();
    let Some(cites) = frontmatter.text("path").and_then(inside_repository) else {
        return Vec::new();
    };
    let targets = declared_dependencies(frontmatter);
    if targets.is_empty() {
        return Vec::new();
    }
    let Some(own) = read_witness(
        source,
        &source.root().join(&cites.below_root),
        &cites.written,
    ) else {
        return Vec::new();
    };
    let mut candidates: HashMap<String, Option<usize>> = HashMap::new();
    let mut opened: Vec<WitnessRead> = vec![own];
    let mut ancestors: Vec<String> = Vec::new();
    let mut directory = cites.written.as_str();
    while let Some((parent, _)) = directory.rsplit_once('/') {
        if parent.is_empty() || parent == "." {
            break;
        }
        ancestors.push(parent.to_string());
        directory = parent;
    }
    let mut findings = Vec::new();
    for target in targets {
        let Some(target_path) = cited
            .of_reference(target)
            .and_then(inside_repository)
        else {
            continue;
        };
        let names = witness_names_for(&target_path.written);
        let mut reads: Vec<usize> = vec![0];
        for token in path_tokens_in(relation_note_text(frontmatter, target)) {
            let at = *candidates.entry(token.clone()).or_insert_with(|| {
                let tries = std::iter::once(String::new()).chain(ancestors.iter().cloned());
                for base in tries {
                    let joined = if base.is_empty() {
                        token.clone()
                    } else {
                        format!("{base}/{token}")
                    };
                    let Some(place) = inside_repository(&joined) else {
                        continue;
                    };
                    if let Some(read) = read_witness(
                        source,
                        &source.root().join(&place.below_root),
                        &place.written,
                    ) {
                        opened.push(read);
                        return Some(opened.len() - 1);
                    }
                }
                None
            });
            reads.extend(Some(at).flatten());
        }
        let witnessed = reads.iter().any(|at| {
            opened
                .get(*at)
                .is_some_and(|read| witnesses(read, &target_path.written, &names, imported))
        });
        if witnessed {
            continue;
        }
        let mut unread: Vec<String> = Vec::new();
        for at in &reads {
            if let Some(WitnessRead::TooLarge { path }) = opened.get(*at) {
                if !unread.contains(path) {
                    unread.push(path.clone());
                }
            }
        }
        let own_path = opened.first().map_or("", WitnessRead::path);
        let (code, message) = if unread.is_empty() {
            (
                "dependency-unwitnessed",
                unwitnessed_message(
                    document.slug(),
                    own_path,
                    target,
                    &target_path.written,
                    names.first().map_or("", String::as_str),
                ),
            )
        } else {
            (
                "dependency-unjudged",
                unjudged_message(document.slug(), target, &unread),
            )
        };
        findings.push(Finding {
            code,
            slug: document.slug().to_string(),
            key: target.to_string(),
            refs: vec![target.to_string()],
            count: 1,
            message,
        });
    }
    findings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_module_root_is_witnessed_by_its_folder_and_an_import_word_by_its_stem() {
        assert_eq!(witness_names_for("src/export/mod.rs"), ["mod", "export"]);
        assert_eq!(witness_names_for("src/shared/nav.ts"), ["nav"]);
        assert_eq!(words_of_specifier("./order/placement.ts"), ["", "", "order", "placement"]);
        assert!(words_of_specifier("crate::order::{place, cancel}").contains(&"cancel".to_string()));
        assert_eq!(words_of_specifier("a.b.c"), ["a", "b"]);
    }
}
