//! Sources a stranger's vault can hold: ZIP archives that lie, text with no end, binary data under a
//! text name. Each is read through `read_units`, the only entry, and must end in an answer.

use miniz_oxide::deflate::compress_to_vec;
use raw_source_text::{read_units, ArchiveFault, SourceFormat, UnitWindow, UnitsError};

/// One ZIP entry: `declared` is the size the headers claim, `data` the inflated bytes.
struct Entry<'a> {
    name: &'a str,
    data: &'a [u8],
    declared: Option<u32>,
    stored: bool,
}

fn entry<'a>(name: &'a str, data: &'a [u8]) -> Entry<'a> {
    Entry {
        name,
        data,
        declared: None,
        stored: false,
    }
}

fn zip_of(entries: &[Entry<'_>]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut directory = Vec::new();
    for entry in entries {
        let packed = if entry.stored {
            entry.data.to_vec()
        } else {
            compress_to_vec(entry.data, 6)
        };
        let declared = entry.declared.unwrap_or(entry.data.len() as u32);
        let method: u16 = if entry.stored { 0 } else { 8 };
        let offset = out.len() as u32;
        out.extend(0x0403_4b50_u32.to_le_bytes());
        out.extend([20, 0, 0, 0]);
        out.extend(method.to_le_bytes());
        out.extend([0; 4]);
        out.extend(0_u32.to_le_bytes());
        out.extend((packed.len() as u32).to_le_bytes());
        out.extend(declared.to_le_bytes());
        out.extend((entry.name.len() as u16).to_le_bytes());
        out.extend([0, 0]);
        out.extend(entry.name.as_bytes());
        out.extend(&packed);
        directory.extend(0x0201_4b50_u32.to_le_bytes());
        directory.extend([20, 0, 20, 0, 0, 0]);
        directory.extend(method.to_le_bytes());
        directory.extend([0; 4]);
        directory.extend(0_u32.to_le_bytes());
        directory.extend((packed.len() as u32).to_le_bytes());
        directory.extend(declared.to_le_bytes());
        directory.extend((entry.name.len() as u16).to_le_bytes());
        directory.extend([0; 12]);
        directory.extend(offset.to_le_bytes());
        directory.extend(entry.name.as_bytes());
    }
    let start = out.len() as u32;
    out.extend(&directory);
    out.extend(0x0605_4b50_u32.to_le_bytes());
    out.extend([0; 4]);
    out.extend((entries.len() as u16).to_le_bytes());
    out.extend((entries.len() as u16).to_le_bytes());
    out.extend((directory.len() as u32).to_le_bytes());
    out.extend(start.to_le_bytes());
    out.extend([0, 0]);
    out
}

fn read(bytes: &[u8], extension: &str) -> Result<raw_source_text::CitableUnits, UnitsError> {
    read_units(bytes, extension, &UnitWindow::default())
}

#[test]
fn an_archive_that_inflates_past_the_budget_is_refused_not_unpacked() {
    let zeros = vec![0_u8; 70 * 1024 * 1024];
    let bomb = zip_of(&[entry("word/document.xml", &zeros)]);
    assert!(bomb.len() < 200 * 1024, "the bomb is {} bytes", bomb.len());
    let refused = read(&bomb, "docx").expect_err("past the budget");
    assert!(
        matches!(
            refused,
            UnitsError::Archive(ArchiveFault::InflatesPastLimit { .. })
        ),
        "{refused}"
    );
    // Two parts that each fit, but not together: the budget is for the whole read.
    let sheet = vec![b' '; 40 * 1024 * 1024];
    let workbook = br#"<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/><sheet name="B" sheetId="2" r:id="rId2"/></sheets></workbook>"#;
    let two_sheets = zip_of(&[
        entry("xl/workbook.xml", workbook),
        entry("xl/worksheets/sheet1.xml", &sheet),
        entry("xl/worksheets/sheet2.xml", &sheet),
    ]);
    let refused = read(&two_sheets, "xlsx").expect_err("past the budget together");
    assert!(
        matches!(
            refused,
            UnitsError::Archive(
                ArchiveFault::InflatesPastLimit { .. } | ArchiveFault::PastUnpackBudget { .. }
            )
        ),
        "{refused}"
    );
}

#[test]
fn an_entry_that_lies_about_its_size_is_refused() {
    let mut liar = entry("word/document.xml", b"<w:document/>");
    liar.declared = Some(7);
    let refused = read(&zip_of(&[liar]), "docx").expect_err("wrong size");
    assert!(matches!(refused, UnitsError::Archive(_)), "{refused}");
}

#[test]
fn an_archive_cut_short_or_not_an_archive_names_what_is_wrong() {
    let whole = zip_of(&[entry("word/document.xml", b"<w:document/>")]);
    for broken in [
        &whole[..whole.len() - 10],
        b"not a zip archive at all, no".as_slice(),
        b"PK".as_slice(),
    ] {
        assert!(matches!(read(broken, "docx"), Err(UnitsError::Archive(_))));
    }
    let wrong_part = zip_of(&[entry("other.xml", b"x")]);
    assert_eq!(
        read(&wrong_part, "docx"),
        Err(UnitsError::MissingPart {
            part: "word/document.xml"
        })
    );
}

#[test]
fn a_document_reads_its_paragraphs_and_numbers_a_repeated_heading() {
    let xml = concat!(
        "<w:document><w:body>",
        "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>Plan</w:t></w:r></w:p>",
        "<w:p><w:r><w:t>Charge &amp; ship</w:t></w:r></w:p>",
        "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>Plan</w:t></w:r></w:p>",
        "<w:p><w:r><w:t>&#x110000; stays as written</w:t></w:r></w:p>",
        "</w:body></w:document>"
    );
    let units = read(
        &zip_of(&[entry("word/document.xml", xml.as_bytes())]),
        "docx",
    )
    .expect("docx");
    let anchors: Vec<&str> = units
        .units
        .iter()
        .map(|unit| unit.anchor.as_str())
        .collect();
    assert_eq!(anchors, ["h:plan-1", "h:plan-1", "h:plan-2", "h:plan-2"]);
    assert!(units
        .units
        .iter()
        .any(|unit| unit.text.contains("&#x110000;")));
}

#[test]
fn a_text_file_of_millions_of_lines_is_windowed_and_counted() {
    let text = "line\n".repeat(2_000_000);
    let window = UnitWindow {
        from: 1_999_990,
        limit: 5,
        sheet: None,
    };
    let units = read_units(text.as_bytes(), "txt", &window).expect("text");
    assert_eq!(units.unit_count, 2_000_000);
    let anchors: Vec<&str> = units
        .units
        .iter()
        .map(|unit| unit.anchor.as_str())
        .collect();
    assert_eq!(
        anchors,
        ["l1999990", "l1999991", "l1999992", "l1999993", "l1999994"]
    );
    assert!(units.truncated);
    assert_eq!(units.next, Some(1_999_995));
}

#[test]
fn a_nul_byte_under_a_text_name_is_binary_and_a_pdf_has_no_text() {
    let binary = read(b"text\0more", "txt").expect("binary");
    assert_eq!(binary.format, SourceFormat::Binary);
    assert!(binary.units.is_empty() && binary.note.is_some());
    let pdf = read(b"%PDF-1.7", "PDF").expect("pdf");
    assert_eq!((pdf.format, pdf.unit_count), (SourceFormat::Pdf, 0));
}

#[test]
fn a_workbook_names_sheets_by_number_and_keeps_a_row_anchor_stable() {
    let workbook = br#"<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/><sheet name="B" sheetId="2" r:id="rId2"/></sheets></workbook>"#;
    let relations = br#"<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>"#;
    let first =
        br#"<worksheet><sheetData><row r="2"><c r="A2"><v>7</v></c></row></sheetData></worksheet>"#;
    let second =
        br#"<worksheet><sheetData><row r="5"><c r="A5"><v>9</v></c></row></sheetData></worksheet>"#;
    let archive = zip_of(&[
        entry("xl/workbook.xml", workbook),
        entry("xl/_rels/workbook.xml.rels", relations),
        entry("xl/worksheets/sheet1.xml", first),
        entry("xl/worksheets/sheet2.xml", second),
    ]);
    let all = read(&archive, "xlsx").expect("xlsx");
    let anchors: Vec<&str> = all.units.iter().map(|unit| unit.anchor.as_str()).collect();
    assert_eq!(anchors, ["s1r2", "s2r5"]);
    let only_second = read_units(
        &archive,
        "xlsx",
        &UnitWindow {
            sheet: Some(2),
            ..UnitWindow::default()
        },
    )
    .expect("sheet two");
    assert_eq!(only_second.units.len(), 1);
    assert_eq!(only_second.units[0].anchor, "s2r5");
}

/// A workbook whose one shared string is `megabytes` MiB and whose first row has `cells` cells that
/// all name it, then a second row of one small cell.
fn workbook_of_one_big_shared_string(megabytes: usize, cells: usize) -> Vec<u8> {
    let workbook =
        br#"<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>"#;
    let relations = br#"<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>"#;
    let shared = format!(
        "<sst><si><t>{}</t></si></sst>",
        "a".repeat(megabytes * 1024 * 1024)
    );
    let first_row = "<c t=\"s\"><v>0</v></c>".repeat(cells);
    let sheet = format!(
        "<worksheet><sheetData><row r=\"1\">{first_row}</row><row r=\"2\"><c><v>7</v></c></row></sheetData></worksheet>"
    );
    zip_of(&[
        entry("xl/workbook.xml", workbook),
        entry("xl/_rels/workbook.xml.rels", relations),
        entry("xl/sharedStrings.xml", shared.as_bytes()),
        entry("xl/worksheets/sheet1.xml", sheet.as_bytes()),
    ])
}

#[test]
fn a_row_of_cells_naming_one_big_string_is_refused_and_a_row_outside_the_window_is_not_built() {
    let window = UnitWindow {
        from: 2,
        ..UnitWindow::default()
    };
    // 300 cells of 1 MiB would join to 300 MiB, past what one read unpacks, though the file is tiny.
    let amplifier = workbook_of_one_big_shared_string(1, 300);
    assert!(
        amplifier.len() < 8 * 1024,
        "the file is {} bytes",
        amplifier.len()
    );
    let refused = read_units(&amplifier, "xlsx", &window).expect_err("a row past the budget");
    assert!(
        matches!(refused, UnitsError::RowPastBudget { .. }),
        "{refused}"
    );
    // 20 MiB in a row is allowed, and read from the second row it is counted and never joined.
    let allowed = workbook_of_one_big_shared_string(1, 20);
    let units = read_units(&allowed, "xlsx", &window).expect("a row inside the budget");
    let anchors: Vec<&str> = units
        .units
        .iter()
        .map(|unit| unit.anchor.as_str())
        .collect();
    assert_eq!((units.unit_count, anchors), (2, vec!["s1r2"]));
}
