//! What a raw source is, by the extension of its name.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceFormat {
    Docx,
    Xlsx,
    Csv,
    Text,
    Html,
    Pdf,
    Binary,
}

impl SourceFormat {
    /// The format an extension (any letter case) names. TSV is read as CSV with a tab; a name with
    /// no extension, or one no reader knows, is binary.
    pub fn of_extension(extension: &str) -> Self {
        match extension.to_lowercase().as_str() {
            "docx" => Self::Docx,
            "xlsx" => Self::Xlsx,
            "csv" | "tsv" => Self::Csv,
            "txt" | "md" | "markdown" | "log" | "json" | "yaml" | "yml" => Self::Text,
            "html" | "htm" => Self::Html,
            "pdf" => Self::Pdf,
            _ => Self::Binary,
        }
    }

    /// The name of the format in a sentence: `DOCX`, `CSV`, `text`.
    pub fn label(self) -> String {
        match self {
            Self::Docx => "DOCX",
            Self::Xlsx => "XLSX",
            Self::Csv => "CSV",
            Self::Text => "text file",
            Self::Html => "HTML file",
            Self::Pdf => "PDF",
            Self::Binary => "binary file",
        }
        .to_string()
    }

    /// Whether the units are cut from the file's characters, so a NUL byte means it is no source.
    pub(crate) fn is_text(self) -> bool {
        matches!(self, Self::Csv | Self::Text | Self::Html)
    }
}
