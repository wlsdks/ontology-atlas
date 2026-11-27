//! A source tree answered from an immutable census the app supplied, not from the disk. The
//! program reads only what the census holds, so a file replaced after the census was taken, or a
//! link planted since, changes nothing; every question it asked is recorded, so the answer can
//! say which bytes it stood on.

use std::borrow::Cow;
use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::de::{self, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::confined_root::resolve_path;
use crate::source_access::{
    absolute, address, DirectoryEntry, EntryKind, Refusal, SourceFiles, SourceReadError,
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
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SnapshotError {
    /// The census is not the expected contract, is truncated, or is not the expected shape.
    #[error("source snapshot is incomplete")]
    Incomplete,
    /// The descriptor is missing, or is not the agreed number.
    #[error("source snapshot descriptor is unavailable")]
    DescriptorUnavailable,
    /// The descriptor holds more than [`MAX_TRANSPORT_BYTES`].
    #[error("source snapshot exceeds its transport limit")]
    TooLargeToTransport,
    /// The census was taken of another folder than the one asked about.
    #[error("source snapshot was taken of another folder")]
    RootMismatch,
    /// An entry or a read broke a rule; the first reason of a run is the run's.
    #[error("source read refused: {0}")]
    Refused(Refusal),
}

/// A string where JavaScript has `typeof x === 'string'`: any other JSON value is `None`, not an
/// error, so the census checks reject it by name instead of the whole parse failing.
fn lenient_string<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    struct Lenient;
    impl<'de> Visitor<'de> for Lenient {
        type Value = Option<String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("any JSON value")
        }

        fn visit_str<E: de::Error>(self, text: &str) -> Result<Self::Value, E> {
            Ok(Some(text.to_string()))
        }

        fn visit_string<E: de::Error>(self, text: String) -> Result<Self::Value, E> {
            Ok(Some(text))
        }

        fn visit_bool<E: de::Error>(self, _: bool) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_i64<E: de::Error>(self, _: i64) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_u64<E: de::Error>(self, _: u64) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_f64<E: de::Error>(self, _: f64) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            while seq.next_element::<de::IgnoredAny>()?.is_some() {}
            Ok(None)
        }

        fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
            while map
                .next_entry::<de::IgnoredAny, de::IgnoredAny>()?
                .is_some()
            {}
            Ok(None)
        }
    }
    deserializer.deserialize_any(Lenient)
}

/// A census as the app writes it. Text is read straight into the strings the census keeps.
#[derive(Deserialize)]
struct Census {
    #[serde(default, deserialize_with = "lenient_string")]
    contract: Option<String>,
    #[serde(default, rename = "rootPath", deserialize_with = "lenient_string")]
    root_path: Option<String>,
    entries: Vec<CensusEntry>,
    /// JavaScript truthiness decides: only `false`, `null`, `0` and `""` are complete.
    #[serde(default)]
    truncated: serde_json::Value,
    #[serde(default)]
    excluded: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct CensusEntry {
    #[serde(default, deserialize_with = "lenient_string")]
    path: Option<String>,
    #[serde(default, deserialize_with = "lenient_string")]
    kind: Option<String>,
    #[serde(default, deserialize_with = "lenient_string")]
    text: Option<String>,
    #[serde(default)]
    children: Option<Vec<String>>,
}

fn is_truthy(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Null => false,
        serde_json::Value::Bool(flag) => *flag,
        serde_json::Value::Number(number) => number.as_f64().is_some_and(|found| found != 0.0),
        serde_json::Value::String(text) => !text.is_empty(),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => true,
    }
}

#[derive(Debug, Clone)]
struct SnapshotEntry {
    kind: EntryKind,
    text: Option<String>,
    children: Option<Vec<String>>,
}

/// The census, checked: every entry addressable, none repeated, the text within its limits.
#[derive(Debug, Clone)]
pub struct SourceSnapshot {
    root: PathBuf,
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

/// Whether the app asked for reads to come from a census (`OATLAS_CONFINED_SOURCE_READS=1`).
pub fn confined_source_reads_enabled() -> bool {
    std::env::var("OATLAS_CONFINED_SOURCE_READS").is_ok_and(|value| value == "1")
}

impl SourceSnapshot {
    /// Reads and checks a census from JSON text.
    pub fn from_json(text: &str) -> Result<Self, SnapshotError> {
        let census: Census = serde_json::from_str(text).map_err(|_| SnapshotError::Incomplete)?;
        Self::from_census(census)
    }

