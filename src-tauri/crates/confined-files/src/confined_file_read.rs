//! The one read of a regular file below a root that a stranger may have planted: both the vault's
//! raw sources ([`crate::VaultRoot::read_raw_source`]) and a repository's files
//! ([`crate::SourceRoot::read_repository_file`]) are read here, so they cannot drift apart.
//!
//! The path arrives as [`PlainParts`], so no part is empty, `.`, `..`, absolute or a Windows device
//! name. The read then refuses what the disk can plant at an allowed name: a link anywhere on the
//! path, a pipe, a folder, a file over the size the caller allows, a file whose real spelling is
//! hidden or a credential name, and a file that changes while it is read.
//!
//! - macOS and Linux: every part is looked at with `lstat` (a link is a link), the file is opened
//!   with `O_NOFOLLOW | O_NONBLOCK` (`plain_file`), and the open handle's facts decide its type
//!   and size.
//! - Windows: the final file is opened as itself (`FILE_FLAG_OPEN_REPARSE_POINT`) and a name
//!   surrogate reparse tag (a symbolic link or a junction) is refused by its handle facts. A folder
//!   that is a junction cannot be told from a folder by `symlink_metadata`, so the real path of the
//!   file must spell the same parts as the name did (`GetFinalPathNameByHandle`, as `real_path`
//!   reads it); otherwise it is a link. Microsoft, "Reparse Point Tags" and "Naming Files, Paths,
//!   and Namespaces" (`\\?\` paths and the 260-character limit).
//!
//! After the bytes are read, the name is looked at again: it must still lead to the file the handle
//! holds (same device and inode, or volume and file index), or the file was swapped in between.

use std::fs;
use std::io::Read;
use std::path::Path;

use crate::os_error::OsErrorCode;
use crate::plain_file;
use crate::plain_parts::PlainParts;
use crate::private_names::{folded_name, is_credential_name, is_hidden_name};
use crate::real_paths::real_path;
use crate::stable_read::FileStamp;

/// Why a confined read gave no bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConfinedRefusal {
    NotFound,
    ThroughLink,
    NotRegular,
    HiddenOrCredential,
    TooLarge,
    Changed,
    Unreadable,
}

pub(crate) struct ConfinedRead {
    pub bytes: Vec<u8>,
    pub stamp: FileStamp,
}

/// What the disk's spelling of a file's path says about the name it was asked by.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RealSpelling {
    /// The real path is the root's followed by the named parts, each as named or in another
    /// letter case or Unicode form.
    AsNamed,
    /// The real path is somewhere else, or could not be resolved: a link, a junction, a moved file.
    Elsewhere,
    /// A part of the real path, as the disk spells it, is hidden or named like a credential.
    Private,
}

/// How the real path of `file` spells the parts it was named by below the real path of `root`. A
/// case-insensitive disk opens `private_\u{212a}ey.txt` as `private_key.txt`, so the policy that
/// judged the typed name is asked again of every part as the disk spells it.
fn real_spelling(root: &Path, file: &Path, parts: &[String]) -> RealSpelling {
    let (Ok(real_root), Ok(real_file)) = (real_path(root), real_path(file)) else {
        return RealSpelling::Elsewhere;
    };
    let Ok(below) = real_file.strip_prefix(&real_root) else {
        return RealSpelling::Elsewhere;
    };
    let real_parts: Vec<String> = below
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    if real_parts
        .iter()
        .any(|part| is_hidden_name(part) || is_credential_name(part))
    {
        return RealSpelling::Private;
    }
    let same = real_parts.len() == parts.len()
        && real_parts
            .iter()
            .zip(parts)
            .all(|(real, named)| same_part(real, named));
    if same {
        RealSpelling::AsNamed
    } else {
        RealSpelling::Elsewhere
    }
}

/// Whether the disk's spelling of a part is the name's: the same text, or the same text in another
/// letter case, or in another Unicode normalization form (macOS keeps a name as it was created,
/// decomposed when a Korean or accented name came from a decomposing program, and finds it by
/// either form).
fn same_part(real: &str, named: &str) -> bool {
    real == named || folded_name(real) == folded_name(named)
}

/// The bytes of the regular file at `parts` below `root`, of at most `max_bytes`, that no link
/// leads to, read as one version.
pub(crate) fn read_confined_file(
    root: &Path,
    parts: &PlainParts,
    max_bytes: u64,
) -> Result<ConfinedRead, ConfinedRefusal> {
    let names = parts.as_slice();
    let mut file_path = root.to_path_buf();
    for part in names {
        file_path.push(part);
        match fs::symlink_metadata(&file_path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(ConfinedRefusal::ThroughLink)
            }
            Ok(_) => {}
            Err(error)
                if matches!(
                    OsErrorCode::of(&error),
                    OsErrorCode::NotFound | OsErrorCode::NotADirectory | OsErrorCode::NameTooLong
                ) =>
            {
                return Err(ConfinedRefusal::NotFound)
            }
            Err(_) => return Err(ConfinedRefusal::Unreadable),
        }
    }
    let spelling = || real_spelling(root, &file_path, names);
    let mut file = match plain_file::open_read(&file_path) {
        Ok(file) => file,
        Err(error) if plain_file::is_link_refusal(&error) => {
            return Err(ConfinedRefusal::ThroughLink)
        }
        Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => {
            return Err(ConfinedRefusal::NotFound)
        }
        Err(_) => return Err(ConfinedRefusal::Unreadable),
    };
    let before = plain_file::facts_of(&file).map_err(|_| ConfinedRefusal::Unreadable)?;
    if !before.regular {
        return Err(ConfinedRefusal::NotRegular);
    }
    if before.size > max_bytes {
        return Err(ConfinedRefusal::TooLarge);
    }
    match spelling() {
        RealSpelling::AsNamed => {}
        RealSpelling::Elsewhere => return Err(ConfinedRefusal::ThroughLink),
        RealSpelling::Private => return Err(ConfinedRefusal::HiddenOrCredential),
    }
    let mut bytes = Vec::with_capacity(usize::try_from(before.size).unwrap_or(0));
    file.by_ref()
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|_| ConfinedRefusal::Unreadable)?;
    let after = plain_file::facts_of(&file).map_err(|_| ConfinedRefusal::Unreadable)?;
    if bytes.len() as u64 != before.size || FileStamp::of(before) != FileStamp::of(after) {
        return Err(ConfinedRefusal::Changed);
    }
    if spelling() != RealSpelling::AsNamed {
        return Err(ConfinedRefusal::Changed);
    }
    still_names_the_open_file(&file_path, after.identity)?;
    Ok(ConfinedRead {
        bytes,
        stamp: FileStamp::of(after),
    })
}

/// The name, looked at once more, is not a link and leads to the file the handle holds. A file
/// swapped for another (or for a link) between the open and now is a file that changed.
fn still_names_the_open_file(file_path: &Path, held: (u64, u64)) -> Result<(), ConfinedRefusal> {
    match fs::symlink_metadata(file_path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(ConfinedRefusal::Changed),
        Ok(_) => match plain_file::facts_at(file_path) {
            Ok(named) if named.identity == held => Ok(()),
            Ok(_) => Err(ConfinedRefusal::Changed),
            Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => {
                Err(ConfinedRefusal::Changed)
            }
            Err(_) => Err(ConfinedRefusal::Unreadable),
        },
        Err(error) if OsErrorCode::of(&error) == OsErrorCode::NotFound => {
            Err(ConfinedRefusal::Changed)
        }
        Err(_) => Err(ConfinedRefusal::Unreadable),
    }
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
}
