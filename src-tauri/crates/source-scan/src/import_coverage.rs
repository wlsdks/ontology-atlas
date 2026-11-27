//! What an import scan can and cannot see, said in every answer so an empty result is read as
//! "nothing observed in the supported languages" and not as "no dependencies".

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCoverage {
    pub contract: &'static str,
    pub supported_languages: [&'static str; 5],
    pub supported_extensions: [&'static str; 11],
    pub detected_unsupported_languages: Vec<&'static str>,
    pub all_detected_languages_supported: bool,
    pub zero_edges_meaning: &'static str,
    pub limitations: Vec<String>,
}

/// The extensions the scan reads, in the order of their names.
pub const SUPPORTED_EXTENSIONS: [&str; 11] = [
    ".cjs", ".cts", ".go", ".js", ".jsx", ".mjs", ".mts", ".py", ".rs", ".ts", ".tsx",
];

/// Source files named like a credential (`secrets.ts`, `credentials.py`) are never opened, so what
/// they import is missing from the edges; the count says how much.
fn credential_named_sentence(count: usize) -> String {
    let (files, were) = if count == 1 {
        ("source file", "was")
    } else {
        ("source files", "were")
    };
    format!(
        "{count} {files} named like a credential {were} not read: a scan never opens such names, so their imports are not among the edges."
    )
}

impl ImportCoverage {
    /// `credential_named_files` is how many source files the scan left unopened because their
    /// name is a credential's; a scan that left none says nothing of it.
    pub fn new(autotools_c: bool, jvm_files_scanned: bool, credential_named_files: usize) -> Self {
        let mut limitations: Vec<String> = Vec::new();
        if autotools_c {
            limitations.push(
                "C include and build dependency graphs are not scanned; zero edges is not evidence that a C repository has no dependencies.".to_string(),
            );
        }
        if jvm_files_scanned {
            limitations.push(
                "Java and Kotlin imports are file edges only (a wildcard import names its package folder): they form no module edges. A type named in its own package and module needs no import and is matched by name without scope resolution, skipping names the file declares, imports, or uses as type parameters or enum entries; a typealias, a file in no package and a Kotlin top-level function called from its own package give no edge.".to_string(),
            );
        }
        limitations.push(
            "Rust evidence covers deterministic use paths, file-backed mod declarations, and exact literal path/include forms; macro expansion, cfg evaluation, and symbol resolution are not inferred.".to_string(),
        );
        if credential_named_files > 0 {
            limitations.push(credential_named_sentence(credential_named_files));
        }
        limitations.push(
            "Observed edges are bounded static source evidence, not runtime execution or semantic depends_on approval.".to_string(),
        );
        Self {
            contract: "importScanCoverage:v1",
            supported_languages: ["go", "javascript", "python", "rust", "typescript"],
            supported_extensions: SUPPORTED_EXTENSIONS,
            detected_unsupported_languages: if autotools_c { vec!["c"] } else { Vec::new() },
            all_detected_languages_supported: !autotools_c,
            zero_edges_meaning: "no_supported_static_import_edges_observed",
            limitations,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sentence_about_unread_credential_files_appears_only_when_there_were_some() {
        let none = ImportCoverage::new(false, false, 0);
        assert!(none
            .limitations
            .iter()
            .all(|line| !line.contains("credential")));
        let one = ImportCoverage::new(false, false, 1);
        let many = ImportCoverage::new(false, false, 3);
        assert!(one
            .limitations
            .iter()
            .any(|line| line.starts_with("1 source file named like a credential was not read")));
        assert!(many
            .limitations
            .iter()
            .any(|line| line.starts_with("3 source files named like a credential were not read")));
        assert_eq!(one.limitations.len(), none.limitations.len() + 1);
    }
}
