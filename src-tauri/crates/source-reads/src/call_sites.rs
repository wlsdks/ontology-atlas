//! Where product code calls `name(`: each call line outside a declaration line, a comment, a
//! doctest (`>>> f(x)`) or a Python docstring, at most `limit` (the rest only counted), so a symbol
//! read can show the guard its caller puts around it. An example in a docstring is no caller, and
//! showing it as one hides the docstring's own rule behind it.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use repository_survey::js_regex;

use crate::name_scans::calls_name;
use crate::product_index::ProductIndex;

static NOT_CODE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*(?:\/\/|#|\*|\/\*|>>>|\.\.\.\s)"));

pub struct CallSites {
    pub sites: Vec<(String, usize)>,
    pub total: usize,
}

/// The part of a Python line outside a triple-quoted string, and the quote still open after it.
fn code_outside_docstring(
    line: &str,
    open: Option<&'static str>,
) -> (String, Option<&'static str>) {
    let mut text = String::new();
    let mut quote = open;
    let mut at = 0;
    while at < line.len() {
        if let Some(held) = quote {
            let Some(close) = line.get(at..).and_then(|rest| rest.find(held)) else {
                return (text, quote);
            };
            at += close + 3;
            quote = None;
            continue;
        }
        let rest = line.get(at..).unwrap_or("");
        let double = rest.find("\"\"\"").map(|found| (found, "\"\"\""));
        let single = rest.find("'''").map(|found| (found, "'''"));
        let next = match (double, single) {
            (Some(a), Some(b)) => Some(if b.0 < a.0 { b } else { a }),
            (a, b) => a.or(b),
        };
        let Some((found, opener)) = next else {
            text.push_str(rest);
            return (text, None);
        };
        text.push_str(rest.get(..found).unwrap_or(""));
        quote = Some(opener);
        at += found + 3;
    }
    (text, quote)
}

pub fn call_sites_of(products: &ProductIndex, name: &str, limit: usize) -> CallSites {
    let mut sites = Vec::new();
    let mut total = 0;
    for file in &products.files {
        let text = products.text_of(&file.path);
        if !text.contains(name) {
            continue;
        }
        let declared: HashSet<usize> = file
            .declarations
            .iter()
            .map(|declaration| declaration.line)
            .collect();
        let python = file.path.ends_with(".py") || file.path.ends_with(".pyi");
        let mut quote: Option<&'static str> = None;
        for (index, raw) in js_lines_for_call_sites(&text).into_iter().enumerate() {
            let line = if python {
                let (code, held) = code_outside_docstring(raw, quote);
                quote = held;
                code
            } else {
                raw.to_string()
            };
            if declared.contains(&(index + 1)) || !calls_name(&line, name) {
                continue;
            }
            if NOT_CODE.is_match(&line) {
                continue;
            }
            total += 1;
            if sites.len() < limit {
                sites.push((file.path.clone(), index + 1));
            }
        }
    }
    CallSites { sites, total }
}

/// `text.split(/\r?\n/)`, the one place a line ends at `\n` or `\r\n` only. Every other reader
/// here ends a line at a lone `\r` too (`source_lines::complete_lines`), as a read quotes lines;
/// the script server finds call sites with this split, and a caller's line number must be the one
/// it reports, so a file with lone `\r` ends is one long line here by parity.
fn js_lines_for_call_sites(text: &str) -> Vec<&str> {
    text.split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect()
}
