//! The file that binds projects to code folders, `.ontology-atlas/project-sources.json` beside the
//! vault: read whole, and replaced whole with every other project's binding kept as it was found.
//! The file holds the absolute folder, so a `.gitignore` beside it keeps it out of the repository.
//! A file that does not parse is never treated as empty: replacing it would destroy another
//! project's measurement.

use std::path::Path;

use confined_files::{SidecarError, VaultSidecar};
use serde::Serialize;
use serde_json::Value;

use crate::ordered_json::OrderedJson;
use crate::source_probe::SourceKind;
use crate::source_receipt::{SourceReceipt, SOURCE_RECEIPT_VERSION};

pub const SOURCE_STATE_RELATIVE_PATH: &str = ".ontology-atlas/project-sources.json";
const SOURCE_STATE_FILENAME: &str = "project-sources.json";
/// A bound private root stays out of Git.
const SIDECAR_IGNORE_CONTENT: &str = "# Ontology Atlas local runtime state: not for commit.\n*\n";
/// Larger than any state a vault produces; a file past it is malformed, not held in memory.
const SOURCE_STATE_MAX_BYTES: u64 = 64 * 1024 * 1024;

/// One project's stored binding, as much as the tools read of it.
#[derive(Debug, Clone)]
pub struct StoredBinding {
    pub project_slug: String,
    pub source_id: String,
    pub root_path: String,
    pub kind: SourceKind,
    pub bound_at: String,
    /// The receipt exactly as stored, to be judged by the reader that needs it.
    pub receipt: Option<Value>,
    kept_as_found: OrderedJson,
}

impl StoredBinding {
    pub fn measured_at(&self) -> Option<&str> {
        self.receipt.as_ref()?.get("measuredAt")?.as_str()
    }
}

#[derive(Debug)]
pub enum BindingsRead {
    Missing,
    /// The file is behind a link or a folder that is not the vault's own.
    UnsafePath,
    Malformed,
    Ok(Vec<StoredBinding>),
}

impl BindingsRead {
    /// The bindings this project holds; none unless the file read cleanly.
    pub fn bound_to(&self, project_slug: &str) -> Vec<&StoredBinding> {
        match self {
            Self::Ok(bindings) => bindings
                .iter()
                .filter(|binding| binding.project_slug == project_slug)
                .collect(),
            _ => Vec::new(),
        }
    }

    /// The word the answers of the script server used for the file's state.
    pub fn status_word(&self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::UnsafePath => "unsafe_path",
            Self::Malformed => "malformed",
            Self::Ok(_) => "ok",
        }
    }
}

fn non_empty_text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)?
        .as_str()
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn read_binding(value: &Value, kept: OrderedJson) -> Option<StoredBinding> {
    let kind = SourceKind::from_word(value.get("kind")?.as_str()?)?;
    Some(StoredBinding {
        project_slug: non_empty_text(value, "projectSlug")?,
        source_id: non_empty_text(value, "sourceId")?,
        root_path: non_empty_text(value, "rootPath")?,
        kind,
        bound_at: non_empty_text(value, "boundAt")?,
        receipt: value.get("receipt").filter(|receipt| !receipt.is_null()).cloned(),
        kept_as_found: kept,
    })
}

struct Parsed {
    bindings: Vec<StoredBinding>,
}

fn parse_state(text: &str) -> Option<Parsed> {
    let value: Value = serde_json::from_str(text).ok()?;
    if value.get("contractVersion")?.as_u64() != Some(u64::from(SOURCE_RECEIPT_VERSION)) {
        return None;
    }
    let listed = value.get("bindings")?.as_array()?;
    let OrderedJson::List(kept) = serde_json::from_str::<OrderedJson>(text).ok()?.get("bindings")?.clone()
    else {
        return None;
    };
    let bindings = listed
        .iter()
        .zip(kept)
        .map(|(binding, kept)| read_binding(binding, kept))
        .collect::<Option<Vec<_>>>()?;
    Some(Parsed { bindings })
}

struct Snapshot {
    read: BindingsRead,
    revision: Option<confined_files::Revision>,
}

