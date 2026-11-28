//! The parts of a path below a root, checked once: a value of [`PlainParts`] names a file by plain
//! names only, so the read that takes one needs no check of its own.

/// Why parts are not a plain path.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PlainPartsRefusal {
    /// No part at all: no file is named.
    #[error("no file is named")]
    Empty,
    /// An empty part, `.` or `..`: the path stays where it is or leaves its root.
    #[error("`{part}` does not name a file or folder")]
    NotAName { part: String },
    /// A separator inside a part, or a root: the part is a path, or an absolute one (`/etc`,
    /// `\share`), not a name.
    #[error("`{part}` holds a path separator")]
    Separator { part: String },
    /// A part no Windows file can have; see [`is_not_a_file_name`].
    #[error("`{part}` is not a file name on Windows (a `:`, a NUL or a device name such as CON)")]
    NotAFileName { part: String },
}

/// Whether a part could not be a file name on Windows. Microsoft, "Naming Files, Paths, and
/// Namespaces" (learn.microsoft.com/windows/win32/fileio/naming-a-file): "Do not use the following
/// reserved names for the name of a file: CON, PRN, AUX, NUL, COM0 to COM9, COM¹, COM², COM³,
/// LPT0 to LPT9, LPT¹, LPT², LPT³ ... Also avoid these names followed immediately by an extension;
/// for example, NUL.txt and NUL.tar.gz are both equivalent to NUL", and a colon is reserved (it
/// names a stream, "Using Streams" in the same documentation, and a drive, `C:`).
pub(crate) fn is_not_a_file_name(part: &str) -> bool {
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

/// Parts that name a file below a root and nothing else: at least one, none empty, `.` or `..`,
/// none holding a separator, none a name Windows reads as a device or a stream. The same parts
/// are refused on every system, so an answer does not depend on where the files lie.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlainParts {
    parts: Vec<String>,
}

impl PlainParts {
    pub fn new(parts: &[&str]) -> Result<Self, PlainPartsRefusal> {
        if parts.is_empty() {
            return Err(PlainPartsRefusal::Empty);
        }
        for part in parts {
            let owned = || (*part).to_string();
            if part.is_empty() || *part == "." || *part == ".." {
                return Err(PlainPartsRefusal::NotAName { part: owned() });
            }
            if part.contains('/') || part.contains('\\') {
                return Err(PlainPartsRefusal::Separator { part: owned() });
            }
            if is_not_a_file_name(part) {
                return Err(PlainPartsRefusal::NotAFileName { part: owned() });
            }
        }
        Ok(Self {
            parts: parts.iter().map(ToString::to_string).collect(),
        })
    }

    pub fn as_slice(&self) -> &[String] {
        &self.parts
    }

    /// The last part, the file's own name.
    pub fn file_name(&self) -> &str {
        self.parts.last().map_or("", String::as_str)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_plain_names_make_parts_and_the_rest_is_refused_by_what_it_is() {
        assert!(PlainParts::new(&["src", "a.ts"]).is_ok());
        assert!(PlainParts::new(&["console.md", "com10.md", "a.con.md"]).is_ok());
        assert_eq!(PlainParts::new(&[]), Err(PlainPartsRefusal::Empty));
        for part in ["", ".", ".."] {
            assert_eq!(
                PlainParts::new(&["src", part]),
                Err(PlainPartsRefusal::NotAName { part: part.into() })
            );
        }
        for part in ["/etc", "a/b", "\\share", "a\\b"] {
            assert_eq!(
                PlainParts::new(&[part]),
                Err(PlainPartsRefusal::Separator { part: part.into() }),
                "{part}"
            );
        }
        // Every device name, in any letter case and with any extension (Microsoft, "Naming Files,
        // Paths, and Namespaces"): Windows opens the device and not the file.
        for part in [
            "CON",
            "con.ts",
            "Prn.txt",
            "AUX",
            "nul.tar.gz",
            "COM1",
            "com9.rs",
            "LPT0",
            "lpt1.py",
            "COM\u{b9}.md",
            "CON .txt",
            "C:",
            "a:b",
            "stream.ts:data",
            "a\0b",
        ] {
            assert_eq!(
                PlainParts::new(&["src", part]),
                Err(PlainPartsRefusal::NotAFileName { part: part.into() }),
                "{part:?}"
            );
        }
    }
}
