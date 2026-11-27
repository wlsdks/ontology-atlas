//! The one entry: the bytes of a raw source and its extension in, the window of citable units out.

use crate::citable_unit::Unit;
use crate::docx_units::offer_docx_units;
use crate::plain_units::{offer_html_units, offer_line_units, offer_table_units};
use crate::source_format::SourceFormat;
use crate::unit_window::{UnitWindow, WindowCollector};
use crate::units_error::UnitsError;
use crate::xlsx_units::offer_xlsx_units;
use crate::zip_archive::ZipArchive;

/// The bytes Git looks at for a NUL before it calls a file binary.
const BINARY_TEST_BYTES: usize = 8000;

/// A window of a source's units, and what a reader needs to ask for the next one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CitableUnits {
    pub format: SourceFormat,
    /// Every unit the source has, not only the ones returned.
    pub unit_count: usize,
    pub from: usize,
    pub units: Vec<Unit>,
    pub truncated: bool,
    /// The `from` that continues after the last unit returned, when `truncated`.
    pub next: Option<usize>,
    pub note: Option<String>,
}

const NO_TEXT_ADVICE: &str =
    "Cite the file by page (`#p<n>`) only when a person can find that page in it.";

fn no_units(format: SourceFormat, from: usize, note: String) -> CitableUnits {
    CitableUnits {
        format,
        unit_count: 0,
        from,
        units: Vec::new(),
        truncated: false,
        next: None,
        note: Some(note),
    }
}

/// Cuts `bytes`, the file named `<something>.<extension>`, into citable units and keeps `window`.
pub fn read_units(
    bytes: &[u8],
    extension: &str,
    window: &UnitWindow,
) -> Result<CitableUnits, UnitsError> {
    let format = SourceFormat::of_extension(extension);
    let from = window.from.max(1);
    if format.is_text() && bytes.iter().take(BINARY_TEST_BYTES).any(|&byte| byte == 0) {
        let note = format!("The file holds a NUL byte, so it is not text and nothing was read. {NO_TEXT_ADVICE}");
        return Ok(no_units(SourceFormat::Binary, from, note));
    }
    let mut collector = WindowCollector::new(window);
    let mut note = None;
    match format {
        SourceFormat::Docx => {
            let mut archive = ZipArchive::open(bytes)?;
            let document = archive
                .unpack("word/document.xml")?
                .ok_or(UnitsError::MissingPart {
                    part: "word/document.xml",
                })?;
            note = offer_docx_units(&String::from_utf8_lossy(&document), &mut collector);
        }
        SourceFormat::Xlsx => {
            let mut archive = ZipArchive::open(bytes)?;
            offer_xlsx_units(&mut archive, window.sheet, &mut collector)?;
        }
        SourceFormat::Csv => {
            let delimiter = if extension.eq_ignore_ascii_case("tsv") { b'\t' } else { b',' };
            let unclosed = offer_table_units(&String::from_utf8_lossy(bytes), delimiter, &mut collector);
            note = unclosed.map(|line| {
                format!("Unclosed quoted record begins at physical line r{line}; its raw remainder was retained as one unit through EOF. This is not a full CSV/TSV validity check.")
            });
        }
        SourceFormat::Text => offer_line_units(&String::from_utf8_lossy(bytes), &mut collector),
        SourceFormat::Html => offer_html_units(&String::from_utf8_lossy(bytes), &mut collector),
        SourceFormat::Pdf => {
            return Ok(no_units(
                format,
                from,
                "A PDF is read natively by the agent runtime, page by page; cite `#p<n>` with the page number. This tool returns no text for it.".to_string(),
            ));
        }
        SourceFormat::Binary => {
            let note = if extension.is_empty() {
                format!("The file has no extension, so no text reader applies. {NO_TEXT_ADVICE}")
            } else {
                format!("No text reader for `.{extension}`. {NO_TEXT_ADVICE}")
            };
            return Ok(no_units(format, from, note));
        }
    }
    let collected = collector.finish();
    let kept = collected.units.len();
    let truncated = collected.first - 1 + kept < collected.unit_count;
    Ok(CitableUnits {
        format,
        unit_count: collected.unit_count,
        from: collected.first,
        next: truncated.then_some(collected.first + kept),
        units: collected.units,
        truncated,
        note,
    })
}