fn snapshot(vault: &Path) -> Snapshot {
    let sidecar = VaultSidecar::new(vault.to_path_buf());
    let stored = match sidecar.read_text(SOURCE_STATE_FILENAME, SOURCE_STATE_MAX_BYTES) {
        Ok(stored) => stored,
        Err(SidecarError::Unsafe(_)) => {
            return Snapshot {
                read: BindingsRead::UnsafePath,
                revision: None,
            }
        }
        Err(_) => {
            return Snapshot {
                read: BindingsRead::Malformed,
                revision: None,
            }
        }
    };
    let Some(stored) = stored else {
        return Snapshot {
            read: BindingsRead::Missing,
            revision: None,
        };
    };
    let read = match parse_state(&stored.text) {
        Some(parsed) => BindingsRead::Ok(parsed.bindings),
        None => BindingsRead::Malformed,
    };
    Snapshot {
        read,
        revision: Some(stored.revision),
    }
}

pub fn read_source_bindings(vault: &Path) -> BindingsRead {
    snapshot(vault).read
}

/// The binding a connect writes. The key order is the order every writer of this file uses.
#[derive(Debug, Serialize)]
pub struct NewBinding {
    #[serde(rename = "projectSlug")]
    pub project_slug: String,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "rootPath")]
    pub root_path: String,
    pub kind: &'static str,
    #[serde(rename = "boundAt")]
    pub bound_at: String,
    pub receipt: SourceReceipt,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Written<'a> {
    Kept(&'a OrderedJson),
    New(&'a NewBinding),
}

#[derive(Serialize)]
struct State<'a> {
    #[serde(rename = "contractVersion")]
    contract_version: u8,
    bindings: Vec<Written<'a>>,
}

/// Why the file was not changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindingWriteFailure {
    UnsafePath,
    Malformed,
    Persistence,
}

fn commit(
    vault: &Path,
    bindings: Vec<Written<'_>>,
    revision: Option<confined_files::Revision>,
) -> Result<(), BindingWriteFailure> {
    let text = answer_format::json::to_string_indented(
        &State {
            contract_version: SOURCE_RECEIPT_VERSION,
            bindings,
        },
        2,
    )
    .map_err(|_| BindingWriteFailure::Persistence)?;
    let sidecar = VaultSidecar::new(vault.to_path_buf());
    let failed = |error: SidecarError| match error {
        SidecarError::Unsafe(_) => BindingWriteFailure::UnsafePath,
        _ => BindingWriteFailure::Persistence,
    };
    sidecar
        .create_text_exclusive(".gitignore", SIDECAR_IGNORE_CONTENT)
        .map_err(failed)?;
    sidecar
        .replace_text(SOURCE_STATE_FILENAME, &format!("{text}\n"), revision)
        .map_err(failed)
}

/// Replaces this project's binding and keeps every other. A malformed file blocks the write unless
/// `repair` states the intent to discard it.
pub fn write_source_binding(
    vault: &Path,
    binding: &NewBinding,
    repair: bool,
) -> Result<(), BindingWriteFailure> {
    let current = snapshot(vault);
    let kept: Vec<&StoredBinding> = match &current.read {
        BindingsRead::UnsafePath => return Err(BindingWriteFailure::UnsafePath),
        BindingsRead::Malformed if !repair => return Err(BindingWriteFailure::Malformed),
        BindingsRead::Ok(bindings) => bindings
            .iter()
            .filter(|stored| stored.project_slug != binding.project_slug)
            .collect(),
        BindingsRead::Missing | BindingsRead::Malformed => Vec::new(),
    };
    let mut written: Vec<Written<'_>> = kept
        .iter()
        .map(|stored| Written::Kept(&stored.kept_as_found))
        .collect();
    written.push(Written::New(binding));
    commit(vault, written, current.revision)
}

#[derive(Debug, PartialEq, Eq)]
pub enum Removal {
    Removed(usize),
    NotBound,
}

