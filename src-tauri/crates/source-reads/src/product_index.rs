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

use crate::file_outline::{outline_file, OutlineKind};
use crate::opened_file::MAX_FILE_BYTES;

/// A survey reads a file this large as code; a larger one is data.
const SURVEY_FILE_BYTES: usize = 1024 * 1024;
/// Whole file texts kept for the search for call sites, in characters; past it the oldest are read
/// again from the disk.
const TEXT_CACHE_CHARACTERS: usize = 4 * 1024 * 1024;

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
        let reading = DiskSource::new(root, MAX_FILE_BYTES as usize);
        let files = collection
            .files
            .iter()
            .filter(|file| file.class == SourceClass::Product)
            .map(|file| {
                let absolute = file
                    .path
                    .split('/')
                    .fold(root.as_path().to_path_buf(), |joined, part| {
                        joined.join(part)
                    });
                let text = reading.read_text(&absolute).unwrap_or_default();
                let declarations = outline_file(&text, &file.path)
                    .declarations
                    .into_iter()
                    .filter(|declaration| declaration.kind.is_code())
                    .map(|declaration| DeclarationRow {
                        path: file.path.clone(),
                        line: declaration.line,
                        kind: declaration.kind,
                        name: declaration.name,
                    })
                    .collect();
                ProductFile {
                    path: file.path.clone(),
                    declarations,
                }
            })
            .collect();
        Self {
            files,
            root: root.clone(),
            texts: RefCell::new(TextCache::default()),
        }
    }

    /// The text of one product file, empty past the size a read opens or when unreadable.
    pub fn text_of(&self, path: &str) -> Rc<str> {
        if let Some(held) = self.texts.borrow().held.get(path) {
            return held.clone();
        }
        let absolute = path
            .split('/')
            .fold(self.root.as_path().to_path_buf(), |joined, part| {
                joined.join(part)
            });
        let text: Rc<str> = DiskSource::new(&self.root, MAX_FILE_BYTES as usize)
            .read_text(&absolute)
            .map_or_else(|_| Rc::from(""), |text| Rc::from(&*text));
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
