//! One selector read: the file opened under the path policy, then an outline, a symbol with the
//! code around it, or a line range, each cut to the byte limits that keep one read from filling an
//! answer.

use repository_survey::repo_text;

use crate::declaration_span::{declaration_end, find_declaration, Ends};
use crate::file_outline::OutlineDeclaration;
use crate::opened_file::OpenedFile;
use crate::read_environment::ReadEnvironment;
use crate::refusal_reason::RefusalReason;
use crate::selector::{ReadTarget, SourceReadSelector, MAX_LINES};
use crate::source_row::{AskedFor, NextRead, OutlineRow, ReadRow, SourceRow};
use crate::symbol_context::{symbol_context, CONTEXT_BYTES};

pub const RANGE_BYTES: usize = 8 * 1024;
pub const OUTLINE_BYTES: usize = 16 * 1024;

/// What the call has left when this read starts: its bytes, and the symbol and line reads still
/// to come (an outline draws on neither).
#[derive(Debug, Clone, Copy)]
pub struct CallBudget {
    pub remaining_bytes: usize,
    pub reads_left: usize,
}

/// The context bytes one symbol read may add: an even share of what the call has left (so the last
/// of eight reads is not starved), at least 1.5 KiB for the best part when the call can afford it,
/// at most [`CONTEXT_BYTES`].
fn context_budget(budget: CallBudget, body_bytes: usize) -> i64 {
    let left = i64::try_from(budget.remaining_bytes).unwrap_or(i64::MAX);
    let body = i64::try_from(body_bytes).unwrap_or(i64::MAX);
    let reads = i64::try_from(budget.reads_left.max(1)).unwrap_or(1);
    let share = left / reads - body;
    CONTEXT_BYTES.min(left - body).min(1536.max(share)).max(0)
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
    let file = match environment.opener.open_or_refuse(&selector.path) {
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
    let context = declaration.map(|found| {
        symbol_context(
            environment,
            &file,
            found,
            end_line,
            &text,
            context_budget(budget, returned_bytes),
        )
    });
    let context_bytes = context.as_ref().map_or(0, |found| found.bytes);
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
    let (callees, parts, omitted, callers, deciding) = match context {
        Some(found) => (
            Some(found.callees),
            found.parts,
            found.omitted,
            found.callers,
            found.deciding,
        ),
        None => (None, Vec::new(), Vec::new(), Vec::new(), None),
    };
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
        callees,
        context: parts,
        context_omitted: omitted,
        callers,
        deciding,
        family: None,
        next,
    }))
}
