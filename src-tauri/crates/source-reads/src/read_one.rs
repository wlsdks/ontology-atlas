//! One selector read: the file opened under the path policy, then an outline, a symbol with the
//! code around it, or a line range, each cut to the byte limits that keep one read from filling an
//! answer.

use repository_survey::repo_text;

use crate::declaration_span::{declaration_end, find_declaration, Ends};
use crate::file_outline::OutlineDeclaration;
use crate::opened_file::{open_source_file, OpenedFile};
use crate::read_environment::ReadEnvironment;
use crate::refusal_reason::RefusalReason;
use crate::selector::{ReadTarget, SourceReadSelector, MAX_LINES};
use crate::source_row::{AskedFor, NextRead, OutlineRow, ReadRow, SourceRow};
use crate::surroundings::surroundings_of;

pub const RANGE_BYTES: usize = 8 * 1024;
pub const OUTLINE_BYTES: usize = 16 * 1024;

/// What the call has left when this read starts: its bytes, and the symbol and line reads still
/// to come (an outline draws on neither).
#[derive(Debug, Clone, Copy)]
pub struct CallBudget {
    pub remaining_bytes: usize,
    pub reads_left: usize,
}

fn refuse(selector: &SourceReadSelector, reason: RefusalReason) -> SourceRow {
    SourceRow::Refused {
        asked: AskedFor::of(selector),
        reason,
    }
}

/// A declaration as the text answer sends it: `L115 def name(...)`.
pub fn outline_line(declaration: &OutlineDeclaration) -> String {
    let signature = declaration.signature.trim();
    if signature.contains(declaration.name.as_str()) {
        format!("L{} {}", declaration.line, repo_text(signature, 240))
    } else {
        let tail = if signature.is_empty() {
            String::new()
        } else {
            format!(" {}", repo_text(signature, 240))
        };
        format!(
            "L{} {} {}{}",
            declaration.line,
            declaration.kind.word(),
            repo_text(&declaration.name, 120),
            tail
        )
    }
}

fn outline_row(file: &OpenedFile) -> SourceRow {
    let mut declarations = Vec::new();
    let mut returned_bytes = 0;
    let mut truncated = file.outline.truncated;
    for declaration in file.declarations() {
        let bytes = outline_line(declaration).len() + 1;
        if returned_bytes + bytes > OUTLINE_BYTES {
            truncated = true;
            break;
        }
        declarations.push(declaration.clone());
        returned_bytes += bytes;
    }
    SourceRow::Outlined(OutlineRow {
        path: file.path.clone(),
        sha256: file.sha256.clone(),
        file_bytes: file.bytes,
        file_lines: file.lines.len(),
        language: file.outline.language,
        declarations,
        returned_bytes,
        truncated,
    })
}

/// The row `selector` asks for, or the row that says why it has none.
pub fn read_one(
    environment: &ReadEnvironment<'_>,
    selector: &SourceReadSelector,
    budget: CallBudget,
) -> SourceRow {
    let file = match open_source_file(environment.root, &selector.path, environment.ignore) {
        Ok(file) => file,
        Err(reason) => return refuse(selector, reason),
    };
    if selector
        .expected_sha256
        .as_ref()
        .is_some_and(|expected| *expected != file.sha256)
    {
        return refuse(selector, RefusalReason::HashMismatch);
    }
    let lines = &file.lines;
    let (start_line, max_lines, declaration) = match &selector.target {
        ReadTarget::Outline => return outline_row(&file),
        ReadTarget::Lines {
            start_line,
            max_lines,
        } => (*start_line, *max_lines, None),
        ReadTarget::Symbol { symbol, max_lines } => {
            let Some(found) = find_declaration(lines, file.declarations(), symbol) else {
                return refuse(selector, RefusalReason::SymbolNotFound);
            };
            let end = declaration_end(lines, file.declarations(), found, Ends::AtAnyDeclaration);
            let limit = max_lines
                .unwrap_or(MAX_LINES)
                .min(end + 1 - found.line)
                .min(MAX_LINES);
            (found.line, limit, Some(found))
        }
    };
    if start_line > lines.len() {
        return refuse(selector, RefusalReason::RangeBeyondEof);
    }
    let requested: Vec<&String> = lines.iter().skip(start_line - 1).take(max_lines).collect();
    let mut delivered: Vec<&String> = Vec::new();
    let mut returned_bytes = 0;
    for line in &requested {
        let line_bytes = line.len();
        if line_bytes > RANGE_BYTES && delivered.is_empty() {
            return refuse(selector, RefusalReason::LineTooLarge);
        }
        if returned_bytes + line_bytes > RANGE_BYTES {
            break;
        }
        delivered.push(line);
        returned_bytes += line_bytes;
    }
    let end_line = start_line + delivered.len() - 1;
    let has_more = end_line < lines.len();
    let truncated = delivered.len() < requested.len() || has_more;
    let text: String = delivered.iter().map(|line| line.as_str()).collect();
    let symbol_end = declaration
        .map(|found| declaration_end(lines, file.declarations(), found, Ends::AtAnyDeclaration));
    let surroundings = declaration.map(|found| {
        surroundings_of(
            environment,
            &file,
            found,
            end_line,
            &text,
            budget,
            returned_bytes,
        )
    });
    let context_bytes = surroundings.as_ref().map_or(0, |found| found.context_bytes);
    let cite = declaration.map(|_| format!("{}:L{start_line}-L{end_line}", selector.path));
    let next = match (declaration, symbol_end) {
        (Some(_), Some(symbol_end)) => (end_line < symbol_end).then(|| NextRead {
            path: selector.path.clone(),
            start_line: end_line + 1,
            max_lines: MAX_LINES.min(symbol_end - end_line),
            expected_sha256: Some(file.sha256.clone()),
        }),
        _ => has_more.then(|| NextRead {
            path: selector.path.clone(),
            start_line: end_line + 1,
            max_lines,
            expected_sha256: Some(file.sha256.clone()),
        }),
    };
    let symbol = match &selector.target {
        ReadTarget::Symbol { symbol, .. } if declaration.is_some() => Some(symbol.clone()),
        _ => None,
    };
    let surroundings = surroundings.unwrap_or_default();
    SourceRow::Read(Box::new(ReadRow {
        path: selector.path.clone(),
        symbol,
        full_file_sha256: file.sha256.clone(),
        file_bytes: file.bytes,
        file_lines: lines.len(),
        requested_start_line: start_line,
        requested_max_lines: max_lines,
        start_line,
        end_line,
        text,
        cite,
        returned_bytes: returned_bytes + context_bytes,
        truncated,
        request_complete: delivered.len() == requested.len(),
        file_complete: start_line == 1 && end_line == lines.len(),
        citation: format!(
            "source:{}#L{start_line}-L{end_line}@sha256:{}",
            selector.path, file.sha256
        ),
        callees: declaration.map(|_| surroundings.callees),
        context: surroundings.context,
        context_omitted: surroundings.omitted,
        callers: surroundings.callers,
        deciding: surroundings.deciding,
        family: None,
        next,
    }))
}
