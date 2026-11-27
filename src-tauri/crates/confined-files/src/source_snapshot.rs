//! A source tree answered from an immutable census the app supplied, not from the disk. The
//! program reads only what the census holds, so a file replaced after the census was taken, or a
//! link planted since, changes nothing; every question it asked is recorded, so the answer can
//! say which bytes it stood on.

use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::confined_root::resolve_path;
use crate::source_access::{
    absolute, address, DirectoryEntry, EntryKind, SourceFiles, SourceReadError,
};

pub const SNAPSHOT_CONTRACT: &str = "confinedSourceSnapshot:v1";
/// The most entries a census may list.
pub const MAX_ENTRIES: usize = 12_000;
/// The most text bytes a census may carry in all.
pub const MAX_TEXT_BYTES: usize = 32 * 1024 * 1024;
/// The most text bytes one file's entry may carry.
pub const MAX_FILE_TEXT_BYTES: usize = 512 * 1024;
/// The most bytes the descriptor the app passes may hold.
pub const MAX_TRANSPORT_BYTES: u64 = 64 * 1024 * 1024;
/// The descriptor number the app hands the census on. Only 198 is accepted.
pub const SNAPSHOT_DESCRIPTOR: i32 = 198;

/// Why a census could not be used. The text is what the server prints.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotError {
    /// The census is not the expected contract, is truncated, or is not the expected shape.
    Incomplete,
    /// The descriptor is missing, or is not the agreed number.
    DescriptorUnavailable,
    /// The descriptor holds more than [`MAX_TRANSPORT_BYTES`].
    TooLargeToTransport,
    /// The census was taken of another folder than the one asked about.
    RootMismatch,
    /// An entry or a read broke a rule; the first reason of a run is the run's.
    Refused(String),
}

impl std::fmt::Display for SnapshotError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Incomplete => formatter.write_str("Confined source snapshot is incomplete"),
            Self::DescriptorUnavailable => {
                formatter.write_str("Confined source snapshot descriptor is unavailable")
            }
            Self::TooLargeToTransport => {
                formatter.write_str("Confined source snapshot exceeds its transport limit")
            }
            Self::RootMismatch => formatter.write_str("Confined source snapshot root mismatch"),
            Self::Refused(reason) => write!(formatter, "Confined source read refused: {reason}"),
        }
    }
}

impl std::error::Error for SnapshotError {}

#[derive(Debug, Clone)]
struct SnapshotEntry {
    path: String,
    kind: EntryKind,
    text: Option<String>,
    children: Option<Vec<String>>,
}

/// The census, checked: every entry addressable, none repeated, the text within its limits.
#[derive(Debug, Clone)]
pub struct SourceSnapshot {
    root: std::path::PathBuf,
    excluded: Vec<String>,
    entries: HashMap<String, SnapshotEntry>,
}

fn kind_of(name: &str) -> Option<EntryKind> {
    match name {
        "file" => Some(EntryKind::File),
        "directory" => Some(EntryKind::Directory),
        "symlink" => Some(EntryKind::Symlink),
        "other" => Some(EntryKind::Other),
        _ => None,
    }
}

impl SourceSnapshot {
    /// Reads and checks a census from JSON text.
    pub fn from_json(text: &str) -> Result<Self, SnapshotError> {
        let value: Value = serde_json::from_str(text).map_err(|_| SnapshotError::Incomplete)?;
        Self::from_value(&value)
    }

    /// Reads the census from what the app passed on a descriptor: at most
    /// [`MAX_TRANSPORT_BYTES`], read to the end.
    pub fn from_reader(mut source: impl Read, size: u64) -> Result<Self, SnapshotError> {
        if size > MAX_TRANSPORT_BYTES {
            return Err(SnapshotError::TooLargeToTransport);
        }
        let mut text = String::new();
        source
            .by_ref()
            .take(MAX_TRANSPORT_BYTES + 1)
            .read_to_string(&mut text)
            .map_err(|_| SnapshotError::Incomplete)?;
        Self::from_json(&text)
    }

