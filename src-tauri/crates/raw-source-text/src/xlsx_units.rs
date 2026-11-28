//! An XLSX as the rows of its sheets: `s<n>r<m>`, where `n` counts sheets in workbook order and `m`
//! is the row's own number in the sheet. Cells are joined with ` | ` so a row reads as one line;
//! shared strings are resolved and a formula gives its cached value.

use std::borrow::Cow;
use std::collections::HashMap;

use answer_format::whitespace::{collapse_whitespace, trim};

use crate::citable_unit::{Unit, UnitKind, UnitPlace};
use crate::markup_scan::{
    attribute_pair, attribute_value, between, decode_xml_text, open_tags, row_cells, sheet_rows,
    text_of,
};
use crate::unit_window::WindowCollector;
use crate::units_error::UnitsError;
use crate::zip_archive::{ZipArchive, UNPACK_BUDGET_BYTES};

struct SheetEntry {
    number: usize,
    name: String,
    relationship_id: String,
}

fn sheets_of(workbook_xml: &str) -> Vec<SheetEntry> {
    open_tags(workbook_xml, "sheet")
        .into_iter()
        .filter_map(|tag| attribute_pair(tag, "name", "r:id"))
        .enumerate()
        .map(|(index, (name, relationship_id))| SheetEntry {
            number: index + 1,
            name: decode_xml_text(name),
            relationship_id: relationship_id.to_string(),
        })
        .collect()
}

/// The part path of each relationship, by its id; a later relationship with the same id wins.
fn targets_of(relationships_xml: &str) -> HashMap<String, String> {
    open_tags(relationships_xml, "Relationship")
        .into_iter()
        .filter_map(|tag| attribute_pair(tag, "Id", "Target"))
        .map(|(id, target)| (id.to_string(), target.to_string()))
        .collect()
}

/// `target` below `xl/`: a leading `/` and a leading `xl/` are dropped.
fn sheet_part(target: &str) -> String {
    let target = target.strip_prefix('/').unwrap_or(target);
    format!("xl/{}", target.strip_prefix("xl/").unwrap_or(target))
}

/// What a cell holds before its whitespace is collapsed. A shared string is borrowed, so a row of
/// cells that all name one megabyte of text costs the cells, not the megabytes.
fn cell_text<'a>(attributes: &str, body: &str, shared: &'a [String]) -> Cow<'a, str> {
    let cell_type = attribute_value(attributes, "t");
    let first_value = || between(body, "<v>", "</v>").first().copied().unwrap_or("");
    match cell_type {
        Some("s") => {
            let index = text_of(first_value());
            let digits: String = trim(&index)
                .chars()
                .take_while(char::is_ascii_digit)
                .collect();
            Cow::Borrowed(
                digits
                    .parse::<usize>()
                    .ok()
                    .and_then(|index| shared.get(index))
                    .map_or("", String::as_str),
            )
        }
        Some("inlineStr") => Cow::Owned(text_of(
            between(body, "<is>", "</is>")
                .first()
                .copied()
                .unwrap_or(""),
        )),
        _ => Cow::Owned(text_of(first_value())),
    }
}

/// The text of a row of cells: each collapsed, the empty ones at the end already dropped, the rest
/// joined with ` | `. Only a row inside the window is ever joined.
fn row_text(cells: &[Cow<'_, str>]) -> String {
    let collapsed: Vec<String> = cells
        .iter()
        .map(|cell| collapse_whitespace(trim(cell)))
        .collect();
    let joined = collapsed.join(" | ");
    trim(&joined).to_string()
}

/// The characters of a row before its cells are joined, counted with the separators. A row past
/// what one read may unpack is refused, however many cells name the same shared string.
fn row_size(cells: &[Cow<'_, str>]) -> usize {
    const SEPARATOR: usize = " | ".len();
    cells.iter().fold(0_usize, |size, cell| {
        size.saturating_add(cell.len()).saturating_add(SEPARATOR)
    })
}

pub(crate) fn offer_xlsx_units(
    archive: &mut ZipArchive<'_>,
    only_sheet: Option<usize>,
    collector: &mut WindowCollector,
) -> Result<(), UnitsError> {
    let workbook = archive
        .unpack("xl/workbook.xml")?
        .ok_or(UnitsError::MissingPart {
            part: "xl/workbook.xml",
        })?;
    let sheets = sheets_of(&String::from_utf8_lossy(&workbook));
    let relationships = archive
        .unpack("xl/_rels/workbook.xml.rels")?
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .unwrap_or_default();
    let targets = targets_of(&relationships);
    let mut shared = Vec::new();
    if let Some(bytes) = archive.unpack("xl/sharedStrings.xml")? {
        let xml = String::from_utf8_lossy(&bytes);
        shared.extend(between(&xml, "<si>", "</si>").into_iter().map(text_of));
    }
    for sheet in sheets {
        if only_sheet.is_some_and(|wanted| wanted != sheet.number) {
            continue;
        }
        let target = targets
            .get(&sheet.relationship_id)
            .cloned()
            .unwrap_or_else(|| format!("worksheets/sheet{}.xml", sheet.number));
        let Some(bytes) = archive.unpack(&sheet_part(&target))? else {
            continue;
        };
        let xml = String::from_utf8_lossy(&bytes);
        for row in sheet_rows(&xml) {
            let cells: Vec<Cow<'_, str>> = row_cells(row.body)
                .iter()
                .map(|cell| cell_text(cell.attributes, cell.body, &shared))
                .collect();
            let Some(last) = cells.iter().rposition(|cell| !trim(cell).is_empty()) else {
                continue;
            };
            let cells = cells.get(..=last).unwrap_or_default();
            if row_size(cells) > UNPACK_BUDGET_BYTES {
                return Err(UnitsError::RowPastBudget {
                    anchor: format!("s{}r{}", sheet.number, row.number),
                });
            }
            collector.offer(|| Unit {
                anchor: format!("s{}r{}", sheet.number, row.number),
                place: UnitPlace::Sheet(sheet.name.clone()),
                text: row_text(cells),
                kind: UnitKind::Row,
            });
        }
    }
    Ok(())
}
