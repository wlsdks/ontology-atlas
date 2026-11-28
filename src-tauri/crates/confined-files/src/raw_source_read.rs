//! One raw source below the vault's `sources/` folder, named by an agent and read whole.
//!
//! The name is checked once, into a [`RawSourcePath`]: only a value of that type reaches the disk,
//! so the read needs no check of its own. The read then refuses what a stranger's vault may plant
//! at the name: a link anywhere on the path (a link is a link, never the file it points at), a pipe,
//! a folder, a file that is hard to hold still, and a file over the size the caller allows.
//!
//! - macOS and Linux: every part of the path is looked at with `lstat` (a link is a link), the file
//!   is opened with `O_NOFOLLOW | O_NONBLOCK` (`plain_file`), and the open handle's facts decide
//!   its type and size.
//! - Windows: the final file is opened as itself (`FILE_FLAG_OPEN_REPARSE_POINT`) and a name
//!   surrogate reparse tag (a symbolic link or a junction) is refused by its handle facts. A folder
//!   that is a junction cannot be told from a folder by `symlink_metadata`, so the real path of the
//!   file must spell the same parts as the name did (`GetFinalPathNameByHandle`, as `real_path`
//!   reads it); otherwise it is a link. Microsoft, "Reparse Point Tags" and "Naming Files, Paths,
//!   and Namespaces" (`\\?\` paths and the 260-character limit).

use std::fs;
use std::io::Read;

use icu_normalizer::ComposingNormalizerBorrowed;

use crate::os_error::OsErrorCode;
use crate::plain_file;
use crate::private_names::{is_credential_name, is_hidden_name};
use crate::real_paths::real_path;
use crate::slug_rules::VAULT_SOURCES_DIR;
use crate::stable_read::FileStamp;
use crate::vault_root::VaultRoot;

/// The longest path an agent may name, in bytes. Every operating system refuses a longer one
/// (`PATH_MAX` is 1,024 on macOS and 4,096 on Linux; Windows stops at 260 characters unless the
/// path is verbatim), so a longer one is not looked up part by part.
pub const RAW_SOURCE_PATH_MAX_BYTES: usize = 4096;

/// Why a name is not a raw source, before the disk is asked.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RawSourcePathRefusal {
    /// The name is not below `sources/`: it is a vault document or repository code.
    #[error("`{path}` is not below sources/")]
    NotUnderSources { path: String },
    /// An empty part, `.`, `..`, a trailing slash or nothing after `sources/`: no file is named.
    #[error("`{path}` names no file under sources/")]
    NamesNoFile { path: String },
    /// Longer than [`RAW_SOURCE_PATH_MAX_BYTES`].
    #[error("the path is longer than {RAW_SOURCE_PATH_MAX_BYTES} bytes")]
    TooLong,
    /// A part is hidden (`.env`) or named like a credential (`secrets.yml`, `id_rsa`): a vault
    /// read never opens one.
    #[error("`{path}` is hidden or named like a credential")]
    HiddenOrCredential { path: String },
    /// A part no Windows file can have, refused on every system so an answer does not depend on
    /// where the vault lies: a `:` (Windows reads `plan.docx:stream` as an alternate data stream of
    /// `plan.docx`, a second file behind the first), a NUL, or a reserved device name (`CON`, `PRN`,
    /// `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`, in any letter case and with any extension,
    /// which Windows opens as the device and not as a file).
    #[error("`{path}` has a part that is not a file name on Windows (a `:`, a NUL or a device name such as CON or COM1)")]
    NotAFileName { path: String },
}

/// A file below `sources/`, spelled with `/` and checked: no part is empty, `.`, `..`, hidden or
/// named like a credential, and the name is not too long.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawSourcePath {
    spelled: String,
    parts: Vec<String>,
}

impl RawSourcePath {
    /// `path` as an agent typed it: a `\` is a `/` (a Windows agent's spelling) and a leading `./`
    /// is dropped.
    pub fn parse(path: &str) -> Result<Self, RawSourcePathRefusal> {
        let spelled = path.replace('\\', "/");
        let spelled = spelled.strip_prefix("./").unwrap_or(&spelled).to_string();
        let parts: Vec<&str> = spelled.split('/').collect();
        let below_sources = parts.first() == Some(&VAULT_SOURCES_DIR) && parts.len() > 1;
        let names_parent = parts.contains(&"..");
        if !spelled.starts_with("sources/") && !spelled.is_empty() && !names_parent {
            return Err(RawSourcePathRefusal::NotUnderSources { path: spelled });
        }
        if !below_sources
            || parts
                .iter()
                .any(|part| part.is_empty() || *part == "." || *part == "..")
        {
            return Err(RawSourcePathRefusal::NamesNoFile { path: spelled });
        }
        if spelled.len() > RAW_SOURCE_PATH_MAX_BYTES {
            return Err(RawSourcePathRefusal::TooLong);
        }
        if parts
            .iter()
            .any(|part| is_hidden_name(part) || is_credential_name(part))
        {
            return Err(RawSourcePathRefusal::HiddenOrCredential { path: spelled });
        }
        if parts.iter().any(|part| is_not_a_file_name(part)) {
            return Err(RawSourcePathRefusal::NotAFileName { path: spelled });
        }
        Ok(Self {
            parts: parts.iter().map(ToString::to_string).collect(),
            spelled,
        })
    }

