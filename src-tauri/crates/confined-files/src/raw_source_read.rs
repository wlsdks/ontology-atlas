//! One raw source below the vault's `sources/` folder, named by an agent and read whole.
//!
//! The name is checked once, into a [`RawSourcePath`]: only a value of that type reaches the disk,
//! so the read needs no check of its own. The read then refuses what a stranger's vault may plant
//! at the name: a link anywhere on the path (a link is a link, never the file it points at), a pipe,
//! a folder, a file that is hard to hold still, and a file over the size the caller allows.
//!
//!
//! The read itself is [`crate::confined_file_read`], shared with a repository's files.

use crate::confined_file_read::{read_confined_file, ConfinedRefusal};
use crate::plain_parts::{PlainParts, PlainPartsRefusal};
use crate::private_names::{is_credential_name, is_hidden_name};
use crate::slug_rules::VAULT_SOURCES_DIR;
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
    plain: PlainParts,
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
        let plain = PlainParts::new(&parts).map_err(|refusal| match refusal {
            PlainPartsRefusal::NotAFileName { .. } => RawSourcePathRefusal::NotAFileName {
                path: spelled.clone(),
            },
            _ => RawSourcePathRefusal::NamesNoFile {
                path: spelled.clone(),
            },
        })?;
        Ok(Self { plain, spelled })
    }

    /// The vault-relative path as the answer spells it.
    pub fn as_str(&self) -> &str {
        &self.spelled
    }

    /// The extension of the file, lower-cased, or empty.
    pub fn extension(&self) -> String {
        let name = self.plain.file_name();
        name.rsplit_once('.')
            .map_or(String::new(), |(_, extension)| extension.to_lowercase())
    }
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
    /// The file the path opens is spelled by the disk as a hidden or credential name (a lookalike
    /// letter on a case-insensitive disk opens `private_key.txt`).
    #[error("the file is hidden or named like a credential")]
    HiddenOrCredential,
    /// More bytes than the caller allows, by the file's size.
    #[error("larger than {max_bytes} bytes")]
    TooLarge { max_bytes: u64 },
    #[error("the file changed while it was read")]
    Changed,
    /// The operating system refused to open or read it (a permission, a lock).
    #[error("the file could not be opened for reading")]
    Unreadable,
}

impl From<ConfinedRefusal> for RawSourceReadRefusal {
    fn from(refusal: ConfinedRefusal) -> Self {
        match refusal {
            ConfinedRefusal::NotFound => Self::NotFound,
            ConfinedRefusal::ThroughLink => Self::ThroughLink,
            ConfinedRefusal::NotRegular => Self::NotRegular,
            ConfinedRefusal::HiddenOrCredential => Self::HiddenOrCredential,
            ConfinedRefusal::TooLarge => Self::TooLarge { max_bytes: 0 },
            ConfinedRefusal::Changed => Self::Changed,
            ConfinedRefusal::Unreadable => Self::Unreadable,
        }
    }
}

impl VaultRoot {
    /// The bytes of the raw source `path` names, when it is a regular file of at most `max_bytes`
    /// that no link leads to, read as one version.
    pub fn read_raw_source(
        &self,
        path: &RawSourcePath,
        max_bytes: u64,
    ) -> Result<Vec<u8>, RawSourceReadRefusal> {
        read_confined_file(self.path(), &path.plain, max_bytes)
            .map(|read| read.bytes)
            .map_err(|refusal| match refusal {
                ConfinedRefusal::TooLarge => RawSourceReadRefusal::TooLarge { max_bytes },
                other => other.into(),
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
