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
    pub limitations: Vec<&'static str>,
}

/// The extensions the scan reads, in the order of their names.
pub const SUPPORTED_EXTENSIONS: [&str; 11] = [
    ".cjs", ".cts", ".go", ".js", ".jsx", ".mjs", ".mts", ".py", ".rs", ".ts", ".tsx",
];

impl ImportCoverage {
    pub fn new(autotools_c: bool, jvm_files_scanned: bool) -> Self {
        let mut limitations = Vec::new();
        if autotools_c {
            limitations.push(
                "C include and build dependency graphs are not scanned; zero edges is not evidence that a C repository has no dependencies.",
            );
        }
        if jvm_files_scanned {
            limitations.push(
                "Java and Kotlin imports are file edges only (a wildcard import names its package folder): they form no module edges. A type named in its own package and module needs no import and is matched by name without scope resolution, skipping names the file declares, imports, or uses as type parameters or enum entries; a typealias, a file in no package and a Kotlin top-level function called from its own package give no edge.",
            );
        }
        limitations.push(
            "Rust evidence covers deterministic use paths, file-backed mod declarations, and exact literal path/include forms; macro expansion, cfg evaluation, and symbol resolution are not inferred.",
        );
        limitations.push(
            "Observed edges are bounded static source evidence, not runtime execution or semantic depends_on approval.",
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
