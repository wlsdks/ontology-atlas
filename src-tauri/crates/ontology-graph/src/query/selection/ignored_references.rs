//! `.ontology-atlasignore`: the references a vault says are intentional code, one pattern a line,
//! so `growth_plan` does not propose to turn them into nodes. The patterns are the vault's own
//! words; reading the file belongs to the tool layer, which hands the lines over.
//!
//! A pattern is a glob over a reference: `*` is any run without `/`, `**` crosses folders, `?` is
//! one character that is not `/`; `src/**/x` matches `src/x` and `src/a/b/x`, a leading `**/`
//! may match nothing, and a trailing `/**` means everything under the folder. A line that starts
//! with `!` is a negation, which is not supported and is skipped, as is a `#` comment.

use std::collections::HashSet;

use answer_format::whitespace::trim;

/// The patterns a file's text holds: one per non-blank line, without a comment, a negation or a
/// trailing `/`.
pub fn parse_patterns(text: &str) -> Vec<String> {
    text.split('\n')
        .map(|line| trim(line.strip_suffix('\r').unwrap_or(line)))
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with('!'))
        .map(|line| line.strip_suffix('/').unwrap_or(line).to_string())
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Piece {
    Literal(char),
    /// `?`: one character that is not `/`.
    OneCharacter,
    /// `*`: any run of characters that are not `/`.
    Run,
    /// `**`: any run of characters on one line, `/` included.
    AnyRun,
    /// `/**/` and a leading `**/`: nothing, or folders each ending in `/`.
    Folders,
}

const MIDDLE: char = '\u{E000}';
const START: char = '\u{E001}';
const END: char = '\u{E002}';

fn pieces_of(pattern: &str) -> Vec<Piece> {
    let mut text = pattern.replace("/**/", &format!("/{MIDDLE}"));
    if let Some(rest) = text.strip_prefix("**/") {
        text = format!("{START}{rest}");
    }
    if let Some(rest) = text.strip_suffix("/**") {
        text = format!("{rest}{END}");
    }
    let characters: Vec<char> = text.chars().collect();
    let mut pieces = Vec::with_capacity(characters.len());
    let mut at = 0;
    while let Some(character) = characters.get(at).copied() {
        at += 1;
        match character {
            MIDDLE | START => pieces.push(Piece::Folders),
            END => {
                pieces.push(Piece::Literal('/'));
                pieces.push(Piece::AnyRun);
            }
            '*' if characters.get(at) == Some(&'*') => {
                at += 1;
                pieces.push(Piece::AnyRun);
            }
            '*' => pieces.push(Piece::Run),
            '?' => pieces.push(Piece::OneCharacter),
            other => pieces.push(Piece::Literal(other)),
        }
    }
    pieces
}

/// The characters `.` leaves out in a regular expression without the `s` flag.
fn is_line_break(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// Whether `reference` is the whole of what `pieces` describe. Each pair of piece and position is
/// tried once, so no pattern can make the search take longer than pieces times characters.
fn matches_pieces(pieces: &[Piece], reference: &[char]) -> bool {
    let mut stack = vec![(0_usize, 0_usize)];
    let mut tried: HashSet<(usize, usize)> = HashSet::new();
    while let Some((piece, position)) = stack.pop() {
        if !tried.insert((piece, position)) {
            continue;
        }
        let here = reference.get(position).copied();
        match pieces.get(piece) {
            None => {
                if position == reference.len() {
                    return true;
                }
            }
            Some(Piece::Literal(wanted)) => {
                if here == Some(*wanted) {
                    stack.push((piece + 1, position + 1));
                }
            }
            Some(Piece::OneCharacter) => {
                if here.is_some_and(|character| character != '/') {
                    stack.push((piece + 1, position + 1));
                }
            }
            Some(Piece::Run) => {
                stack.push((piece + 1, position));
                if here.is_some_and(|character| character != '/') {
                    stack.push((piece, position + 1));
                }
            }
            Some(Piece::AnyRun) => {
                stack.push((piece + 1, position));
                if here.is_some_and(|character| !is_line_break(character)) {
                    stack.push((piece, position + 1));
                }
            }
            Some(Piece::Folders) => {
                stack.push((piece + 1, position));
                let mut scan = position;
                while let Some(character) = reference.get(scan).copied() {
                    if character == '/' {
                        stack.push((piece + 1, scan + 1));
                    } else if is_line_break(character) {
                        break;
                    }
                    scan += 1;
                }
            }
        }
    }
    false
}

/// Whether any pattern covers `reference`.
pub fn is_ignored(patterns: &[String], reference: &str) -> bool {
    if patterns.is_empty() {
        return false;
    }
    let characters: Vec<char> = reference.chars().collect();
    patterns
        .iter()
        .any(|pattern| matches_pieces(&pieces_of(pattern), &characters))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn covers(pattern: &str, reference: &str) -> bool {
        is_ignored(&[pattern.to_string()], reference)
    }

    #[test]
    fn a_file_keeps_its_patterns_and_drops_comments_negations_and_a_trailing_slash() {
        let file = "# generated\r\n\r\n  src/gen/  \n!keep.ts\nvendor/**\n";
        assert_eq!(parse_patterns(file), vec!["src/gen", "vendor/**"]);
    }

    #[test]
    fn each_glob_form_matches_the_references_it_is_documented_to() {
        assert!(covers("src/*.ts", "src/a.ts"));
        assert!(!covers("src/*.ts", "src/deep/a.ts"));
        assert!(covers("src/**/x.ts", "src/x.ts"));
        assert!(covers("src/**/x.ts", "src/a/b/x.ts"));
        assert!(covers("**/x.ts", "x.ts"));
        assert!(covers("**/x.ts", "a/b/x.ts"));
        assert!(covers("vendor/**", "vendor/a/b"));
        assert!(!covers("vendor/**", "vendor"));
        assert!(covers("a?c", "abc"));
        assert!(!covers("a?c", "a/c"));
        assert!(covers("a.b", "a.b"));
        assert!(!covers("a.b", "axb"));
    }

    #[test]
    fn a_double_star_inside_a_name_crosses_folders_as_the_file_format_says() {
        assert!(covers("a**b", "a/x/b"));
    }

    #[test]
    fn a_pattern_made_of_stars_ends_in_time_on_a_long_reference() {
        let reference = "a/".repeat(2_000);
        assert!(!covers("**/**/**/**/**/z", &reference));
    }
}