/// Undo: removes every binding of one project and leaves the rest untouched.
pub fn remove_source_bindings(
    vault: &Path,
    project_slug: &str,
) -> Result<Removal, BindingWriteFailure> {
    let current = snapshot(vault);
    let bindings = match &current.read {
        BindingsRead::UnsafePath => return Err(BindingWriteFailure::UnsafePath),
        BindingsRead::Malformed => return Err(BindingWriteFailure::Malformed),
        BindingsRead::Missing => return Ok(Removal::NotBound),
        BindingsRead::Ok(bindings) => bindings,
    };
    let kept: Vec<Written<'_>> = bindings
        .iter()
        .filter(|stored| stored.project_slug != project_slug)
        .map(|stored| Written::Kept(&stored.kept_as_found))
        .collect();
    let removed = bindings.len() - kept.len();
    if removed == 0 {
        return Ok(Removal::NotBound);
    }
    commit(vault, kept, current.revision)?;
    Ok(Removal::Removed(removed))
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "a test builds its folders with the standard library"
)]
mod tests {
    use super::*;
    use crate::source_receipt::{ActionRef, Diagnostics, WitnessSummary};

    fn receipt(project: &str) -> SourceReceipt {
        SourceReceipt {
            contract_version: 1,
            project_slug: project.to_string(),
            source_id: "sha256:id".to_string(),
            source_kind: "folder".to_string(),
            source_revision: "sha256:rev".to_string(),
            source_fingerprint: "sha256:fp".to_string(),
            graph_hash: "project-graph-v1:00000000".to_string(),
            measured_at: "2026-01-01T00:00:00.000Z".to_string(),
            status: "needs_evidence".to_string(),
            currentness: "current",
            top_gap: None,
            next_action: ActionRef::of("record_source_role"),
            witness_summary: WitnessSummary { total: 0, supported: 0, missing: 0 },
            witnesses: Vec::new(),
            diagnostics: Diagnostics { dirty: None, truncated: false },
        }
    }

    fn binding(project: &str) -> NewBinding {
        NewBinding {
            project_slug: project.to_string(),
            source_id: "sha256:id".to_string(),
            root_path: "/code".to_string(),
            kind: "folder",
            bound_at: "2026-01-01T00:00:00.000Z".to_string(),
            receipt: receipt(project),
        }
    }

    #[test]
    fn a_write_replaces_one_projects_binding_and_leaves_the_text_of_the_others_as_it_was() {
        let vault = tempfile::tempdir().expect("vault");
        write_source_binding(vault.path(), &binding("a"), false).expect("first");
        write_source_binding(vault.path(), &binding("b"), false).expect("second");
        let sidecar = vault.path().join(".ontology-atlas");
        let before = std::fs::read_to_string(sidecar.join(SOURCE_STATE_FILENAME)).expect("file");
        write_source_binding(vault.path(), &binding("b"), false).expect("again");
        let after = std::fs::read_to_string(sidecar.join(SOURCE_STATE_FILENAME)).expect("file");
        assert_eq!(before, after);
        assert!(after.starts_with("{\n  \"contractVersion\": 1,\n  \"bindings\": [\n    {\n      \"projectSlug\": \"a\""));
        assert!(after.ends_with("}\n"));
        assert_eq!(
            std::fs::read_to_string(sidecar.join(".gitignore")).expect("ignore"),
            SIDECAR_IGNORE_CONTENT
        );
        assert_eq!(remove_source_bindings(vault.path(), "a").expect("removes"), Removal::Removed(1));
        assert_eq!(remove_source_bindings(vault.path(), "a").expect("none"), Removal::NotBound);
        assert_eq!(read_source_bindings(vault.path()).bound_to("b").len(), 1);
    }

    #[test]
    fn a_malformed_file_blocks_a_write_until_repair_discards_it() {
        let vault = tempfile::tempdir().expect("vault");
        let sidecar = vault.path().join(".ontology-atlas");
        std::fs::create_dir(&sidecar).expect("folder");
        std::fs::write(sidecar.join(SOURCE_STATE_FILENAME), "{not json").expect("planted");
        assert!(matches!(read_source_bindings(vault.path()), BindingsRead::Malformed));
        assert_eq!(
            write_source_binding(vault.path(), &binding("a"), false),
            Err(BindingWriteFailure::Malformed)
        );
        write_source_binding(vault.path(), &binding("a"), true).expect("repair writes");
        assert_eq!(read_source_bindings(vault.path()).bound_to("a").len(), 1);
    }
}
