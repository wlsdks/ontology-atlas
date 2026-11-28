//! What a slug may name before any path is built from it: the vault's raw-source folder and the
//! names a write tool never creates, edits or deletes. A refusal is a typed reason; the sentence an
//! agent reads is the server's to write (`crate::agent_text` holds the JavaScript server's).

use std::sync::OnceLock;

use icu_normalizer::ComposingNormalizerBorrowed;
use regex::Regex;

use crate::plain_parts::is_not_a_file_name;

/// The vault folder of raw sources: every file below it is a source, never a node.
pub const VAULT_SOURCES_DIR: &str = "sources";

/// Instruction files that coding agents load, compared after NFKC and lower-casing. The
/// `agent-instruction-files` contract test holds this list to the classifier the app uses.
pub const AGENT_INSTRUCTION_FILE_STEMS: [&str; 5] = [
    "agents",
    "agents.override",
    "claude",
    "claude.local",
    "gemini",
];

/// Why a write tool may not create, edit or delete the file a slug names.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum UnwritableReason {
    /// A control or invisible formatting character, which can break a line or disguise which
    /// file is meant.
    #[error("the slug contains U+{code_point:04X}, a control or invisible formatting character")]
    InvisibleCharacter { code_point: u32 },
    /// A segment ending like a Windows short file name (`~1`), which on Windows can open a
    /// different file.
    #[error("the segment {segment:?} ends like a Windows short file name")]
    ShortFileName { segment: String },
    /// A segment starting with `.`: hidden folders hold agent and tool configuration.
    #[error("the segment {segment:?} starts with a dot")]
    HiddenSegment { segment: String },
    /// A segment with a colon, which on Windows names a data stream of another file (`a.md:x`)
    /// or a drive. Only refused on Windows, where it can change the bytes of a file the slug
    /// does not name.
    #[error(
        "the segment {segment:?} has a colon, which on Windows names a data stream or a drive"
    )]
    ColonInSegment { segment: String },
    /// A segment Windows opens as a device (`CON`, `NUL`, `COM1`, with or without an extension)
    /// and not as a file. Refused on every system for a file a write creates, so a vault that
    /// moves between them keeps working: see [`crate::plain_parts`] for the source of the names.
    /// A file that already has such a name is not refused: it is already there, and a rename or a
    /// delete is the way out of it ([`device_name_reason`]).
    #[error("the segment {segment:?} is a Windows device name")]
    DeviceName { segment: String },
    /// A file coding agents load as their instructions, in any letter case.
    #[error("{file_name}.md is a file coding agents load as their instructions")]
    AgentInstructionFile { file_name: String },
    /// The vault README, which a write tool never authors.
    #[error("the slug is the vault README")]
    VaultReadme,
}

fn invisible_character() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // A constant pattern: the tests below compile and run it on every build.
        Regex::new(r"[\p{Cc}\p{Cf}\u{2028}\u{2029}]").expect("a constant, valid pattern")
    })
}

/// A slug is a vault-relative name; the raw-source folder is not a place for nodes.
pub fn is_vault_source_path(relative_path: &str) -> bool {
    relative_path.starts_with("sources/")
}

/// The raw file a source slug names: the slug itself when its last part has an extension, else
/// `<slug>.md`.
pub fn raw_source_file_for_slug(slug: &str) -> String {
    let last = slug.rsplit('/').next().unwrap_or(slug);
    // `/\.[^/.]+$/` needs at least one character after the last dot of the last part.
    let has_extension = last.rfind('.').is_some_and(|dot| dot + 1 < last.len());
    if has_extension {
        slug.to_string()
    } else {
        format!("{slug}.md")
    }
}

fn ends_like_short_file_name(segment: &str) -> bool {
    // `/~\d+$/`: a tilde, then ASCII digits to the end.
    let digits = segment.bytes().rev().take_while(u8::is_ascii_digit).count();
    digits > 0
        && segment
            .len()
            .checked_sub(digits + 1)
            .and_then(|tilde| segment.as_bytes().get(tilde))
            == Some(&b'~')
}

fn nfkc_lowercase(text: &str) -> String {
    ComposingNormalizerBorrowed::new_nfkc()
        .normalize(text)
        .to_lowercase()
}

/// Why a write tool may not create, edit or delete the file `slug` names, or `None` when it may:
/// an invisible character, a Windows short-name ending, a hidden segment, a colon on Windows, an
/// agent instruction file in any letter case, or the vault README. A Windows device name is not
/// among them: it bars a file from being created ([`device_name_reason`]), not from being edited.
pub fn unwritable_slug_reason(slug: &str) -> Option<UnwritableReason> {
    if let Some(found) = invisible_character().find(slug) {
        let code_point = found.as_str().chars().next().map_or(0, u32::from);
        return Some(UnwritableReason::InvisibleCharacter { code_point });
    }
    let segments: Vec<&str> = slug.split(['\\', '/']).collect();
    if let Some(segment) = segments
        .iter()
        .find(|segment| ends_like_short_file_name(segment))
    {
        return Some(UnwritableReason::ShortFileName {
            segment: (*segment).to_string(),
        });
    }
    if let Some(segment) = segments.iter().find(|segment| segment.starts_with('.')) {
        return Some(UnwritableReason::HiddenSegment {
            segment: (*segment).to_string(),
        });
    }
    if cfg!(windows) {
        if let Some(segment) = segments.iter().find(|segment| segment.contains(':')) {
            return Some(UnwritableReason::ColonInSegment {
                segment: (*segment).to_string(),
            });
        }
    }
    let last = segments.last().copied().unwrap_or("");
    let stem = nfkc_lowercase(last);
    if AGENT_INSTRUCTION_FILE_STEMS.contains(&stem.as_str()) {
        return Some(UnwritableReason::AgentInstructionFile {
            file_name: last.to_string(),
        });
    }
    (segments.len() == 1 && stem == "readme").then_some(UnwritableReason::VaultReadme)
}

