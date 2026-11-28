//! `read_source`: one raw source below the vault's `sources/` folder as citable units, each with
//! the anchor a wiki page cites. Repository code is read through `analyze_repo_structure`.

use confined_files::{
    sha256_hex, RawSourcePath, RawSourcePathRefusal, RawSourceReadRefusal, VaultRoot,
};
use raw_source_text::{
    read_units, SourceFormat, Unit, UnitWindow, UnitsError, DEFAULT_UNIT_LIMIT, MAX_UNIT_LIMIT,
};
use serde::Serialize;

use super::argument_checks::{optional_positive_integer, required_non_blank_text};
use super::read_vault::open_root;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{ErrorCode, ToolError};

/// A source is held in memory whole while it is read.
const MAX_FILE_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Serialize)]
struct Source<'a> {
    path: &'a str,
    format: SourceFormat,
    #[serde(rename = "unitCount")]
    unit_count: usize,
    from: usize,
    units: Vec<Unit>,
    truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    next: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    sha256: String,
}

fn path_refusal(refusal: RawSourcePathRefusal) -> ToolError {
    match refusal {
        RawSourcePathRefusal::NotUnderSources { path } => {
            let quoted = serde_json::to_string(&path).unwrap_or_else(|_| format!("\"{path}\""));
            ToolError::invalid(format!(
                "read_source: `{path}` is repository code, and read_source reads only the documents in the vault's `sources/` folder (for example `sources/plan.docx`). Read repository code with analyze_repo_structure({{ sourceReads: [{{ path: {quoted}, mode: \"outline\" }}] }}) for its declarations with line numbers, then {{ path: {quoted}, startLine: <n>, maxLines: <at most 200> }} for the exact lines."
            ))
        }
        RawSourcePathRefusal::NamesNoFile { .. } => ToolError::invalid(
            "read_source: `path` must name a file under `sources/`, such as `sources/plan.docx`.",
        ),
        RawSourcePathRefusal::TooLong => ToolError::invalid(format!(
            "read_source: `path` is longer than {} bytes, which no file system opens.",
            confined_files::RAW_SOURCE_PATH_MAX_BYTES
        )),
        RawSourcePathRefusal::HiddenOrCredential { path } => ToolError::invalid(format!(
            "read_source: `{path}` is a hidden file or has a credential-like name (secret, credentials, *.pem, *.key), which a vault read never opens. Rename the document if it is neither."
        )),
        RawSourcePathRefusal::NotAFileName { path } => ToolError::invalid(format!(
            "read_source: `{path}` has a part that is not a file name on Windows: one with a `:` or a NUL, or a device name such as CON, NUL or COM1 (also with an extension). Rename the file so the vault reads the same on every system."
        )),
    }
}

fn read_refusal(path: &str, refusal: &RawSourceReadRefusal) -> ToolError {
    let (code, reason) = match refusal {
        RawSourceReadRefusal::NotFound => (
            ErrorCode::NotFound,
            "is not in this folder. `validate_wiki` lists the sources every page cites.".to_string(),
        ),
        RawSourceReadRefusal::ThroughLink => (
            ErrorCode::ToolError,
            "is a symbolic link or sits under one. read_source reads only regular files inside the vault's `sources/` folder, so a link cannot hand it a file from elsewhere on the disk. Copy the document into `sources/` instead of linking it.".to_string(),
        ),
        RawSourceReadRefusal::NotRegular => (
            ErrorCode::ToolError,
            "is not a regular file. Name one document file under `sources/`.".to_string(),
        ),
        RawSourceReadRefusal::HiddenOrCredential => (
            ErrorCode::ToolError,
            "opens a hidden or credential-like file on this disk (a letter that folds to another), which a vault read never opens.".to_string(),
        ),
        RawSourceReadRefusal::TooLarge { max_bytes } => (
            ErrorCode::ToolError,
            format!(
                "is larger than {} MiB, the most read_source reads at once. Split the document, or cite a PDF by page from your own reader.",
                max_bytes / 1024 / 1024
            ),
        ),
        RawSourceReadRefusal::Changed => (
            ErrorCode::ToolError,
            "changed while it was being read. Read it again.".to_string(),
        ),
        RawSourceReadRefusal::Unreadable => (
            ErrorCode::ToolError,
            "could not be opened as a readable regular file. Check its permissions.".to_string(),
        ),
    };
    ToolError::new(code, format!("read_source: `{path}` {reason}"))
}

fn unreadable_document(path: &str, format: &str, error: &UnitsError) -> ToolError {
    ToolError::failed(format!(
        "read_source: `{path}` could not be read as a {format}: {error}."
    ))
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the arguments were checked to be whole numbers of at least one"
)]
fn count(number: f64) -> usize {
    number as usize
}

fn read_bytes(root: &VaultRoot, path: &RawSourcePath) -> Result<Vec<u8>, ToolError> {
    root.read_raw_source(path, MAX_FILE_BYTES)
        .map_err(|refusal| read_refusal(path.as_str(), &refusal))
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let typed = required_non_blank_text(arguments, "path")?;
    let from = optional_positive_integer(arguments, "from", None)?;
    let limit = optional_positive_integer(arguments, "limit", Some(MAX_UNIT_LIMIT as f64))?;
    let sheet = optional_positive_integer(arguments, "sheet", None)?;
    let path = RawSourcePath::parse(&typed).map_err(path_refusal)?;
    let root = open_root(context)?;
    let bytes = read_bytes(&root, &path)?;
    let window = UnitWindow {
        from: from.map_or(1, count),
        limit: limit.map_or(DEFAULT_UNIT_LIMIT, count),
        sheet: sheet.map(count),
    };
    let extension = path.extension();
    let cut = read_units(&bytes, &extension, &window).map_err(|error| {
        unreadable_document(
            path.as_str(),
            &SourceFormat::of_extension(&extension).label(),
            &error,
        )
    })?;
    ToolOutput::json(&Source {
        path: path.as_str(),
        format: cut.format,
        unit_count: cut.unit_count,
        from: cut.from,
        units: cut.units,
        truncated: cut.truncated,
        next: cut.next,
        note: cut.note,
        sha256: sha256_hex(&bytes),
    })
}