    /// The vault-relative path as the answer spells it.
    pub fn as_str(&self) -> &str {
        &self.spelled
    }

    /// The extension of the file, lower-cased, or empty.
    pub fn extension(&self) -> String {
        let name = self.parts.last().map_or("", String::as_str);
        name.rsplit_once('.')
            .map_or(String::new(), |(_, extension)| extension.to_lowercase())
    }
}

/// Whether a part could not be a file name on Windows. Microsoft, "Naming Files, Paths, and
/// Namespaces" (learn.microsoft.com/windows/win32/fileio/naming-a-file): "Do not use the following
/// reserved names for the name of a file: CON, PRN, AUX, NUL, COM0 to COM9, COM¹, COM², COM³,
/// LPT0 to LPT9, LPT¹, LPT², LPT³ ... Also avoid these names followed immediately by an extension;
/// for example, NUL.txt and NUL.tar.gz are both equivalent to NUL", and a colon is reserved (it
/// names a stream, "Using Streams" in the same documentation).
fn is_not_a_file_name(part: &str) -> bool {
    if part.contains(':') || part.contains('\0') {
        return true;
    }
    let stem = part.split('.').next().unwrap_or("").trim_end_matches(' ');
    let upper = stem.to_ascii_uppercase();
    if matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL") {
        return true;
    }
    let mut characters = upper.chars();
    let device: String = characters.by_ref().take(3).collect();
    let number = characters.next();
    characters.next().is_none()
        && matches!(device.as_str(), "COM" | "LPT")
        && number.is_some_and(|digit| matches!(digit, '0'..='9' | '\u{b9}' | '\u{b2}' | '\u{b3}'))
}

/// Why a raw source was not read.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RawSourceReadRefusal {
    #[error("nothing is at that path")]
    NotFound,
    /// A part of the path is a link, or the path resolves somewhere other than where it is spelled.
    #[error("the path is or runs through a link")]
    ThroughLink,
    #[error("not a regular file")]
    NotRegular,
    /// More bytes than the caller allows, by the file's size.
    #[error("larger than {max_bytes} bytes")]
    TooLarge { max_bytes: u64 },
    #[error("the file changed while it was read")]
    Changed,
    /// The operating system refused to open or read it (a permission, a lock).
    #[error("the file could not be opened for reading")]
    Unreadable,
}

impl VaultRoot {
    /// The bytes of the raw source `path` names, when it is a regular file of at most `max_bytes`
    /// that no link leads to, read as one version.
    pub fn read_raw_source(
        &self,
        path: &RawSourcePath,
        max_bytes: u64,
    ) -> Result<Vec<u8>, RawSourceReadRefusal> {
        let mut file_path = self.path().to_path_buf();
        for part in &path.parts {
            file_path.push(part);
            match fs::symlink_metadata(&file_path) {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    return Err(RawSourceReadRefusal::ThroughLink)
                }
                Ok(_) => {}
                Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => {
                    return Err(RawSourceReadRefusal::NotFound)
                }
                Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotADirectory => {
                    return Err(RawSourceReadRefusal::NotFound)
                }
                Err(error) if OsErrorCode::of(&error) == OsErrorCode::NameTooLong => {
                    return Err(RawSourceReadRefusal::NotFound)
                }
                Err(_) => return Err(RawSourceReadRefusal::Unreadable),
            }
        }
        let spells_the_real_path = || self.real_parts_equal(&file_path, &path.parts);
        let mut file = match plain_file::open_read(&file_path) {
            Ok(file) => file,
            Err(error) if plain_file::is_link_refusal(&error) => {
                return Err(RawSourceReadRefusal::ThroughLink)
            }
            Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => {
                return Err(RawSourceReadRefusal::NotFound)
            }
            Err(_) => return Err(RawSourceReadRefusal::Unreadable),
        };
        let before = plain_file::facts_of(&file).map_err(|_| RawSourceReadRefusal::Unreadable)?;
        if !before.regular {
            return Err(RawSourceReadRefusal::NotRegular);
        }
        if before.size > max_bytes {
            return Err(RawSourceReadRefusal::TooLarge { max_bytes });
        }
        if !spells_the_real_path() {
            return Err(RawSourceReadRefusal::ThroughLink);
        }
        let mut bytes = Vec::with_capacity(usize::try_from(before.size).unwrap_or(0));
        file.by_ref()
            .take(max_bytes.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|_| RawSourceReadRefusal::Unreadable)?;
        let after = plain_file::facts_of(&file).map_err(|_| RawSourceReadRefusal::Unreadable)?;
        if bytes.len() as u64 != before.size || FileStamp::of(before) != FileStamp::of(after) {
            return Err(RawSourceReadRefusal::Changed);
        }
        if !spells_the_real_path() {
            return Err(RawSourceReadRefusal::Changed);
        }
        Ok(bytes)
    }

    /// Whether the real path of `file` is the vault's real path followed by `parts`, each part
    /// spelled as named or as the disk spells it with another letter case.
    fn real_parts_equal(&self, file: &std::path::Path, parts: &[String]) -> bool {
        let (Ok(real_root), Ok(real_file)) = (real_path(self.path()), real_path(file)) else {
            return false;
        };
        let Ok(below) = real_file.strip_prefix(&real_root) else {
            return false;
        };
        let real_parts: Vec<String> = below
            .components()
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .collect();
        real_parts.len() == parts.len()
            && real_parts
                .iter()
                .zip(parts)
                .all(|(real, named)| same_part(real, named))
    }
}

