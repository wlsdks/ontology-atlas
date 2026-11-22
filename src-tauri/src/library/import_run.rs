//! One import's state and the placing of each offered file: the destination folders, a free name,
//! and the record of what already landed.

use std::collections::HashMap;
use std::fs;
use std::io::{Seek, SeekFrom};
use std::path::{Path, PathBuf};

use super::file_hashing::copy_hashing;
use super::import_destination::{
    name_taken, planning_lists_name, safe_source_file_name, split_destination,
    split_stem_and_extension, ImportDestination,
};
use super::source_copy::copy_source_into;
use super::source_import::SourceImportResult;
use super::source_offer::{open_offered_file, SourceOffer};

pub(super) struct ImportRun<'a> {
    pub(super) root_path: &'a str,
    pub(super) folder: &'static str,
    pub(super) destination: ImportDestination,
    pub(super) target: PathBuf,
    /// `(sha256, relative path)` of every file already under the folder, hashed once per import.
    pub(super) existing: Vec<(String, String)>,
    pub(super) taken: Option<std::collections::HashSet<String>>,
    pub(super) landed: HashMap<PathBuf, String>,
    pub(super) folder_names: HashMap<PathBuf, HashMap<String, String>>,
}

impl ImportRun<'_> {
    pub(super) fn copy_one(
        &mut self,
        source_path: &str,
        offer: Option<&SourceOffer>,
    ) -> SourceImportResult {
        let Some(offer) = offer else {
            let picked_name = Path::new(source_path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| source_path.to_string());
            return failed_import_result(&picked_name, "source-not-offered");
        };
        let canonical = &offer.canonical;
        let picked_name = canonical
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| source_path.to_string());
        let failure = |reason: &str| failed_import_result(&picked_name, reason);

        if let Some(relative) = self.landed.get(canonical) {
            return duplicate_import_result(picked_name.clone(), relative.clone(), None, None);
        }

        let placed = match self.destination {
            ImportDestination::Planning => {
                safe_source_file_name(&picked_name).map(|name| (Vec::new(), name))
            }
            ImportDestination::Sources => split_destination(&offer.relative),
        };
        let Some((folders, base_name)) = placed else {
            return failure("unusable-file-name");
        };
        if self.destination == ImportDestination::Planning && !planning_lists_name(&base_name) {
            return failure("unsupported-type");
        }

        let mut source = match open_offered_file(offer) {
            Ok(source) => source,
            Err(reason) => return failure(reason),
        };
        let (hash, length) = match copy_hashing(&mut source, &mut std::io::sink()) {
            Ok(measured) => measured,
            Err(_) => return failure("source-unreadable"),
        };
        if let Some((_, relative)) = self
            .existing
            .iter()
            .find(|(existing_hash, _)| *existing_hash == hash)
        {
            return duplicate_import_result(
                picked_name,
                relative.clone(),
                Some(hash),
                Some(length),
            );
        }

        let (directory, folders) = match self.prepare_destination_folders(&folders) {
            Ok(prepared) => prepared,
            Err(reason) => return failure(&reason),
        };
        let (stem, extension) = split_stem_and_extension(&base_name);
        let mut candidate = base_name.clone();
        let mut suffix = 2;
        while name_taken(&directory, self.taken.as_ref(), &candidate) {
            candidate = format!("{stem} ({suffix}){extension}");
            suffix += 1;
            if suffix > 999 {
                break;
            }
        }
        if name_taken(&directory, self.taken.as_ref(), &candidate) {
            return failure("file-name-conflict-limit");
        }
        let folder_relative = std::iter::once(self.folder)
            .chain(folders.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join("/");
        // The check above can lose a race; publishing never replaces, so a name taken since
        // passes to the next number.
        let taken = self.taken.as_ref();
        let names = std::iter::once(candidate)
            .chain((suffix..=999).map(|n| format!("{stem} ({n}){extension}")))
            .filter(|name| !taken.is_some_and(|names| names.contains(&name.to_lowercase())));
        let copied = source
            .seek(SeekFrom::Start(0))
            .map_err(|_| "source-unreadable".to_string())
            .and_then(|_| copy_source_into(self.root_path, &folder_relative, names, &mut source));
        let (hash, length, candidate) = match copied {
            Ok(Some(written)) => written,
            Ok(None) => return failure("file-name-conflict-limit"),
            Err(error) => return failure(&error),
        };
        let renamed = candidate != base_name;
        let relative = format!("{folder_relative}/{candidate}");
        self.existing.push((hash.clone(), relative.clone()));
        if let Some(taken) = self.taken.as_mut() {
            taken.insert(candidate.to_lowercase());
        }
        self.landed.insert(canonical.clone(), relative.clone());
        SourceImportResult {
            picked_name,
            status: if renamed { "renamed" } else { "added" }.into(),
            relative_path: Some(relative),
            sha256: Some(hash),
            size: Some(length),
            reason: None,
        }
    }
}

impl ImportRun<'_> {
    /// Creates each folder below the destination, refusing a link or a file in the way, as
    /// the planning path does for its one folder; the platform writer then re-checks. A folder
    /// named like an existing one in another letter case is that folder (`Meetings` joins
    /// `meetings`), so a case-sensitive disk never grows a second one beside it.
    fn prepare_destination_folders(
        &mut self,
        folders: &[String],
    ) -> Result<(PathBuf, Vec<String>), String> {
        let mut directory = self.target.clone();
        let mut placed = Vec::with_capacity(folders.len());
        for asked in folders {
            let name = self
                .folder_names_in(&directory)
                .get(&asked.to_lowercase())
                .cloned()
                .unwrap_or_else(|| asked.clone());
            let parent = directory.clone();
            directory.push(&name);
            match fs::symlink_metadata(&directory) {
                Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                    return Err("import-destination-not-a-folder".into());
                }
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    fs::create_dir(&directory)
                        .map_err(|_| "import-destination-unwritable".to_string())?;
                }
                Err(_) => return Err("import-destination-unwritable".into()),
            }
            self.folder_names_in(&parent)
                .insert(name.to_lowercase(), name.clone());
            placed.push(name);
        }
        Ok((directory, placed))
    }

    /// Folder names under `directory`, keyed by their lower case; listed once per import.
    fn folder_names_in(&mut self, directory: &Path) -> &mut HashMap<String, String> {
        self.folder_names
            .entry(directory.to_path_buf())
            .or_insert_with(|| {
                fs::read_dir(directory)
                    .map(|entries| {
                        entries
                            .flatten()
                            .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
                            .map(|entry| {
                                let name = entry.file_name().to_string_lossy().into_owned();
                                (name.to_lowercase(), name)
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            })
    }
}

fn failed_import_result(picked_name: &str, reason: &str) -> SourceImportResult {
    SourceImportResult {
        picked_name: picked_name.to_string(),
        status: "failed".into(),
        relative_path: None,
        sha256: None,
        size: None,
        reason: Some(reason.to_string()),
    }
}

fn duplicate_import_result(
    picked_name: String,
    relative: String,
    sha256: Option<String>,
    size: Option<u64>,
) -> SourceImportResult {
    SourceImportResult {
        picked_name,
        status: "duplicate".into(),
        relative_path: Some(relative),
        sha256,
        size,
        reason: None,
    }
}

#[cfg(test)]
mod tests;
