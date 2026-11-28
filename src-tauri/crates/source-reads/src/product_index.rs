//! The product files of a repository and what each declares, from the walk the breadth map uses
//! (no link, no hidden or credential file, no ignored folder), so a symbol read can say which
//! file a callee is in and where its callers are. Walked once per call and only when a symbol
//! read needs it; the declarations are the ones the survey's single read of each file produced.

use std::sync::Arc;

use confined_files::{DiskSource, SourceRoot};
use repository_survey::{
    collect_source_units, git_ignored_paths, CollectOptions, SurveyFiles, SurveyedFile,
};

use crate::file_outline::{is_line_scanned, OutlineDeclaration, OutlineKind};
use crate::kept_files::{kept_line_scanned_declarations, kept_text};

/// A survey reads a file this large as code; a larger one is data.
const SURVEY_FILE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeclarationRow {
    pub path: String,
    pub line: usize,
    pub kind: OutlineKind,
    pub name: String,
}

pub struct ProductFile {
    pub path: String,
    pub declarations: Vec<DeclarationRow>,
}

pub struct ProductIndex {
    pub files: Vec<ProductFile>,
    root: SourceRoot,
}

/// The code declarations of a product file. The survey already read the file's syntax tree, so its
/// declarations are taken as they are; only a language the survey has no tree for (Ruby, C#) is
/// read again here, by its line scanner, and kept by the file's stamp.
fn declarations_of(file: &SurveyedFile, root: &SourceRoot) -> Vec<DeclarationRow> {
    let declared: Vec<OutlineDeclaration> = if is_line_scanned(&file.path) {
        kept_line_scanned_declarations(root, &file.path).to_vec()
    } else {
        file.reading
            .iter()
            .flat_map(|read| &read.declarations)
            .map(|declaration| OutlineDeclaration {
                line: declaration.line,
                kind: declaration.kind.into(),
                name: declaration.name.clone(),
                signature: declaration.signature.clone(),
            })
            .collect()
    };
    declared
        .into_iter()
        .filter(|declaration| declaration.kind.is_code())
        .map(|declaration| DeclarationRow {
            path: file.path.clone(),
            line: declaration.line,
            kind: declaration.kind,
            name: declaration.name,
        })
        .collect()
}

impl ProductIndex {
    pub fn walk(root: &SourceRoot, extra_ignore: &[String]) -> Self {
        let survey_disk = DiskSource::new(root, SURVEY_FILE_BYTES);
        let survey_files = SurveyFiles::new(&survey_disk);
        let git_ignored = git_ignored_paths(root.as_path());
        let collection = collect_source_units(
            &survey_files,
            &CollectOptions {
                ignore: extra_ignore,
                vault_exclusion: None,
                git_ignored: &git_ignored,
            },
        );
        let files = collection
            .product_files_listed()
            .map(|file| ProductFile {
                path: file.path.clone(),
                declarations: declarations_of(file, root),
            })
            .collect();
        Self {
            files,
            root: root.clone(),
        }
    }

    /// The text of one product file, empty past the size a read opens or when unreadable.
    pub fn text_of(&self, path: &str) -> Arc<str> {
        kept_text(&self.root, path)
    }
}
