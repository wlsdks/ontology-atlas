//! Where an imported name is declared, found by structure: an import names a module, the module is
//! resolved to its files once, and the name is looked up in those files' declarations only. A
//! same-named declaration anywhere else neither competes with the import nor costs time.
//!
//! One survey is built per call from the product files and holds each file's declarations by name,
//! every module path a file answers to, and each spec's resolution. After that pass, a read costs
//! the number of imports and calls it examines: each lookup is a few map reads.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use crate::import_bindings::{language_of, segment_suffixes, stems_of, Imports, Spec};
use crate::product_index::{DeclarationRow, ProductIndex};

/// A spec answering to more files than this names no one module (`utils`).
const MODULE_FILES: usize = 8;

fn folder_of(path: &str) -> &str {
    path.rfind('/')
        .map_or("", |slash| path.get(..slash).unwrap_or(""))
}

fn push_unique(map: &mut HashMap<String, Vec<String>>, key: String, value: &str) {
    let list = map.entry(key).or_default();
    if !list.iter().any(|held| held == value) {
        list.push(value.to_string());
    }
}

pub struct DeclarationSurvey {
    /// name, and `*.name` for a `Receiver.name` method, to the declarations of it.
    index: HashMap<String, Vec<DeclarationRow>>,
    by_path: HashMap<String, HashMap<String, Vec<DeclarationRow>>>,
    stems: HashMap<String, Vec<String>>,
    suffixes: HashMap<String, Vec<String>>,
    folders: HashMap<String, Vec<String>>,
    resolved: RefCell<HashMap<String, Vec<String>>>,
}

impl DeclarationSurvey {
    pub fn of(products: &ProductIndex) -> Self {
        let mut index: HashMap<String, Vec<DeclarationRow>> = HashMap::new();
        for file in &products.files {
            for row in &file.declarations {
                // A Go method `Node.Subscribe` is also found by the bare name its callers write.
                let mut keys = vec![row.name.clone()];
                if row.name.contains('.') {
                    keys.push(format!("*.{}", row.name.rsplit('.').next().unwrap_or("")));
                }
                for key in keys {
                    index.entry(key).or_default().push(row.clone());
                }
            }
        }
        let mut by_path: HashMap<String, HashMap<String, Vec<DeclarationRow>>> = HashMap::new();
        for (key, rows) in &index {
            for row in rows {
                by_path
                    .entry(row.path.clone())
                    .or_default()
                    .entry(key.clone())
                    .or_default()
                    .push(row.clone());
            }
        }
        let mut paths: Vec<&str> = products
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect();
        let known: HashSet<&str> = paths.iter().copied().collect();
        paths.extend(
            by_path
                .keys()
                .map(String::as_str)
                .filter(|path| !known.contains(path)),
        );
        let mut stems = HashMap::new();
        let mut suffixes = HashMap::new();
        let mut folders = HashMap::new();
        for path in paths {
            push_unique(&mut folders, folder_of(path).to_string(), path);
            for stem in stems_of(path) {
                push_unique(&mut stems, stem.clone(), path);
                for suffix in segment_suffixes(&stem) {
                    push_unique(&mut suffixes, suffix, path);
                }
            }
        }
        Self {
            index,
            by_path,
            stems,
            suffixes,
            folders,
            resolved: RefCell::new(HashMap::new()),
        }
    }

    /// The files a spec names: none when it names no file or too many to be one module.
    pub fn module_paths(&self, spec: &Spec) -> Vec<String> {
        let key = spec.key();
        if let Some(held) = self.resolved.borrow().get(&key) {
            return held.clone();
        }
        let mut list: Vec<String> = Vec::new();
        if let Some(go) = spec.go_path() {
            for suffix in segment_suffixes(go) {
                if let Some(found) = self.folders.get(&suffix).filter(|_| !suffix.is_empty()) {
                    list = found.clone();
                    break;
                }
            }
        } else if let Some(exact) = spec.exact_path() {
            list = self.stems.get(exact).cloned().unwrap_or_default();
        } else if let Some(tail) = spec.tail_path() {
            list = self.suffixes.get(tail).cloned().unwrap_or_default();
        }
        if list.len() > MODULE_FILES {
            list.clear();
        }
        self.resolved.borrow_mut().insert(key, list.clone());
        list
    }

    /// Declarations of `key` in `list`, by whichever side is smaller: the name's rows or the files.
    pub fn rows_among(&self, list: &[String], key: &str) -> Vec<DeclarationRow> {
        if list.is_empty() {
            return Vec::new();
        }
        let all = self.index.get(key).map_or(&[][..], Vec::as_slice);
        if all.len() <= list.len() {
            let set: HashSet<&str> = list.iter().map(String::as_str).collect();
            return all
                .iter()
                .filter(|row| set.contains(row.path.as_str()))
                .cloned()
                .collect();
        }
        list.iter()
            .flat_map(|path| {
                self.by_path
                    .get(path)
                    .and_then(|names| names.get(key))
                    .cloned()
                    .unwrap_or_default()
            })
            .collect()
    }

    /// Every file in one folder (a Go package).
    pub fn folder(&self, path: &str) -> Vec<String> {
        self.folders
            .get(folder_of(path))
            .cloned()
            .unwrap_or_default()
    }

    /// Declarations of `name` (or a `Type.name` method) in the module `spec` names.
    pub fn rows_in(&self, spec: &Spec, name: &str) -> Vec<DeclarationRow> {
        let list = self.module_paths(spec);
        let mut rows = self.rows_among(&list, name);
        rows.extend(self.rows_among(&list, &format!("*.{name}")));
        rows
    }

    /// Every file the modules `imports` names resolve to, in `path`'s language.
    pub fn imported_paths(&self, path: &str, imports: &Imports) -> Vec<String> {
        let language = language_of(path);
        let mut seen = HashSet::new();
        imports
            .specs
            .iter()
            .flat_map(|spec| self.module_paths(spec))
            .filter(|found| seen.insert(found.clone()))
            .filter(|found| language_of(found) == language)
            .collect()
    }

    /// Files the specs name, merged and in `path`'s language, never `path` itself.
    pub fn paths_for(&self, path: &str, specs: &[Spec]) -> Vec<String> {
        let language = language_of(path);
        let mut seen = HashSet::new();
        specs
            .iter()
            .flat_map(|spec| self.module_paths(spec))
            .filter(|found| seen.insert(found.clone()))
            .filter(|found| language_of(found) == language && found != path)
            .collect()
    }

    /// Every declaration of `name` anywhere: only for a binding whose module names no file.
    pub fn everywhere(&self, name: &str) -> Vec<DeclarationRow> {
        let mut rows = self.index.get(name).cloned().unwrap_or_default();
        rows.extend(
            self.index
                .get(&format!("*.{name}"))
                .cloned()
                .unwrap_or_default(),
        );
        rows
    }
}