    /// Reads and checks a census from what the app passed on a descriptor: `size` bytes at most
    /// [`MAX_TRANSPORT_BYTES`], parsed as they are read.
    pub fn from_reader(source: impl Read, size: u64) -> Result<Self, SnapshotError> {
        if size > MAX_TRANSPORT_BYTES {
            return Err(SnapshotError::TooLargeToTransport);
        }
        let limited = source.take(MAX_TRANSPORT_BYTES + 1);
        let census: Census = serde_json::from_reader(std::io::BufReader::new(limited))
            .map_err(|_| SnapshotError::Incomplete)?;
        Self::from_census(census)
    }

    /// The census the app passed on descriptor 198, read once for the life of the process. The
    /// app names the descriptor in `OATLAS_SOURCE_SNAPSHOT_FD`; any other value, or none, is
    /// [`SnapshotError::DescriptorUnavailable`]. Every call after the first returns the first
    /// call's answer, so the descriptor is taken over and closed at most once.
    #[cfg(unix)]
    pub fn inherited() -> Result<&'static Self, SnapshotError> {
        use std::os::fd::{FromRawFd, OwnedFd};
        static INHERITED: std::sync::OnceLock<Result<SourceSnapshot, SnapshotError>> =
            std::sync::OnceLock::new();
        INHERITED
            .get_or_init(|| {
                let named = std::env::var("OATLAS_SOURCE_SNAPSHOT_FD")
                    .is_ok_and(|value| value == SNAPSHOT_DESCRIPTOR.to_string());
                if !named {
                    return Err(SnapshotError::DescriptorUnavailable);
                }
                // SAFETY: the app starts this program with the census open on exactly this
                // descriptor and says so in the environment variable checked above; nothing else
                // in the program owns it, and the surrounding `OnceLock` runs this at most once,
                // so the descriptor is taken over and closed once, as the JavaScript server does.
                let owned = unsafe { OwnedFd::from_raw_fd(SNAPSHOT_DESCRIPTOR) };
                let file = std::fs::File::from(owned);
                let size = file
                    .metadata()
                    .map_err(|_| SnapshotError::DescriptorUnavailable)?
                    .len();
                Self::from_reader(file, size)
            })
            .as_ref()
            .map_err(Clone::clone)
    }