/// Whether the disk's spelling of a part is the name's: the same text, or the same text in another
/// letter case, or in another Unicode normalization form (macOS keeps a name as it was created,
/// decomposed when a Korean or accented name came from a decomposing program, and finds it by
/// either form).
fn same_part(real: &str, named: &str) -> bool {
    if real == named {
        return true;
    }
    let nfc = ComposingNormalizerBorrowed::new_nfc();
    nfc.normalize(real).to_lowercase() == nfc.normalize(named).to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_part_spelled_in_another_normalization_form_or_case_is_the_same_part() {
        // U+CDE8 (a Hangul syllable) against its decomposition, and e-acute against e + U+0301.
        assert!(same_part("\u{110e}\u{1171}.md", "\u{cde8}.md"));
        assert!(same_part("caf\u{e9}.md", "cafe\u{301}.md"));
        assert!(same_part("PLAN.md", "plan.md"));
        assert!(!same_part("plan.md", "plans.md"));
        assert!(!same_part("cafe.md", "caf\u{e9}.md"));
    }

    #[test]
    fn a_name_is_checked_before_the_disk_is_asked() {
        for (typed, refusal) in [
            ("src/a.ts", "not below"),
            ("sources", "not below"),
            ("sources/", "names no file"),
            ("sources//a.md", "names no file"),
            ("sources/./a.md", "names no file"),
            ("sources/../a.md", "names no file"),
            ("../sources/a.md", "names no file"),
            ("sources/.env", "hidden"),
            ("sources/notes/Secrets.yml", "hidden"),
            ("sources/key.pem", "hidden"),
        ] {
            let error = RawSourcePath::parse(typed).expect_err(typed);
            assert!(error.to_string().contains(refusal), "{typed}: {error}");
        }
        let long = format!("sources/{}a.md", "a/".repeat(RAW_SOURCE_PATH_MAX_BYTES));
        assert_eq!(
            RawSourcePath::parse(&long).expect_err("too long"),
            RawSourcePathRefusal::TooLong
        );
    }

    #[test]
    fn a_part_no_windows_file_can_have_is_refused_on_every_system() {
        let refused = [
            "sources/plan.docx:stream",
            "sources/a:b.md",
            "sources/C:/plan.md",
            "sources/a\0b.md",
            "sources/CON",
            "sources/con.md",
            "sources/Nul.tar.gz",
            "sources/PRN.txt",
            "sources/aux",
            "sources/COM1",
            "sources/com9.md",
            "sources/lpt1.docx",
            "sources/LPT0",
            "sources/COM\u{b9}.md",
            "sources/dir/AUX.md",
            "sources/AUX /plan.md",
            "sources/CON .txt",
        ];
        for typed in refused {
            assert_eq!(
                RawSourcePath::parse(typed),
                Err(RawSourcePathRefusal::NotAFileName {
                    path: typed.to_string()
                }),
                "{typed:?}"
            );
        }
        for allowed in [
            "sources/console.md",
            "sources/com10.md",
            "sources/COM.md",
            "sources/lpt.md",
            "sources/aux-notes.md",
            "sources/communication.docx",
            "sources/nullable.md",
            "sources/a.con.md",
            "sources/prn1.md",
        ] {
            assert!(RawSourcePath::parse(allowed).is_ok(), "{allowed:?}");
        }
    }

    #[test]
    fn a_windows_spelling_names_the_same_file() {
        let path = RawSourcePath::parse(r".\sources\Plan.DOCX").expect("named");
        assert_eq!(path.as_str(), "sources/Plan.DOCX");
        assert_eq!(path.extension(), "docx");
    }
}
