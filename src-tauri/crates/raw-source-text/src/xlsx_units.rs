//! An XLSX as the rows of its sheets: `s<n>r<m>`, where `n` counts sheets in workbook order and `m`
//! is the row's own number in the sheet. Cells are joined with ` | ` so a row reads as one line;
//! shared strings are resolved and a formula gives its cached value.

use std::collections::HashMap;

use answer_format::whitespace::trim;

use crate::citable_unit::{Unit, UnitKind, UnitPlace};
use crate::docx_units::collapse_whitespace;
use crate::markup_scan::{
    attribute_pair, attribute_value, between, decode_xml_text, open_tags, row_cells, sheet_rows,
    text_of,
};
use crate::unit_window::WindowCollector;
use crate::units_error::UnitsError;
use crate::zip_archive::ZipArchive;

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

fn cell_value(attributes: &str, body: &str, shared: &[String]) -> String {
    let cell_type = attribute_value(attributes, "t");
    let first_value = || between(body, "<v>", "</v>").first().copied().unwrap_or("");
    let value = match cell_type {
        Some("s") => {
            let index = text_of(first_value());
            let digits: String = trim(&index)
                .chars()
                .take_while(char::is_ascii_digit)
                .collect();
            digits
                .parse::<usize>()
                .ok()
                .and_then(|index| shared.get(index))
                .cloned()
                .unwrap_or_default()
        }
        Some("inlineStr") => text_of(between(body, "<is>", "</is>").first().copied().unwrap_or("")),
        _ => text_of(first_value()),
    };
    collapse_whitespace(trim(&value))
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
            let mut cells: Vec<String> = row_cells(row.body)
                .iter()
                .map(|cell| cell_value(cell.attributes, cell.body, &shared))
                .collect();
            while cells.last().is_some_and(String::is_empty) {
                cells.pop();
            }
            let joined = cells.join(" | ");
            let text = trim(&joined);
            if !text.is_empty() {
                collector.offer(|| Unit {
                    anchor: format!("s{}r{}", sheet.number, row.number),
                    place: UnitPlace::Sheet(sheet.name.clone()),
                    text: text.to_string(),
                    kind: UnitKind::Row,
                });
            }
        }
    }
    Ok(())
}
