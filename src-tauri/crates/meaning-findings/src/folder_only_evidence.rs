//! A capability or element whose `path:` names a folder. Drift on a folder can never be checked
//! (a folder's date moves on almost any commit below it), so the node's evidence stays "unknown"
//! until it names the one file an unfamiliar agent should open first.

use std::path::Path;

use answer_format::utf16;
use answer_format::whitespace::trim;
use confined_files::{EntryKind, SourceFiles};
use vault_document::LoadedDocument;

use crate::finding::Finding;
use crate::repository_path::inside_repository;

const FOLDER_EVIDENCE_KINDS: [&str; 2] = ["capability", "element"];

/// File names (without extension) in the order an unfamiliar agent would try them.
const ENTRY_POINT_NAMES: [&str; 9] = [
    "index", "main", "mod", "app", "server", "cli", "lib", "init", "__init__",
];

fn without_extension(name: &str) -> &str {
    match name.rfind('.') {
        Some(at) if at + 1 < name.len() => name.get(..at).unwrap_or(name),
        _ => name,
    }
}

/// The file inside a folder an unfamiliar agent would open first: a conventional entry name, else
/// the first file by name. `None` when the folder holds no file the scan may see.
fn entry_point_inside(source: &dyn SourceFiles, folder: &Path) -> Option<String> {
    let listing = source.list_directory(folder).ok()?;
    let mut files: Vec<String> = listing
        .entries
        .into_iter()
        .filter(|entry| match entry.kind {
            EntryKind::File => true,
            EntryKind::Symlink => source
                .kind(&folder.join(&entry.name))
                .is_ok_and(|kind| kind == Some(EntryKind::File)),
            EntryKind::Directory | EntryKind::Other => false,
        })
        .map(|entry| entry.name)
        .collect();
    utf16::sort(&mut files);
    for wanted in ENTRY_POINT_NAMES {
        if let Some(found) = files
            .iter()
            .find(|name| without_extension(name).to_lowercase() == wanted)
        {
            return Some(found.clone());
        }
    }
    files.into_iter().next()
}

fn message(slug: &str, path: &str, suggestion: Option<&str>) -> String {
    let opener = match suggestion {
        Some(file) => format!("Name the one file an unfamiliar agent should open first \u{2014} `{file}` is what this folder offers as an entry point"),
        None => "Name the one file an unfamiliar agent should open first".to_string(),
    };
    let named = suggestion.map_or_else(
        || format!("{}/<file>", path.trim_end_matches('/')),
        str::to_string,
    );
    format!(
        "\"{slug}\" cites `path: {path}`, and that is a directory. The write succeeded, but drift on a folder can never be checked: a folder's timestamp moves on almost any commit underneath it, so this node's evidence is permanently \"unknown\" rather than current or stale. {opener}: patch_concept({{slug:\"{slug}\", frontmatter:{{path:\"{named}\"}}}}). Keep the folder in the body as context if it matters; the frontmatter slot is for the one entry point."
    )
}

/// The finding for `document` when its `path:` names a folder of the repository `source` reads,
/// else `None`. Silent for a path that is absent (path drift says so), outside the tree, or one the
/// scan may not look at.
pub fn folder_only_evidence_finding(
    document: &LoadedDocument,
    source: &dyn SourceFiles,
) -> Option<Finding> {
    let kind = trim(document.frontmatter().text("kind")?);
    if !FOLDER_EVIDENCE_KINDS.contains(&kind) {
        return None;
    }
    let cited = inside_repository(document.frontmatter().text("path")?)?;
    let place = source.root().join(&cited.below_root);
    if source.kind(&place).ok()? != Some(EntryKind::Directory) {
        return None;
    }
    let suggestion = entry_point_inside(source, &place)
        .map(|entry| format!("{}/{entry}", cited.written.trim_end_matches('/')));
    Some(Finding {
        code: "folder-only-evidence",
        slug: document.slug().to_string(),
        key: "path".to_string(),
        refs: vec![cited.written.clone()],
        count: 1,
        message: message(document.slug(), &cited.written, suggestion.as_deref()),
    })
}
