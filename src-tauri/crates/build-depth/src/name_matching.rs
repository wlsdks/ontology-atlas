//! Whether a node's words name an ability the survey found: a title that says it, a code span that
//! holds its name, a cite of its line. Every match is a scan of the text for the name; a name from
//! a vault or a repository never becomes part of a pattern.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use repository_survey::{AbilityKind, AbilityRow};

use crate::line_cites::pattern;

/// Entry symbols too generic to place anything by name.
const GENERIC_SYMBOLS: [&str; 14] = [
    "main", "__main__", "run", "default", "index", "app", "cli", "server", "next", "version",
    "release", "label", "message", "comment",
];
const ENTRY_STEMS: [&str; 5] = ["index", "__init__", "main", "mod", "lib"];
const LAYOUT_FOLDERS: [&str; 5] = ["src", "lib", "bin", "source", "dist"];
/// Words a reason must keep once the abilities it names are taken out.
const REASON_WORDS: usize = 3;

static CODE_SPAN: LazyLock<Regex> = LazyLock::new(|| pattern(r"`([^`\n]{1,200})`"));
static NOT_CODE_TOKEN: LazyLock<Regex> = LazyLock::new(|| pattern(r"[^A-Za-z0-9_.$:/-]+"));
static CAMEL_BOUNDARY: LazyLock<Regex> = LazyLock::new(|| pattern(r"([a-z0-9])([A-Z])"));
static SPOKEN_BREAK: LazyLock<Regex> = LazyLock::new(|| pattern(r"[-_/]+"));
static SCOPE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^@[A-Za-z0-9_-]+/"));
static CODE_SPAN_ANY: LazyLock<Regex> = LazyLock::new(|| pattern(r"`[^`]*`"));
static PATH_LIKE: LazyLock<Regex> = LazyLock::new(|| pattern(r"\S+/\S+"));

pub(crate) fn is_generic(word: &str) -> bool {
    GENERIC_SYMBOLS.contains(&word.to_lowercase().as_str())
}

fn is_word_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// Whether `word` stands in `text` between characters that are not part of a longer name: before
/// it none of `blocked_before`, after it none of `blocked_after`, or the edge of the text.
fn stands_alone(
    text: &str,
    word: &str,
    fold: bool,
    blocked_before: impl Fn(char) -> bool,
    blocked_after: impl Fn(char) -> bool,
) -> bool {
    if word.is_empty() {
        return false;
    }
    let (text, word) = if fold {
        (text.to_lowercase(), word.to_lowercase())
    } else {
        (text.to_string(), word.to_string())
    };
    text.match_indices(&word).any(|(at, _)| {
        let before = text.get(..at).and_then(|head| head.chars().next_back());
        let after = text.get(at + word.len()..).and_then(|tail| tail.chars().next());
        !before.is_some_and(&blocked_before) && !after.is_some_and(&blocked_after)
    })
}

fn blocks_before(character: char) -> bool {
    is_word_character(character) || matches!(character, '/' | '.' | '-')
}

fn blocks_after(character: char) -> bool {
    is_word_character(character) || character == '-'
}

/// Whether `text` says `word`, not as part of a longer name, in any letter case. A word under
/// three characters names nothing.
pub(crate) fn names_word(text: &str, word: &str) -> bool {
    word.chars().count() >= 3 && stands_alone(text, word, true, blocks_before, blocks_after)
}

/// Whether `line` holds the row's exact name, case and all, as a whole word. A common word
/// points at a row only in code form or by its cite.
pub(crate) fn exactly_named(line: &str, row: &AbilityRow) -> bool {
    row.name.chars().count() >= 2
        && !is_generic(&row.name)
        && stands_alone(line, &row.name, false, blocks_before, blocks_after)
}

fn last_segment(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rfind('.')
        .filter(|at| *at > 0)
        .map_or(name, |at| name.get(..at).unwrap_or(name))
}

/// The package folder an entry file opens, or `None` when the file is not a package entry.
pub(crate) fn package_folder(path: &str) -> Option<&str> {
    let parts: Vec<&str> = path.split('/').collect();
    let (name, folders) = parts.split_last()?;
    if !ENTRY_STEMS.contains(&last_segment(name)) {
        return None;
    }
    folders
        .iter()
        .rev()
        .find(|part| !LAYOUT_FOLDERS.contains(part))
        .copied()
}

