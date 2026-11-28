//! Every path the survey reads or names comes from the repository: manifest fields, README names,
//! documentation folders. Each one is resolved here, so a link, a `..` segment, an absolute or
//! drive path, a hidden name such as `.env` and a credential-named file never reach a read or a
//! row of the map. The disk itself is reached only through `confined-files`.

use std::path::{Path, PathBuf};

use confined_files::{names_hidden_or_credential_file, EntryKind, SourceFiles};

/// A file or folder, never a path outside the root.
pub struct SurveyFiles<'files> {
    source: &'files (dyn SourceFiles + Sync),
}

/// Extensions of key and certificate files, which no survey row names.
const KEY_EXTENSIONS: [&str; 6] = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"];

impl<'files> SurveyFiles<'files> {
    pub fn new(source: &'files (dyn SourceFiles + Sync)) -> Self {
        Self { source }
    }

    pub fn source(&self) -> &'files (dyn SourceFiles + Sync) {
        self.source
    }

    pub fn root(&self) -> &Path {
        self.source.root()
    }

    /// The repository-relative `/` form of `path`, or `None` when it could point outside the root
    /// or at a private file. Backslashes count as separators, so a manifest written on Windows
    /// gets the same checks.
    pub fn relative_path(path: &str) -> Option<String> {
        if path.is_empty() || path.contains('\0') {
            return None;
        }
        let slashed = path.replace('\\', "/");
        let mut characters = slashed.chars();
        let drive = matches!(
            (characters.next(), characters.next()),
            (Some(letter), Some(':')) if letter.is_ascii_alphabetic()
        );
        if slashed.starts_with('/') || drive {
            return None;
        }
        let parts: Vec<&str> = slashed.split('/').collect();
        if parts.contains(&"..") {
            return None;
        }
        let kept: Vec<&str> = parts
            .into_iter()
            .filter(|part| !part.is_empty() && *part != ".")
            .collect();
        if kept.is_empty() {
            return None;
        }
        let normal = kept.join("/");
        if names_hidden_or_credential_file(&normal)
            || kept.iter().any(|part| {
                let lowered = part.to_ascii_lowercase();
                KEY_EXTENSIONS
                    .iter()
                    .any(|extension| lowered.ends_with(extension))
            })
        {
            return None;
        }
        Some(normal)
    }

    fn absolute(&self, normal: &str) -> PathBuf {
        normal
            .split('/')
            .filter(|part| !part.is_empty())
            .fold(self.root().to_path_buf(), |path, part| path.join(part))
    }

    /// `path` as a repository-relative name when it names a `wanted` entry inside the root with
    /// no link on the way, else `None`.
    pub fn entry(&self, path: &str, wanted: EntryKind) -> Option<String> {
        let normal = Self::relative_path(path)?;
        let mut cursor = self.root().to_path_buf();
        for part in normal.split('/') {
            cursor = cursor.join(part);
            match self.source.link_kind(&cursor) {
                Ok(Some(EntryKind::Symlink)) | Ok(None) | Err(_) => return None,
                Ok(Some(_)) => {}
            }
        }
        match self.source.kind(&cursor) {
            Ok(Some(kind)) if kind == wanted => Some(normal),
            _ => None,
        }
    }

    pub fn file(&self, path: &str) -> Option<String> {
        self.entry(path, EntryKind::File)
    }

    pub fn folder(&self, path: &str) -> Option<String> {
        self.entry(path, EntryKind::Directory)
    }

    /// The text of a confined file, cut to `limit` UTF-16 units; empty when the path is refused
    /// or the file cannot be read (a file over the source reader's byte cap is among them).
    pub fn text(&self, path: &str, limit: usize) -> String {
        let Some(normal) = self.file(path) else {
            return String::new();
        };
        match self.source.read_text(&self.absolute(&normal)) {
            Ok(text) => answer_format::utf16::prefix(&text, limit).to_string(),
            Err(_) => String::new(),
        }
    }

    /// `found`, a path this survey reached with [`Self::file`] or [`Self::folder`], spelled as the
    /// disk spells each part. A disk that ignores letter case (macOS, Windows) opens `README.md`
    /// for a file named `readme.md`, and a row names the file by its own name. A part the disk
    /// lists once as written, or that no single listed name matches by letter case, stays as
    /// written.
    pub fn spelled_on_disk(&self, found: &str) -> String {
        let mut spelled: Vec<String> = Vec::new();
        for part in found.split('/') {
            let listed = self.names_below(&spelled.join("/"));
            let same_letters: Vec<&String> = listed
                .iter()
                .filter(|name| name.eq_ignore_ascii_case(part))
                .collect();
            let on_disk = match same_letters.as_slice() {
                [only] => (*only).clone(),
                _ => part.to_string(),
            };
            spelled.push(on_disk);
        }
        spelled.join("/")
    }

    /// The names in a confined folder, in UTF-16 order; hidden and credential names are not
    /// listed.
    pub fn names_in(&self, folder: &str) -> Vec<String> {
        let Some(normal) = self.folder(folder) else {
            return Vec::new();
        };
        self.names_below(&normal)
    }

    /// The names in `folder`, a repository-relative path that is already confined, or the root
    /// itself when it is empty.
    fn names_below(&self, folder: &str) -> Vec<String> {
        let normal = folder;
        let mut names: Vec<String> = self
            .source
            .list_directory(&self.absolute(normal))
            .map(|listing| {
                listing
                    .entries
                    .into_iter()
                    .map(|entry| entry.name)
                    .collect()
            })
            .unwrap_or_default();
        answer_format::utf16::sort(&mut names);
        names
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_that_could_leave_the_root_or_reach_a_private_file_has_no_name() {
        for refused in [
            "",
            "../x.ts",
            "a/../../x.ts",
            "/etc/hosts",
            "C:\\Windows\\win.ini",
            "c:/x",
            "\\\\server\\share\\x",
            ".env",
            "src/.git/config",
            "src/secrets.ts",
            "keys/server.pem",
            "a\0b",
            ".",
            "./",
        ] {
            assert_eq!(SurveyFiles::relative_path(refused), None, "{refused:?}");
        }
    }

    #[test]
    fn a_manifest_path_is_normalised_to_a_slash_path_below_the_root() {
        assert_eq!(
            SurveyFiles::relative_path("./dist//cli.js").as_deref(),
            Some("dist/cli.js")
        );
        assert_eq!(
            SurveyFiles::relative_path("src\\bin\\main.rs").as_deref(),
            Some("src/bin/main.rs")
        );
    }
}
