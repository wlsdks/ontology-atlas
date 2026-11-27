//! What reading one source file gives: its text parsed within the byte, node and time budget and
//! its imports taken from the tree. Reading is a function of the text alone, never of the
//! repository around it, so a batch of files is read on every core and placed afterwards, in the
//! order the files were listed.

use crate::bounded_parse::{parse_bounded, ParseLimits, ParseRefusal, ParsedSource};
use crate::import_edges::{ImportKind, UnresolvedReason};
use crate::jvm_declarations::{read_jvm_source, JvmFile};
use crate::python_imports::{read_python_imports, PythonImport};
use crate::rust_dependencies::{read_rust_dependencies, RustDependencies};
use crate::script_imports::{read_script_imports, ScriptImport};
use crate::source_language::SourceLanguage;

/// The imports a file holds, in the form its language places them.
pub enum FileReading {
    Rust(RustDependencies),
    Python(Vec<PythonImport>),
    Jvm(Box<JvmFile>),
    /// The regular imports in the order written, then the side-effect ones, as the two kinds were
    /// always listed.
    Script(Vec<ScriptImport>),
    /// The file was not read, and why.
    Unreadable(UnresolvedReason),
}

/// Reads `text`, the contents of `file_name` in `language`, within `max_bytes`.
pub fn read_file(
    language: SourceLanguage,
    file_name: &str,
    text: &str,
    max_bytes: usize,
) -> FileReading {
    let parsed = match parse_bounded(language, text, ParseLimits::for_imports(max_bytes)) {
        Ok(parsed) => parsed,
        Err(ParseRefusal::TooLarge) => {
            return FileReading::Unreadable(UnresolvedReason::FileTooLarge)
        }
        Err(_) => return FileReading::Unreadable(UnresolvedReason::SourceNotParsed),
    };
    read_parsed(&parsed, file_name)
        .unwrap_or(FileReading::Unreadable(UnresolvedReason::SourceNotParsed))
}

/// What the tree gives; refused when reading it outran the time the parse had.
fn read_parsed(parsed: &ParsedSource<'_>, file_name: &str) -> Result<FileReading, ParseRefusal> {
    Ok(match parsed.language() {
        SourceLanguage::Rust => FileReading::Rust(read_rust_dependencies(parsed)?),
        SourceLanguage::Python => FileReading::Python(read_python_imports(parsed)?),
        SourceLanguage::Java => {
            FileReading::Jvm(Box::new(read_jvm_source(parsed, file_name, false)?))
        }
        SourceLanguage::Kotlin => {
            FileReading::Jvm(Box::new(read_jvm_source(parsed, file_name, true)?))
        }
        _ => {
            let (side, regular): (Vec<_>, Vec<_>) = read_script_imports(parsed)?
                .into_iter()
                .partition(|import| import.kind == ImportKind::Side);
            FileReading::Script(regular.into_iter().chain(side).collect())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reader_that_outruns_the_time_the_parse_had_reads_nothing_instead_of_a_part() {
        for (language, file_name, source) in [
            (
                SourceLanguage::TypeScript,
                "a.ts",
                "import './b';\n".repeat(600),
            ),
            (SourceLanguage::Python, "a.py", "import b\n".repeat(600)),
            (SourceLanguage::Rust, "a.rs", "mod b;\n".repeat(600)),
            (
                SourceLanguage::Java,
                "A.java",
                format!("class A {{ {} }}", "B b; ".repeat(600)),
            ),
            (SourceLanguage::Kotlin, "a.kt", "val a = B()\n".repeat(600)),
        ] {
            let parsed = parse_bounded(language, &source, ParseLimits::for_imports(1 << 20))
                .expect("parses")
                .with_time_gone();
            assert!(
                matches!(
                    read_parsed(&parsed, file_name),
                    Err(ParseRefusal::TookTooLong)
                ),
                "{file_name}"
            );
        }
    }
}