/// A name in the vault's words: `create-labels` and `createLabels` are both "create labels".
pub(crate) fn spoken_forms(name: &str) -> Vec<String> {
    let plain = SCOPE.replace(name, "").into_owned();
    let spaced = CAMEL_BOUNDARY.replace_all(&plain, "$1 $2");
    let words = SPOKEN_BREAK.replace_all(&spaced, " ").trim().to_string();
    let mut forms: Vec<String> = Vec::new();
    for form in [plain, words] {
        if form.chars().count() >= 3 && !forms.contains(&form) {
            forms.push(form);
        }
    }
    forms
}

/// The tokens of every inline code span: "`cli.List` and `--force`" holds cli, List, cli.List and
/// --force.
pub(crate) fn code_tokens(text: &str) -> HashSet<String> {
    let mut tokens = HashSet::new();
    for span in CODE_SPAN.captures_iter(text) {
        let Some(code) = span.get(1).map(|found| found.as_str().trim()) else {
            continue;
        };
        tokens.insert(code.to_string());
        for part in NOT_CODE_TOKEN.split(code).filter(|part| !part.is_empty()) {
            tokens.insert(part.to_string());
            for piece in part
                .split(['.', ':', '/'])
                .filter(|piece| !piece.is_empty())
            {
                tokens.insert(piece.to_string());
            }
        }
    }
    tokens
}

/// Whether `text` holds `evidence` followed by anything but a digit: `path:L12` is not `path:L1`.
pub(crate) fn cites_evidence(text: &str, evidence: &str) -> bool {
    !evidence.is_empty()
        && text.match_indices(evidence).any(|(at, _)| {
            !text
                .get(at + evidence.len()..)
                .and_then(|tail| tail.chars().next())
                .is_some_and(|next| next.is_ascii_digit())
        })
}

/// A one-word flag (`--force`) names an ability only in code form, or as "the force flag";
/// "--dry-run" also answers to "dry run".
pub(crate) fn flag_named(text: &str, name: &str) -> bool {
    let bare = name.trim_start_matches('-');
    let dashed = format!("--{bare}");
    let dashed_alone = stands_alone(
        text,
        &dashed,
        true,
        |character| is_word_character(character) || character == '-',
        blocks_after,
    );
    let in_code = text.to_lowercase().contains(&format!("`{}`", bare.to_lowercase()));
    let with_noun = ["flag", "option", "switch"].iter().any(|noun| {
        let lowered = text.to_lowercase();
        let bare = bare.to_lowercase();
        lowered.match_indices(&bare).any(|(at, _)| {
            let before_ok = !lowered
                .get(..at)
                .and_then(|head| head.chars().next_back())
                .is_some_and(is_word_character);
            let rest = lowered.get(at + bare.len()..).unwrap_or("");
            let spaced = rest.trim_start();
            before_ok
                && spaced.len() < rest.len()
                && spaced.strip_prefix(noun).is_some_and(|after| {
                    !after.chars().next().is_some_and(is_word_character)
                })
        })
    });
    if dashed_alone || in_code || with_noun {
        return true;
    }
    let words: Vec<&str> = bare
        .split(['-', '_', '.'])
        .filter(|word| !word.is_empty())
        .collect();
    words.len() >= 2 && names_word(text, &words.join(" "))
}

/// Whether the row is named in code form by `text`: a flag by its words, else a code span holding
/// the row's exact name, its symbol or its folder, or the row's cite of its line.
pub(crate) fn named_in_code(text: &str, row: &AbilityRow, tokens: &HashSet<String>) -> bool {
    if row.kind == AbilityKind::Flag {
        return flag_named(text, &row.name);
    }
    if cites_evidence(text, &row.evidence) {
        return true;
    }
    let folder = if row.kind == AbilityKind::Family {
        Some(last_segment(&row.path))
    } else {
        package_folder(&row.path)
    };
    [Some(row.name.as_str()), row.symbol.as_deref(), folder]
        .into_iter()
        .flatten()
        .filter(|name| !name.is_empty())
        .any(|name| tokens.contains(name))
}

/// Whether an exclusion line gives a reason: once every ability name, code span and path it holds
/// is taken out, at least three words remain. "Not modeled: log, ssl, ping." lists names; "log
/// and ssl only tune the transport" says why.
pub(crate) fn gives_reason(line: &str, rows: &[&AbilityRow]) -> bool {
    let without_code = CODE_SPAN_ANY.replace_all(line, " ");
    let mut rest = PATH_LIKE.replace_all(&without_code, " ").into_owned();
    for row in rows {
        for name in [Some(row.name.as_str()), row.symbol.as_deref()]
            .into_iter()
            .flatten()
            .flat_map(spoken_forms)
        {
            rest = without_whole_word(&rest, &name);
        }
    }
    rest.split(|character: char| !(character.is_alphanumeric() || character == '\''))
        .filter(|word| word.chars().count() >= 2)
        .count()
        >= REASON_WORDS
}