    /// Reads the census from the inherited descriptor the app passes, and closes it.
    #[cfg(unix)]
    pub fn from_inherited_descriptor() -> Result<Self, SnapshotError> {
        use std::os::fd::{FromRawFd, OwnedFd};
        // SAFETY: the app starts this program with the census open on this descriptor and nothing
        // else owns it here; `fcntl` first proves the number is open before it is taken over, and
        // taking it over closes it once, as the JavaScript server does.
        let owned = unsafe {
            if libc::fcntl(SNAPSHOT_DESCRIPTOR, libc::F_GETFD) == -1 {
                return Err(SnapshotError::DescriptorUnavailable);
            }
            OwnedFd::from_raw_fd(SNAPSHOT_DESCRIPTOR)
        };
        let file = std::fs::File::from(owned);
        let size = file
            .metadata()
            .map_err(|_| SnapshotError::DescriptorUnavailable)?
            .len();
        Self::from_reader(file, size)
    }

    /// Windows passes no census on a descriptor.
    #[cfg(not(unix))]
    pub fn from_inherited_descriptor() -> Result<Self, SnapshotError> {
        Err(SnapshotError::DescriptorUnavailable)
    }

    fn from_value(value: &Value) -> Result<Self, SnapshotError> {
        let contract_ok = value.get("contract").and_then(Value::as_str) == Some(SNAPSHOT_CONTRACT);
        let root = value.get("rootPath").and_then(Value::as_str);
        let entries = value.get("entries").and_then(Value::as_array);
        let truncated = value
            .get("truncated")
            .is_some_and(|flag| !matches!(flag, Value::Null | Value::Bool(false)));
        let (true, Some(root), Some(entries), false) = (contract_ok, root, entries, truncated)
        else {
            return Err(SnapshotError::Incomplete);
        };
        if entries.len() > MAX_ENTRIES {
            return Err(SnapshotError::Incomplete);
        }
        let root = resolve_path(
            &std::env::current_dir().unwrap_or_default(),
            Path::new(root),
        );
        let excluded: Vec<String> = value
            .get("excluded")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        let refuse = |reason: &str| SnapshotError::Refused(reason.to_string());
        let mut by_path: HashMap<String, SnapshotEntry> = HashMap::with_capacity(entries.len());
        let mut total_text = 0_usize;
        for raw in entries {
            let path = raw.get("path").and_then(Value::as_str);
            let kind = raw.get("kind").and_then(Value::as_str).and_then(kind_of);
            let (Some(path), Some(kind)) = (path, kind) else {
                return Err(refuse("invalid snapshot entry"));
            };
            let normalized = if path == "." {
                ".".to_string()
            } else {
                address(&root, &excluded, &absolute(&root, path)).map_err(|error| match error {
                    SourceReadError::Refused(reason) => SnapshotError::Refused(reason),
                    SourceReadError::Absent => refuse("ambiguous snapshot entry"),
                })?
            };
            if normalized != path || by_path.contains_key(&normalized) {
                return Err(refuse("ambiguous snapshot entry"));
            }
            let text = raw.get("text").and_then(Value::as_str).map(str::to_string);
            if let Some(text) = &text {
                total_text += text.len();
                if text.len() > MAX_FILE_TEXT_BYTES || total_text > MAX_TEXT_BYTES {
                    return Err(refuse("snapshot byte limit"));
                }
            }
            let children = raw.get("children").and_then(Value::as_array).map(|names| {
                names
                    .iter()
                    .filter_map(|name| name.as_str().map(str::to_string))
                    .collect::<Vec<_>>()
            });
            by_path.insert(
                normalized,
                SnapshotEntry {
                    path: path.to_string(),
                    kind,
                    text,
                    children,
                },
            );
        }
        Ok(Self {
            root,
            excluded,
            entries: by_path,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Answers reads from this census. A census taken of another folder than `root` is refused.
    pub fn source_for(&self, root: &Path) -> Result<SnapshotSource<'_>, SnapshotError> {
        let asked = resolve_path(&std::env::current_dir().unwrap_or_default(), root);
        if asked != self.root {
            return Err(SnapshotError::RootMismatch);
        }
        Ok(SnapshotSource {
            snapshot: self,
            record: Mutex::new(Record::default()),
        })
    }
}

#[derive(Default)]
struct Record {
    /// The first refusal of the run; it fails the run even when a caller swallows the error.
    failure: Option<String>,
    files: BTreeMap<String, String>,
    lookups: BTreeMap<String, &'static str>,
    directories: BTreeMap<String, Vec<String>>,
}

/// Reads from a [`SourceSnapshot`] and records every question for the read boundary.
pub struct SnapshotSource<'a> {
    snapshot: &'a SourceSnapshot,
    record: Mutex<Record>,
}

/// One file the run read, with the hash of the bytes it stood on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReadFile {
    pub path: String,
    pub sha256: String,
}