/// The segment of `slug` that Windows opens as a device, when a write would create the file it
/// names. Only a new file is refused: a vault may already hold `elements/aux.md` (made on another
/// system, or before the rule), and refusing its edits would leave a reference to it dangling
/// after a rename and make the file impossible to rename or delete.
pub(crate) fn device_name_reason(slug: &str) -> Option<UnwritableReason> {
    // A colon has its own rule in `unwritable_slug_reason` (Windows only); `is_not_a_file_name`
    // would also refuse it everywhere.
    slug.split(['\\', '/'])
        .find(|segment| !segment.contains(':') && is_not_a_file_name(segment))
        .map(|segment| UnwritableReason::DeviceName {
            segment: segment.to_string(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_source_slug_is_named_with_the_raw_file_to_read_instead() {
        assert_eq!(
            raw_source_file_for_slug("sources/notes/a"),
            "sources/notes/a.md"
        );
        assert_eq!(
            raw_source_file_for_slug("sources/data.json"),
            "sources/data.json"
        );
        assert_eq!(raw_source_file_for_slug("sources/a."), "sources/a..md");
        assert_eq!(
            raw_source_file_for_slug("sources/a.b/c"),
            "sources/a.b/c.md"
        );
        assert!(is_vault_source_path("sources/a"));
        assert!(!is_vault_source_path("sources"));
        assert!(!is_vault_source_path("domains/auth"));
    }

    #[cfg(windows)]
    #[test]
    fn a_colon_is_refused_on_windows_where_it_names_a_data_stream() {
        for slug in ["a.md:stream", "notes/a:b", "C:notes"] {
            assert!(
                matches!(
                    unwritable_slug_reason(slug),
                    Some(UnwritableReason::ColonInSegment { .. })
                ),
                "{slug}"
            );
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn a_colon_is_a_plain_character_off_windows() {
        assert_eq!(unwritable_slug_reason("notes/a:b"), None);
    }

    /// Microsoft, "Naming Files, Paths, and Namespaces": CON, PRN, AUX, NUL, COM0 to COM9 and LPT0 to
    /// LPT9 are reserved, "also avoid these names followed immediately by an extension".
    #[test]
    fn a_windows_device_name_bars_a_new_file_in_any_segment_on_every_system_and_no_edit() {
        for slug in ["nul", "domains/con", "con/notes", "elements/AUX.v2", "notes/com1", "lpt9.txt"] {
            assert!(
                matches!(
                    device_name_reason(slug),
                    Some(UnwritableReason::DeviceName { .. })
                ),
                "{slug}"
            );
            assert_eq!(unwritable_slug_reason(slug), None, "{slug}: a file that exists stays editable");
        }
        for slug in ["domains/console", "elements/nulls", "notes/com10", "domains/icon", "axis/aux-tool"] {
            assert_eq!(device_name_reason(slug), None, "{slug}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_opens_a_device_name_with_an_extension_as_the_device() {
        // Microsoft: "NUL.txt and NUL.tar.gz are both equivalent to NUL"; the same rule as the refusal
        // above, run where the claim holds, with trailing spaces the API strips from a segment.
        for slug in ["notes/NUL.txt", "notes/nul .md", "notes/Com\u{b2}"] {
            assert!(
                matches!(
                    device_name_reason(slug),
                    Some(UnwritableReason::DeviceName { .. })
                ),
                "{slug}"
            );
        }
    }

    #[test]
    fn invisible_characters_are_named_by_code_point() {
        assert_eq!(
            unwritable_slug_reason("a\u{202e}b"),
            Some(UnwritableReason::InvisibleCharacter { code_point: 0x202e })
        );
        assert_eq!(
            unwritable_slug_reason("a\tb"),
            Some(UnwritableReason::InvisibleCharacter { code_point: 9 })
        );
        assert!(matches!(
            unwritable_slug_reason("a\u{2028}b"),
            Some(UnwritableReason::InvisibleCharacter { code_point: 0x2028 })
        ));
        assert_eq!(unwritable_slug_reason("domains/\u{d55c}\u{ae00}"), None);
    }

    #[test]
    fn a_short_name_ending_hidden_segment_and_instruction_file_are_refused() {
        assert_eq!(
            unwritable_slug_reason("docs/PROGRA~1"),
            Some(UnwritableReason::ShortFileName {
                segment: "PROGRA~1".to_string()
            })
        );
        assert_eq!(unwritable_slug_reason("docs/a~"), None);
        assert_eq!(unwritable_slug_reason("docs/a~x1"), None);
        assert_eq!(
            unwritable_slug_reason(".claude/rules"),
            Some(UnwritableReason::HiddenSegment {
                segment: ".claude".to_string()
            })
        );
        for slug in [
            "AGENTS",
            "docs/claude",
            "Gemini",
            "agents.override",
            "docs\\CLAUDE.local",
            // A full-width spelling folds to the same file name under NFKC.
            "\u{ff21}\u{ff27}\u{ff25}\u{ff2e}\u{ff34}\u{ff33}",
        ] {
            assert!(
                matches!(
                    unwritable_slug_reason(slug),
                    Some(UnwritableReason::AgentInstructionFile { .. })
                ),
                "{slug}"
            );
        }
        assert_eq!(
            unwritable_slug_reason("README"),
            Some(UnwritableReason::VaultReadme)
        );
        assert_eq!(unwritable_slug_reason("docs/README"), None);
        assert_eq!(unwritable_slug_reason("capabilities/read-vault"), None);
    }
}