/// `text` with every whole-word occurrence of `word`, in any letter case, replaced by a space.
fn without_whole_word(text: &str, word: &str) -> String {
    let lowered = text.to_lowercase();
    let needle = word.to_lowercase();
    if needle.is_empty() || lowered.len() != text.len() {
        return text.to_string();
    }
    let mut output = String::new();
    let mut kept = 0;
    for (at, _) in lowered.match_indices(&needle) {
        if at < kept {
            continue;
        }
        let before = lowered.get(..at).and_then(|head| head.chars().next_back());
        let after = lowered
            .get(at + needle.len()..)
            .and_then(|tail| tail.chars().next());
        if before.is_some_and(blocks_before) || after.is_some_and(blocks_after) {
            continue;
        }
        output.push_str(text.get(kept..at).unwrap_or(""));
        output.push(' ');
        kept = at + needle.len();
    }
    output.push_str(text.get(kept..).unwrap_or(""));
    output
}

/// Whether a title says the row's name: a flag by its words, a one-word flag group by its name, a
/// common word only as "`next`" or "the next command", anything else in plain words.
pub(crate) fn title_names(title: &str, row: &AbilityRow) -> bool {
    match row.kind {
        AbilityKind::Flag => return flag_named(title, &row.name),
        AbilityKind::Flags => return !row.name.starts_with("--") && names_word(title, &row.name),
        _ => {}
    }
    let words: Vec<&str> = [
        Some(row.name.as_str()),
        row.symbol.as_deref(),
        package_folder(&row.path),
    ]
    .into_iter()
    .flatten()
    .filter(|word| !word.is_empty())
    .collect();
    if words
        .iter()
        .filter(|word| !is_generic(word))
        .flat_map(|word| spoken_forms(word))
        .any(|form| names_word(title, &form))
    {
        return true;
    }
    words.iter().any(|word| {
        is_generic(word) && {
            let lowered = title.to_lowercase();
            let word = word.to_lowercase();
            lowered.contains(&format!("`{word}`"))
                || lowered.match_indices(&word).any(|(at, _)| {
                    let before_ok = !lowered
                        .get(..at)
                        .and_then(|head| head.chars().next_back())
                        .is_some_and(is_word_character);
                    let rest = lowered.get(at + word.len()..).unwrap_or("");
                    let spaced = rest.trim_start();
                    before_ok
                        && spaced.len() < rest.len()
                        && spaced.strip_prefix("command").is_some_and(|after| {
                            !after.chars().next().is_some_and(is_word_character)
                        })
                })
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(kind: AbilityKind, name: &str, path: &str) -> AbilityRow {
        AbilityRow::at(kind, name, path, 1)
    }

    #[test]
    fn a_name_is_found_as_a_whole_word_and_a_word_in_a_longer_name_places_nothing() {
        assert!(names_word("Users list invoices", "list"));
        assert!(!names_word("the listing view", "list"));
        assert!(!names_word("src/list.ts", "list"));
        assert!(!names_word("a-list-b", "list"));
        assert!(!names_word("go", "go"));
    }

    #[test]
    fn a_common_word_names_an_ability_only_in_code_form_or_as_a_command() {
        let next = row(AbilityKind::Subcommand, "next", "cli/main.py");
        assert!(!title_names("What comes next", &next));
        assert!(title_names("The `next` step", &next));
        assert!(title_names("The next command", &next));
        let create = row(AbilityKind::Operation, "create-labels", "a/b.ts");
        assert!(title_names("Create labels in bulk", &create));
    }

    #[test]
    fn an_exclusion_line_gives_a_reason_only_when_words_remain_after_the_names() {
        let log = row(AbilityKind::Setting, "log", "a.ts");
        let ssl = row(AbilityKind::Setting, "ssl", "a.ts");
        let rows = [&log, &ssl];
        assert!(!gives_reason("Not modeled: log, ssl.", &rows));
        assert!(gives_reason("log and ssl only tune the transport", &rows));
    }

    #[test]
    fn a_cite_of_one_line_does_not_name_the_next_ten() {
        assert!(cites_evidence("see a.ts:L1 here", "a.ts:L1"));
        assert!(!cites_evidence("see a.ts:L12", "a.ts:L1"));
    }
}
