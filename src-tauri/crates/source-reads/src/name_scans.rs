//! Questions asked of one line about a name taken from the repository, answered by looking for the
//! name as text. A pattern built from a repository's name would compile once per name, and a name
//! such as `a|b` or `(?:` is no business of a pattern engine; the script server's patterns are
//! what these scans keep the meaning of, ECMAScript's `\w` (ASCII letters, digits, `_`) and `\s`.

use repository_survey::is_js_space;

/// ECMAScript's `\w` plus `$`, the characters an identifier is made of.
fn is_identifier_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '$'
}

/// ECMAScript's `\w`.
fn is_word_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// Whether `line` calls `name`: the name, not the tail of a longer identifier, followed by white
/// space that may be empty and `(`. `/(?:^|[^\w$])NAME\s*\(/` for a name that is not a pattern.
pub fn calls_name(line: &str, name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    line.match_indices(name).any(|(at, _)| {
        let before = line.get(..at).and_then(|head| head.chars().next_back());
        let after = line.get(at + name.len()..).unwrap_or("");
        !before.is_some_and(is_identifier_character)
            && after.trim_start_matches(is_js_space).starts_with('(')
    })
}

/// Whether `signature` ends a parameter list and then names `owner` as what it returns: `)`, white
/// space, an optional `(`, an optional `*`, then the name on a word boundary. `/\)\s*\(?\*?NAME\b/`
/// for a name that is not a pattern: Go's `func New() *Server`, `func New() (*Server, error)`.
pub fn returns_named(signature: &str, owner: &str) -> bool {
    let Some(last) = owner.chars().next_back() else {
        return false;
    };
    signature.match_indices(')').any(|(at, _)| {
        let rest = signature.get(at + 1..).unwrap_or("");
        let rest = rest.trim_start_matches(is_js_space);
        let rest = rest.strip_prefix('(').unwrap_or(rest);
        let rest = rest.strip_prefix('*').unwrap_or(rest);
        rest.strip_prefix(owner).is_some_and(|after| {
            let next = after.chars().next();
            is_word_character(last) != next.is_some_and(is_word_character)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_call_is_the_name_whole_followed_by_an_opening_parenthesis() {
        for line in [
            "  place(1)",
            "x = place (2)",
            "a.place(3)",
            "(place\t(4))",
            "place(",
        ] {
            assert!(calls_name(line, "place"), "{line}");
        }
        for line in [
            "replace(1)",
            "place_all(1)",
            "$place(1)",
            "place",
            "place + (1)",
            "9place(",
        ] {
            assert!(!calls_name(line, "place"), "{line}");
        }
        // A name is text, not a pattern: nothing in it means anything to the scan.
        assert!(calls_name("go a|b(1)", "a|b"));
        assert!(!calls_name("go ab(1)", "a|b"));
        assert!(calls_name("x = (?:(1)", "(?:"));
        assert!(calls_name("call C++(1)", "C++"));
        assert!(!calls_name("anything(1)", ""));
    }

    #[test]
    fn a_function_that_returns_its_owner_is_a_constructor_of_it() {
        for signature in [
            "func New() *Server {",
            "func New(a int) (*Server, error) {",
            "func New()Server{",
        ] {
            assert!(returns_named(signature, "Server"), "{signature}");
        }
        for signature in [
            "func New() *ServerPool {",
            "func Server() int {",
            "func New() MyServer {",
        ] {
            assert!(!returns_named(signature, "Server"), "{signature}");
        }
    }
}