    /// Windows passes no census on a descriptor.
    #[cfg(not(unix))]
    pub fn inherited() -> Result<&'static Self, SnapshotError> {
        Err(SnapshotError::DescriptorUnavailable)
    }

    fn from_census(census: Census) -> Result<Self, SnapshotError> {
        let (Some(contract), Some(root)) =
            (census.contract.as_deref(), census.root_path.as_deref())
        else {
            return Err(SnapshotError::Incomplete);
        };
        let root = PathBuf::from(root);
        if contract != SNAPSHOT_CONTRACT
            || is_truthy(&census.truncated)
            || census.entries.len() > MAX_ENTRIES
            || !root.is_absolute()
        {
            return Err(SnapshotError::Incomplete);
        }
        let root = resolve_path(Path::new(""), &root);
        let excluded = census.excluded.unwrap_or_default();
        let mut by_path: HashMap<String, SnapshotEntry> =
            HashMap::with_capacity(census.entries.len());
        let mut total_text = 0_usize;
        for raw in census.entries {
            let (Some(path), Some(kind)) = (raw.path, raw.kind.as_deref().and_then(kind_of)) else {
                return Err(SnapshotError::Refused(Refusal::InvalidSnapshotEntry));
            };
            let normalized = if path == "." {
                path.clone()
            } else {
                if Path::new(&path).is_absolute() {
                    return Err(SnapshotError::Refused(Refusal::AbsoluteSnapshotEntry));
                }
                address(&root, &excluded, &absolute(&root, &path))
                    .map_err(SnapshotError::Refused)?
            };
            if normalized != path || by_path.contains_key(&path) {
                return Err(SnapshotError::Refused(Refusal::AmbiguousSnapshotEntry));
            }
            if let Some(text) = &raw.text {
                total_text += text.len();
                if text.len() > MAX_FILE_TEXT_BYTES || total_text > MAX_TEXT_BYTES {
                    return Err(SnapshotError::Refused(Refusal::SnapshotByteLimit));
                }
            }
            by_path.insert(
                path,
                SnapshotEntry {
                    kind,
                    text: raw.text,
                    children: raw.children,
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
        if !root.is_absolute() || resolve_path(Path::new(""), root) != self.root {
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
    failure: Option<Refusal>,
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

    fn refuse(&self, reason: Refusal) -> SourceReadError {
        self.recorded().failure.get_or_insert(reason);
        SourceReadError::Refused(reason)
    }

    fn address(&self, path: &Path) -> Result<String, SourceReadError> {
        address(&self.snapshot.root, &self.snapshot.excluded, path)
            .map_err(|reason| self.refuse(reason))
    }

    /// The entry a path names, `None` when the census lists nothing there. A link is refused and
    /// fails the run, whether the question was about the link or about what it points at: the
    /// census never says where a link goes.
    fn get(&self, path: &Path) -> Result<(String, Option<&SnapshotEntry>), SourceReadError> {
        let name = self.address(path)?;
        let entry = self.snapshot.entries.get(&name);
        self.recorded().lookups.insert(
            name.clone(),
            EntryKind::state_name(entry.map(|found| found.kind)),
        );
        if entry.is_some_and(|found| found.kind.is_symlink()) {
            return Err(self.refuse(Refusal::Symlink));
        }
        Ok((name, entry))
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
        Ok(self.get(path)?.1.map(|entry| entry.kind))
    }

    fn link_kind(&self, path: &Path) -> Result<Option<EntryKind>, SourceReadError> {
        self.kind(path)
    }

    /// A census lists no hidden entry, so a hidden path is refused here as it is for `kind`.
    fn regular_file_exists(&self, path: &Path) -> Result<bool, SourceReadError> {
        Ok(self.kind(path)?.is_some_and(EntryKind::is_file))
    }

    fn read_text(&self, path: &Path) -> Result<Cow<'_, str>, SourceReadError> {
        let (name, entry) = self.get(path)?;
        let entry = entry.ok_or(SourceReadError::Absent)?;
        let Some(text) = entry.text.as_deref().filter(|_| entry.kind.is_file()) else {
            return Err(self.refuse(Refusal::FileBytesUnavailable));
        };
        self.recorded()
            .files
            .insert(name, sha256_hex(text.as_bytes()));
        Ok(Cow::Borrowed(text))
    }

    fn list_directory(&self, path: &Path) -> Result<Vec<DirectoryEntry>, SourceReadError> {
        let (name, entry) = self.get(path)?;
        let entry = entry.ok_or(SourceReadError::Absent)?;
        let Some(children) = entry
            .children
            .as_ref()
            .filter(|_| entry.kind.is_directory())
        else {
            return Err(self.refuse(Refusal::DirectoryUnavailable));
        };
        let mut names = children.clone();
        names.sort_unstable();
        self.recorded()
            .directories
            .insert(name.clone(), names.clone());
        names
            .into_iter()
            .map(|child_name| {
                let child = if name == "." {
                    child_name.clone()
                } else {
                    format!("{name}/{child_name}")
                };
                match self.snapshot.entries.get(&child) {
                    Some(found) => Ok(DirectoryEntry {
                        name: child_name,
                        kind: found.kind,
                    }),
                    None => Err(self.refuse(Refusal::IncompleteDirectory)),
                }
            })
            .collect()
    }
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

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
        let mut relative_root = census(vec![]);
        relative_root["rootPath"] = json!("repo");
        let many: Vec<Value> = (0..=MAX_ENTRIES)
            .map(|index| file(&format!("f{index}.ts"), ""))
            .collect();
        for bad in [wrong, truncated, relative_root, census(many)] {
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
            "source snapshot is incomplete"
        );
    }

    #[test]
    fn a_falsy_truncated_flag_is_complete_and_a_truthy_one_is_not() {
        for (flag, complete) in [
            (json!(false), true),
            (json!(null), true),
            (json!(0), true),
            (json!(""), true),
            (json!(1), false),
            (json!("yes"), false),
            (json!([]), false),
        ] {
            let mut value = census(vec![]);
            value["truncated"] = flag.clone();
            assert_eq!(
                SourceSnapshot::from_json(&value.to_string()).is_ok(),
                complete,
                "{flag}"
            );
        }
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
        assert_eq!(refused, SnapshotError::Refused(Refusal::SnapshotByteLimit));
        let at_cap = "a".repeat(MAX_FILE_TEXT_BYTES);
        assert!(
            SourceSnapshot::from_json(&census(vec![file("ok.ts", &at_cap)]).to_string()).is_ok()
        );
        let many: Vec<Value> = (0..65)
            .map(|index| file(&format!("f{index}.ts"), &at_cap))
            .collect();
        assert_eq!(
            SourceSnapshot::from_json(&census(many).to_string()).expect_err("total"),
            SnapshotError::Refused(Refusal::SnapshotByteLimit)
        );
    }

    #[test]
    fn an_entry_that_is_hidden_outside_absolute_repeated_or_spelled_oddly_refuses_the_census() {
        for (entry_paths, reason) in [
            (vec![".env"], Refusal::PrivateOrHiddenPath),
            (vec!["keys/server.pem"], Refusal::PrivateOrHiddenPath),
            (vec!["../outside.ts"], Refusal::OutsideApprovedRoot),
            (vec!["/repo/a.ts"], Refusal::AbsoluteSnapshotEntry),
            (vec!["/etc/passwd"], Refusal::AbsoluteSnapshotEntry),
            (vec!["a.ts", "a.ts"], Refusal::AmbiguousSnapshotEntry),
            (vec!["src//a.ts"], Refusal::AmbiguousSnapshotEntry),
            (vec!["src/./a.ts"], Refusal::AmbiguousSnapshotEntry),
        ] {
            let entries = entry_paths.iter().map(|path| file(path, "x")).collect();
            assert_eq!(
                SourceSnapshot::from_json(&census(entries).to_string()).expect_err("refused"),
                SnapshotError::Refused(reason),
                "{entry_paths:?}"
            );
        }
        for bad in [
            json!({ "path": "a.ts", "kind": "socket" }),
            json!({ "path": 7, "kind": "file" }),
            json!({ "kind": "file" }),
        ] {
            assert_eq!(
                SourceSnapshot::from_json(&census(vec![bad]).to_string()).expect_err("kind"),
                SnapshotError::Refused(Refusal::InvalidSnapshotEntry)
            );
        }
    }

    #[test]
    fn a_census_of_another_folder_is_a_root_mismatch() {
        let census = snapshot(vec![directory(".", &[])]);
        assert!(census.source_for(Path::new("/repo")).is_ok());
        for other in ["/elsewhere", "repo", ""] {
            assert_eq!(
                census.source_for(Path::new(other)).err(),
                Some(SnapshotError::RootMismatch),
                "{other:?}"
            );
        }
    }

    #[test]
    fn a_descriptor_past_the_transport_limit_is_refused_before_it_is_read() {
        let result = SourceSnapshot::from_reader(std::io::empty(), MAX_TRANSPORT_BYTES + 1);
        assert_eq!(result.err(), Some(SnapshotError::TooLargeToTransport));
    }

    #[test]
    fn the_inherited_descriptor_is_refused_unless_the_app_named_it() {
        // The test process was not started by the app, so the variable is not set to 198.
        assert_eq!(
            SourceSnapshot::inherited().err(),
            Some(SnapshotError::DescriptorUnavailable)
        );
        assert_eq!(
            SourceSnapshot::inherited().err(),
            Some(SnapshotError::DescriptorUnavailable),
            "a second call answers the first call's answer"
        );
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
            Some(SnapshotError::Refused(Refusal::Symlink))
        );
    }

    #[test]
    fn asking_about_a_link_itself_fails_the_run_as_reading_it_does() {
        let census = snapshot(vec![directory(".", &["link"]), {
            json!({ "path": "link", "kind": "symlink" })
        }]);
        let source = census.source_for(Path::new("/repo")).expect("source");
        assert_eq!(
            source.link_kind(Path::new("/repo/link")),
            Err(SourceReadError::Refused(Refusal::Symlink))
        );
        assert_eq!(
            source.finish().err(),
            Some(SnapshotError::Refused(Refusal::Symlink)),
            "a link is a confinement risk however it is asked about"
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
            Err(SourceReadError::Refused(Refusal::FileBytesUnavailable))
        );
        assert_eq!(
            source.list_directory(Path::new("/repo/d")),
            Err(SourceReadError::Refused(Refusal::DirectoryUnavailable))
        );
        assert!(source.finish().is_err());
    }

    #[test]
    fn a_hidden_relative_or_outside_read_is_refused_without_looking_at_the_disk() {
        let census = snapshot(vec![directory(".", &[])]);
        let source = census.source_for(Path::new("/repo")).expect("source");
        for (path, reason) in [
            ("/repo/.env", Refusal::PrivateOrHiddenPath),
            ("/repo/../etc/passwd", Refusal::OutsideApprovedRoot),
            ("/etc/passwd", Refusal::OutsideApprovedRoot),
        ] {
            assert_eq!(
                source.read_text(Path::new(path)),
                Err(SourceReadError::Refused(reason)),
                "{path}"
            );
        }
    }
}
