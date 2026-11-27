//! What the graph tests share: a vault planted in a temporary folder, read as the server reads it.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests plant the files of a temporary vault, which the document cache then reads"
)]

use std::fs;

use confined_files::VaultRoot;
use ontology_graph::{compile, CompiledGraph};
use vault_document::{DocumentCache, LoadedDocument, LoadedVault};

pub struct PlantedVault {
    _directory: tempfile::TempDir,
    pub documents: Vec<LoadedDocument>,
}

/// A uid that is a valid lowercase UUIDv4 and differs for each `number`.
pub fn uid(number: usize) -> String {
    format!("{number:08x}-0000-4000-8000-000000000000")
}

/// One node file: a kind, a uid and the lines the caller adds.
pub fn node(number: usize, kind: &str, extra: &str) -> String {
    format!(
        "---\nuid: {}\nkind: {kind}\ntitle: Node {number}\n{extra}---\n\nBody {number}.\n",
        uid(number)
    )
}

pub fn plant(files: &[(String, String)]) -> PlantedVault {
    let directory = tempfile::tempdir().expect("temp dir");
    let root = VaultRoot::open(directory.path()).expect("vault");
    for (name, text) in files {
        let path = root.path().join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("folder");
        }
        fs::write(path, text).expect("file");
    }
    let vault = LoadedVault::load(&root, &DocumentCache::new()).expect("reads");
    PlantedVault {
        documents: vault.documents().to_vec(),
        _directory: directory,
    }
}

pub fn compiled(files: &[(String, String)]) -> CompiledGraph {
    compile(&plant(files).documents).expect("compiles")
}
