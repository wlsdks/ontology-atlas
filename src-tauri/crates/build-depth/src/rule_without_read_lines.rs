//! A capability that states a rule (a paragraph after its definition with a condition, an order or
//! a default) but cites no lines that hold a condition. A reader cannot check such a rule, and a
//! rule taken from a body without its guard or default can be backwards.
//!
//! Without a repository the cited lines cannot be looked at, so a cite stands as given. No read
//! ledger is consulted: a cite is judged by the lines it names, not by whether this session served
//! them.

use std::sync::LazyLock;

use confined_files::SourceFiles;
use regex::Regex;
use vault_document::{Issue, LoadedDocument};

use crate::line_cites::{cited_symbol, line_cites, pattern, Cite, CitedText};
use crate::node_fields::{kind_of, node_path};

const DECIDE_CHARS: usize = 2000;

static RULE_WORDS: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?i-u:\b(?:if|unless|only|when|whenever|before|after|until|otherwise|default|defaults|first|must|requires?|refuses?|rejects?|never|skips?|falls? back|instead)\b)",
    )
});
static CODE_SPAN: LazyLock<Regex> = LazyLock::new(|| pattern(r"`[^`\n]*`"));
static CONDITION: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r"(?-u:\b)(?:if|elif|else|unless|switch|case|when|match|guard|while|raise|throw|except|catch|default)(?-u:\b)|(?-u:\b)(?:errors\.New|fmt\.Errorf)\(|\?\?|\|\||&&",
    )
});
static DEFAULT_VALUE: LazyLock<Regex> = LazyLock::new(|| {
    pattern(
        r#"(?:^|[\s(,{])[A-Za-z_$][A-Za-z0-9_$]*\s*(?::=|=|:)\s*(?:true|false|True|False|None|null|nil|-?[0-9][0-9_.]*|"[^"\n]*"|'[^'\n]*')\s*(?:[,)}]|$)"#,
    )
});
static COMMENT: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\s*(?://|#|\*|/\*)"));

/// Whether a paragraph's prose states a rule. Code spans are left out: an identifier such as
/// `default` or an error code holding `must` names code, not a condition.
fn states_rule(paragraph: &str) -> bool {
    RULE_WORDS.is_match(&CODE_SPAN.replace_all(paragraph, " "))
}

/// The paragraphs before the first `## ` heading.
fn pre_section_paragraphs(body: &str) -> Vec<String> {
    let mut paragraphs = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    let mut close = |current: &mut Vec<&str>| {
        if !current.is_empty() {
            paragraphs.push(current.join("\n").trim().to_string());
            current.clear();
        }
    };
    for line in body.split('\n') {
        let opens_section = line
            .strip_prefix("##")
            .is_some_and(|rest| rest.chars().next().is_none_or(char::is_whitespace));
        if opens_section {
            break;
        }
        if line.trim().is_empty() {
            close(&mut current);
        } else {
            current.push(line);
        }
    }
    close(&mut current);
    paragraphs.retain(|paragraph| !paragraph.is_empty());
    paragraphs
}

/// `a ? b : c` with spaces around both marks and no colon between them, in one right-to-left pass.
fn has_ternary(line: &[char]) -> bool {
    let space = |at: usize| {
        line.get(at)
            .is_some_and(|character| character.is_whitespace())
    };
    let mut colon: Option<usize> = None;
    for index in (1..line.len()).rev() {
        match line.get(index) {
            Some(':') => colon = Some(index),
            Some('?') if space(index - 1) && (index + 1 >= line.len() || space(index + 1)) => {
                if let Some(colon) = colon {
                    if colon > index + 3
                        && space(colon - 1)
                        && (colon + 1 >= line.len() || space(colon + 1))
                    {
                        return true;
                    }
                }
            }
            _ => {}
        }
    }
    false
}

/// Whether one source line decides: a condition, a branch, a throw or a literal default.
pub(crate) fn decides_line(line: &str) -> bool {
    let line = line.trim_end_matches(['\n', '\r']);
    let head: String = line.chars().take(DECIDE_CHARS).collect();
    if COMMENT.is_match(&head) {
        return false;
    }
    let characters: Vec<char> = head.chars().collect();
    CONDITION.is_match(&head) || has_ternary(&characters) || DEFAULT_VALUE.is_match(&head)
}

pub(crate) fn cited_lines_decide(
    source: Option<&dyn SourceFiles>,
    texts: &mut CitedText,
    cite: &Cite,
) -> bool {
    let Some(source) = source else {
        return true;
    };
    texts.with_text(source, &cite.path, |text| {
        text.is_some_and(|text| {
            text.split('\n')
                .skip(cite.start_line - 1)
                .take(cite.end_line - cite.start_line + 1)
                .any(|line| decides_line(line.trim_end_matches('\r')))
        })
    })
}

/// One finding for each capability that states a rule and cites no lines that hold its condition.
pub fn rule_cite_findings(
    documents: &[LoadedDocument],
    source: Option<&dyn SourceFiles>,
) -> Vec<(String, Issue)> {
    let mut findings = Vec::new();
    let mut texts = CitedText::default();
    for document in documents {
        if kind_of(document) != "capability" {
            continue;
        }
        let Ok(body) = document.body() else {
            continue;
        };
        let states = pre_section_paragraphs(&body)
            .into_iter()
            .skip(1)
            .any(|paragraph| states_rule(&paragraph));
        if !states {
            continue;
        }
        let cites = line_cites(&body, source);
        if cites.iter().any(|cite| cited_lines_decide(source, &mut texts, cite)) {
            continue;
        }
        let slug = document.slug();
        let path = node_path(document);
        let symbol = path.as_deref().and_then(|path| cited_symbol(&body, path));
        let read = path.as_deref().map_or_else(String::new, |path| match symbol.as_deref() {
            Some(symbol) => format!("; read `{path}` symbol `{symbol}`"),
            None => format!("; read `{path}`"),
        });
        let held = if cites.is_empty() {
            ""
        } else {
            " (its cites name lines that hold no condition)"
        };
        findings.push((
            slug.to_string(),
            Issue::warning(
                "rule-without-read-lines",
                format!("{slug} states a rule but cites no lines that hold its condition{held}{read}"),
            ),
        ));
    }
    findings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_paragraph_states_a_rule_by_its_prose_and_not_by_a_code_span() {
        assert!(states_rule("It refuses an order when the cart is empty."));
        assert!(!states_rule(
            "It lists the `default` values and `must_pay` codes."
        ));
    }

    #[test]
    fn a_line_decides_by_a_branch_a_ternary_or_a_literal_default_and_a_comment_never_does() {
        assert!(decides_line("  if (cart.empty) throw new Error('x');"));
        assert!(decides_line("const label = ok ? a : b;"));
        assert!(decides_line("  retries: 3,"));
        assert!(!decides_line("// if this were a branch"));
        assert!(!decides_line("const total = a + b;"));
    }
}
