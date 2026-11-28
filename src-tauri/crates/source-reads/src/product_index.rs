//! The product files of a repository and what each declares, from the walk the breadth map uses
//! (no link, no hidden or credential file, no ignored folder), so a symbol read can say which
//! file a callee is in and where its callers are. Walked once per call and only when a symbol
//! read needs it.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use confined_files::{DiskSource, SourceFiles, SourceRoot};
use repository_survey::{
    collect_source_units, git_ignored_paths, CollectOptions, SourceClass, SurveyFiles,
};
use source_scan::DeclarationKind;

use crate::file_outline::OutlineKind;
use crate::opened_file::MAX_FILE_BYTES;

/// A survey reads a file this large as code; a larger one is data.
const SURVEY_FILE_BYTES: usize = 1024 * 1024;
/// Whole file texts kept for the search for call sites, in characters; past it the oldest are read
/// again from the disk.
const TEXT_CACHE_CHARACTERS: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedDeclaration {
    pub name: String,
    pub line: usize,
    pub kind: OutlineKind,
}

#[derive(Debug, Clone)]
pub struct ProductFile {
    pub path: String,
    pub declarations: Vec<IndexedDeclaration>,
}

pub struct ProductIndex {
    pub files: Vec<ProductFile>,
    /// The walk stopped at its file limit before reaching every file.
    pub truncated: bool,
    disk: DiskSource,
    texts: RefCell<TextCache>,
}

#[derive(Default)]
struct TextCache {
    held: HashMap<String, Rc<str>>,
    order: Vec<String>,
    characters: usize,
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
            .files
            .iter()
            .filter(|file| file.class == SourceClass::Product)
            .map(|file| ProductFile {
                path: file.path.clone(),
                declarations: file
                    .reading
                    .iter()
                    .flat_map(|reading| &reading.declarations)
                    .filter(|declaration| declaration.kind != DeclarationKind::Export)
                    .map(|declaration| IndexedDeclaration {
                        name: declaration.name.clone(),
                        line: declaration.line,
                        kind: declaration.kind.into(),
                    })
                    .collect(),
            })
            .collect();
        Self {
            files,
            truncated: collection.truncated,
            disk: DiskSource::new(root, MAX_FILE_BYTES as usize),
            texts: RefCell::new(TextCache::default()),
        }
    }

    /// The text of one product file, empty past the size a read opens or when unreadable.
    pub fn text_of(&self, path: &str) -> Rc<str> {
        if let Some(held) = self.texts.borrow().held.get(path) {
            return held.clone();
        }
        let absolute = self.disk.root().join(path);
        let text: Rc<str> = self
            .disk
            .read_text(&absolute)
            .map(|text| Rc::from(text.as_ref()))
            .unwrap_or_else(|_| Rc::from(""));
        let mut cache = self.texts.borrow_mut();
        cache.characters += text.chars().count();
        cache.held.insert(path.to_string(), text.clone());
        cache.order.push(path.to_string());
        while cache.characters > TEXT_CACHE_CHARACTERS && !cache.order.is_empty() {
            let oldest = cache.order.remove(0);
            if let Some(dropped) = cache.held.remove(&oldest) {
                cache.characters = cache.characters.saturating_sub(dropped.chars().count());
            }
        }
        text
    }
}