/// One path the run asked about and what the census said it was.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Lookup {
    pub path: String,
    pub state: String,
}

/// One directory the run listed, with the names the census held.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ListedDirectory {
    pub path: String,
    pub names: Vec<String>,
}

/// What a run stood on, in the shape the answer carries. Lists are sorted by path in byte order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadBoundary {
    pub contract: &'static str,
    pub origin: &'static str,
    pub disk_authority: &'static str,
    pub excluded: Vec<String>,
    pub files: Vec<ReadFile>,
    pub lookups: Vec<Lookup>,
    pub directories: Vec<ListedDirectory>,
}

impl SnapshotSource<'_> {
    fn recorded(&self) -> std::sync::MutexGuard<'_, Record> {
        self.record
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn refuse(&self, reason: &str) -> SourceReadError {
        self.recorded()
            .failure
            .get_or_insert_with(|| reason.to_string());
        SourceReadError::Refused(reason.to_string())
    }

    fn address(&self, path: &Path) -> Result<String, SourceReadError> {
        address(&self.snapshot.root, &self.snapshot.excluded, path).map_err(|error| match error {
            SourceReadError::Refused(reason) => self.refuse(&reason),
            other => other,
        })
    }

    /// The entry a path names; a link is refused, a path the census lacks is absent.
    fn get(&self, path: &Path) -> Result<&SnapshotEntry, SourceReadError> {
        let name = self.address(path)?;
        let entry = self.snapshot.entries.get(&name);
        self.recorded()
            .lookups
            .insert(name, EntryKind::state_name(entry.map(|found| found.kind)));
        let entry = entry.ok_or(SourceReadError::Absent)?;
        if entry.kind.is_symlink() {
            return Err(self.refuse("symlink"));
        }
        Ok(entry)
    }

    /// Ends the run: the boundary of what it read, or the first refusal if any read was refused,
    /// even one a caller handled, so a parser that catches errors cannot turn a refused read into
    /// a quiet fallback.
    pub fn finish(self) -> Result<ReadBoundary, SnapshotError> {
        let record = self
            .record
            .into_inner()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(reason) = record.failure {
            return Err(SnapshotError::Refused(reason));
        }
        Ok(ReadBoundary {
            contract: "confinedSourceReads:v1",
            origin: "process-supplied-immutable-snapshot",
            disk_authority: "not-asserted-by-server",
            excluded: self.snapshot.excluded.clone(),
            files: record
                .files
                .into_iter()
                .map(|(path, sha256)| ReadFile { path, sha256 })
                .collect(),
            lookups: record
                .lookups
                .into_iter()
                .map(|(path, state)| Lookup {
                    path,
                    state: state.to_string(),
                })
                .collect(),
            directories: record
                .directories
                .into_iter()
                .map(|(path, names)| ListedDirectory { path, names })
                .collect(),
        })
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

impl SourceFiles for SnapshotSource<'_> {
    fn root(&self) -> &Path {
        &self.snapshot.root
    }

    fn kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError> {
        match self.get(path) {
            Ok(entry) => Ok(Some(entry.kind)),
            Err(SourceReadError::Absent) => Ok(None),
            Err(error) => Err(error),
        }
    }

    fn link_kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError> {
        let name = self.address(path)?;
        let entry = self.snapshot.entries.get(&name);
        self.recorded()
            .lookups
            .insert(name, EntryKind::state_name(entry.map(|found| found.kind)));
        Ok(entry.map(|found| found.kind))
    }

    fn read_text(&self, path: &Path) -> Result<String, SourceReadError> {
        let entry = self.get(path)?;
        let Some(text) = entry.text.as_ref().filter(|_| entry.kind.is_file()) else {
            return Err(self.refuse("file bytes unavailable in snapshot"));
        };
        self.recorded()
            .files
            .insert(entry.path.clone(), sha256_hex(text.as_bytes()));
        Ok(text.clone())
    }

    fn list_directory(&self, path: &Path) -> Result<Vec<DirectoryEntry>, SourceReadError> {
        let entry = self.get(path)?;
        let Some(children) = entry
            .children
            .as_ref()
            .filter(|_| entry.kind.is_directory())
        else {
            return Err(self.refuse("directory unavailable in snapshot"));
        };
        let mut names = children.clone();
        names.sort_unstable();
        self.recorded()
            .directories
            .insert(entry.path.clone(), names.clone());
        names
            .into_iter()
            .map(|name| {
                let child = if entry.path == "." {
                    name.clone()
                } else {
                    format!("{}/{}", entry.path, name)
                };
                match self.snapshot.entries.get(&child) {
                    Some(found) => Ok(DirectoryEntry {
                        name,
                        kind: found.kind,
                    }),
                    None => Err(self.refuse("incomplete directory")),
                }
            })
            .collect()
    }
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::*;
    use serde_json::json;

    fn census(entries: Vec<Value>) -> Value {
        json!({
            "contract": SNAPSHOT_CONTRACT,
            "rootPath": "/repo",
            "truncated": false,
            "entries": entries,
        })
    }

    fn file(path: &str, text: &str) -> Value {
        json!({ "path": path, "kind": "file", "size": text.len(), "text": text })
    }

    fn directory(path: &str, children: &[&str]) -> Value {
        json!({ "path": path, "kind": "directory", "children": children })
    }

    fn snapshot(entries: Vec<Value>) -> SourceSnapshot {
        SourceSnapshot::from_json(&census(entries).to_string()).expect("a valid census")
    }

    #[test]
    fn a_census_with_a_wrong_contract_a_truncation_or_too_many_entries_is_incomplete() {
        let mut wrong = census(vec![]);
        wrong["contract"] = json!("confinedSourceSnapshot:v2");
        let mut truncated = census(vec![]);
        truncated["truncated"] = json!(true);
        let many: Vec<Value> = (0..=MAX_ENTRIES)
            .map(|index| file(&format!("f{index}.ts"), ""))
            .collect();
        for bad in [wrong, truncated, census(many)] {
            assert_eq!(
                SourceSnapshot::from_json(&bad.to_string()).expect_err("incomplete"),
                SnapshotError::Incomplete
            );
        }
        assert_eq!(
            SourceSnapshot::from_json("not json").expect_err("incomplete"),
            SnapshotError::Incomplete
        );
        assert_eq!(
            SnapshotError::Incomplete.to_string(),
            "Confined source snapshot is incomplete"
        );
    }

    #[test]
    fn the_entry_count_cap_is_exactly_twelve_thousand() {
        let at_cap: Vec<Value> = (0..MAX_ENTRIES)
            .map(|index| file(&format!("f{index}.ts"), ""))
            .collect();
        assert!(SourceSnapshot::from_json(&census(at_cap).to_string()).is_ok());
    }

    #[test]
    fn the_text_caps_refuse_one_big_file_and_a_big_total() {
        let one_over = "a".repeat(MAX_FILE_TEXT_BYTES + 1);
        let refused =
            SourceSnapshot::from_json(&census(vec![file("big.ts", &one_over)]).to_string())
                .expect_err("byte limit");
        assert_eq!(
            refused,
            SnapshotError::Refused("snapshot byte limit".to_string())
        );
        let at_cap = "a".repeat(MAX_FILE_TEXT_BYTES);
        assert!(
            SourceSnapshot::from_json(&census(vec![file("ok.ts", &at_cap)]).to_string()).is_ok()
        );
        let many: Vec<Value> = (0..65)
            .map(|index| file(&format!("f{index}.ts"), &at_cap))
            .collect();
        assert_eq!(
            SourceSnapshot::from_json(&census(many).to_string()).expect_err("total"),
            SnapshotError::Refused("snapshot byte limit".to_string())
        );
    }

    #[test]
    fn an_entry_that_is_hidden_outside_repeated_or_spelled_oddly_refuses_the_census() {
        for (entry_paths, reason) in [
            (vec![".env"], "private or hidden path"),
            (vec!["keys/server.pem"], "private or hidden path"),
            (vec!["../outside.ts"], "outside approved root"),
            (vec!["a.ts", "a.ts"], "ambiguous snapshot entry"),
            (vec!["src//a.ts"], "ambiguous snapshot entry"),
            (vec!["src/./a.ts"], "ambiguous snapshot entry"),
        ] {
            let entries = entry_paths.iter().map(|path| file(path, "x")).collect();
            assert_eq!(
                SourceSnapshot::from_json(&census(entries).to_string()).expect_err(reason),
                SnapshotError::Refused(reason.to_string()),
                "{entry_paths:?}"
            );
        }
        let bad_kind = json!({ "path": "a.ts", "kind": "socket" });
        assert_eq!(
            SourceSnapshot::from_json(&census(vec![bad_kind]).to_string()).expect_err("kind"),
            SnapshotError::Refused("invalid snapshot entry".to_string())
        );
    }

    #[test]
    fn a_census_of_another_folder_is_a_root_mismatch() {
        let census = snapshot(vec![directory(".", &[])]);
        assert!(census.source_for(Path::new("/repo")).is_ok());
        assert_eq!(
            census.source_for(Path::new("/elsewhere")).err(),
            Some(SnapshotError::RootMismatch)
        );
    }

    #[test]
    fn a_descriptor_past_the_transport_limit_is_refused_before_it_is_read() {
        let result = SourceSnapshot::from_reader(std::io::empty(), MAX_TRANSPORT_BYTES + 1);
        assert_eq!(result.err(), Some(SnapshotError::TooLargeToTransport));
    }

    #[test]
    fn reads_come_from_the_census_and_leave_a_boundary_of_what_they_stood_on() {
        let census = snapshot(vec![
            directory(".", &["src", "tsconfig.json"]),
            directory("src", &["a.ts"]),
            file("src/a.ts", "import './b';"),
            file("tsconfig.json", "{}"),
        ]);
        let source = census.source_for(Path::new("/repo")).expect("source");
        assert_eq!(
            source.read_text(Path::new("/repo/src/a.ts")).as_deref(),
            Ok("import './b';")
        );
        assert_eq!(
            source.kind(Path::new("/repo/src/b.ts")),
            Ok(None),
            "a path the complete census lacks is simply absent"
        );
        let listed = source.list_directory(Path::new("/repo")).expect("list");
        assert_eq!(
            listed
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            ["src", "tsconfig.json"]
        );
        let boundary = source.finish().expect("boundary");
        insta::assert_json_snapshot!(boundary, @r#"
        {
          "contract": "confinedSourceReads:v1",
          "origin": "process-supplied-immutable-snapshot",
          "diskAuthority": "not-asserted-by-server",
          "excluded": [],
          "files": [
            {
              "path": "src/a.ts",
              "sha256": "555f57173433b89afc9db2698fb7cf66e0fa4f69f3333314be3af3ccc257b1e5"
            }
          ],
          "lookups": [
            {
              "path": ".",
              "state": "directory"
            },
            {
              "path": "src/a.ts",
              "state": "file"
            },
            {
              "path": "src/b.ts",
              "state": "missing"
            }
          ],
          "directories": [
            {
              "path": ".",
              "names": [
                "src",
                "tsconfig.json"
              ]
            }
          ]
        }
        "#);
    }

    #[test]
    fn a_refused_read_fails_the_run_even_when_the_caller_swallows_it() {
        let census = snapshot(vec![directory(".", &["link"]), {
            json!({ "path": "link", "kind": "symlink" })
        }]);
        let source = census.source_for(Path::new("/repo")).expect("source");
        // A parser that catches the error and falls back still cannot make the run succeed.
        let _swallowed = source.read_text(Path::new("/repo/link"));
        let _also = source.read_text(Path::new("/outside/x.ts"));
        assert_eq!(
            source.finish().err(),
            Some(SnapshotError::Refused("symlink".to_string()))
        );
    }

    #[test]
    fn a_file_without_bytes_and_a_directory_without_children_are_refused_not_empty() {
        let census = snapshot(vec![
            directory(".", &["a.ts", "d"]),
            json!({ "path": "a.ts", "kind": "file" }),
            json!({ "path": "d", "kind": "directory" }),
        ]);
        let source = census.source_for(Path::new("/repo")).expect("source");
        assert_eq!(
            source.read_text(Path::new("/repo/a.ts")),
            Err(SourceReadError::Refused(
                "file bytes unavailable in snapshot".to_string()
            ))
        );
        assert_eq!(
            source.list_directory(Path::new("/repo/d")),
            Err(SourceReadError::Refused(
                "directory unavailable in snapshot".to_string()
            ))
        );
        assert!(source.finish().is_err());
    }

    #[test]
    fn a_hidden_or_outside_read_is_refused_without_looking_at_the_disk() {
        let census = snapshot(vec![directory(".", &[])]);
        let source = census.source_for(Path::new("/repo")).expect("source");
        for (path, reason) in [
            ("/repo/.env", "private or hidden path"),
            ("/repo/../etc/passwd", "outside approved root"),
            ("/etc/passwd", "outside approved root"),
        ] {
            assert_eq!(
                source.read_text(Path::new(path)),
                Err(SourceReadError::Refused(reason.to_string())),
                "{path}"
            );
        }
    }
}
