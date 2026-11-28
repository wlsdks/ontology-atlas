//! Where the archive lives and how large one record may be.

/// The folder of the archive below the vault.
pub const ARCHIVE_DIRECTORY: &str = ".ontology-atlas/analyses";

/// The folder of the archive directly below `.ontology-atlas`.
pub const ARCHIVE_FOLDER: &str = "analyses";

/// The most bytes one record file may hold; a larger file is refused unread.
pub const MAX_RECORD_BYTES: usize = 2_000_000;

#[cfg(test)]
mod tests {
    use super::*;

    const SCRIPT_RECORD_MODULE: &str =
        include_str!("../../../../mcp/src/analysis-history/analysis-record.mts");

    #[test]
    fn the_folder_and_the_byte_limit_are_the_ones_the_script_twin_holds() {
        assert_eq!(
            ARCHIVE_DIRECTORY,
            format!(".ontology-atlas/{ARCHIVE_FOLDER}")
        );
        assert!(
            SCRIPT_RECORD_MODULE.contains(&format!("ANALYSIS_DIRECTORY = '{ARCHIVE_DIRECTORY}'")),
            "the TypeScript module names another folder"
        );
        let millions = MAX_RECORD_BYTES / 1_000_000;
        let thousands = MAX_RECORD_BYTES / 1000 % 1000;
        let units = MAX_RECORD_BYTES % 1000;
        assert!(
            SCRIPT_RECORD_MODULE.contains(&format!(
                "MAX_ANALYSIS_RECORD_BYTES = {millions}_{thousands:03}_{units:03}"
            )),
            "the TypeScript module names another byte limit"
        );
    }
}
