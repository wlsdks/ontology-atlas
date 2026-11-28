//! Where a declaration ends and which declaration a symbol names, read from the outline and the
//! indentation of the lines: a declaration runs to the line before the next one at its own indent
//! or shallower, trailing blank lines left off.

use crate::file_outline::{OutlineDeclaration, OutlineKind};
use crate::source_lines::indent_at;

/// Which neighbours end a declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ends {
    /// Any listed declaration, a re-export or a heading too.
    AtAnyDeclaration,
    /// Only a declaration of code.
    AtCode,
}

/// The last line of `declaration`.
pub fn declaration_end(
    lines: &[String],
    declarations: &[OutlineDeclaration],
    declaration: &OutlineDeclaration,
    ends: Ends,
) -> usize {
    let indent = indent_at(lines, declaration.line);
    let next = declarations.iter().find(|candidate| {
        candidate.line > declaration.line
            && (ends == Ends::AtAnyDeclaration || candidate.kind.is_code())
            && indent_at(lines, candidate.line) <= indent
    });
    let mut end = next.map_or(lines.len(), |next| next.line - 1);
    while end > declaration.line
        && end
            .checked_sub(1)
            .and_then(|index| lines.get(index))
            .is_none_or(|line| line.trim().is_empty())
    {
        end -= 1;
    }
    end
}

/// Whether a declaration answers to `name`: exactly, or as `Receiver.name` (Go methods).
pub fn declares(declaration: &OutlineDeclaration, name: &str) -> bool {
    declaration.name == name
        || declaration
            .name
            .strip_suffix(name)
            .is_some_and(|before| before.ends_with('.'))
}

/// The declaration a symbol names. An exact name wins (Go outlines `Node.Subscribe`); `Owner.member`
/// otherwise finds the member inside its owner (Python, TypeScript); a bare name also finds a Go
/// method declared on any receiver. Among several (typing overloads before the implementation),
/// the one with the longest body.
pub fn find_declaration<'a>(
    lines: &[String],
    declarations: &'a [OutlineDeclaration],
    symbol: &str,
) -> Option<&'a OutlineDeclaration> {
    let code: Vec<&OutlineDeclaration> = declarations
        .iter()
        .filter(|declaration| declaration.kind.is_code())
        .collect();
    let extent = |declaration: &OutlineDeclaration| {
        declaration_end(lines, declarations, declaration, Ends::AtAnyDeclaration)
            .saturating_sub(declaration.line)
    };
    let longest = |candidates: Vec<&'a OutlineDeclaration>| {
        candidates.into_iter().fold(
            None,
            |best: Option<&OutlineDeclaration>, candidate| match best {
                Some(held) if extent(candidate) <= extent(held) => Some(held),
                _ => Some(candidate),
            },
        )
    };
    let exact: Vec<&OutlineDeclaration> = code
        .iter()
        .copied()
        .filter(|declaration| declaration.name == symbol)
        .collect();
    if !exact.is_empty() {
        return longest(exact);
    }
    if let Some((owner, member)) = symbol.split_once('.') {
        let owner_declaration = longest(
            code.iter()
                .copied()
                .filter(|declaration| declaration.name == owner)
                .collect(),
        )?;
        let owner_end = declaration_end(
            lines,
            declarations,
            owner_declaration,
            Ends::AtAnyDeclaration,
        );
        return longest(
            code.iter()
                .copied()
                .filter(|declaration| {
                    declaration.name == member
                        && declaration.line > owner_declaration.line
                        && declaration.line <= owner_end
                })
                .collect(),
        );
    }
    let methods: Vec<&OutlineDeclaration> = code
        .iter()
        .copied()
        .filter(|declaration| declares(declaration, symbol))
        .collect();
    match methods.as_slice() {
        [only] => Some(only),
        _ => None,
    }
}

/// The class a member is declared in by indentation (Python, TypeScript), or `None`.
pub fn enclosing_class<'a>(
    lines: &[String],
    declarations: &'a [OutlineDeclaration],
    declaration: &OutlineDeclaration,
) -> Option<&'a OutlineDeclaration> {
    let indent = indent_at(lines, declaration.line);
    if indent == 0 {
        return None;
    }
    let mut best: Option<&OutlineDeclaration> = None;
    for candidate in declarations {
        if candidate.line >= declaration.line
            || candidate.kind != OutlineKind::Class
            || indent_at(lines, candidate.line) >= indent
        {
            continue;
        }
        if declaration_end(lines, declarations, candidate, Ends::AtCode) < declaration.line {
            continue;
        }
        if best.is_none_or(|held| candidate.line > held.line) {
            best = Some(candidate);
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::file_outline::outline_file;
    use crate::source_lines::complete_lines;

    #[test]
    fn a_symbol_finds_its_longest_declaration_and_a_member_is_found_inside_its_owner() {
        let text = "class Cart:\n    def total(self):\n        return 1\n\n    def add(self):\n        pass\n\ndef total():\n    a = 1\n    return a\n";
        let lines = complete_lines(text);
        let outline = outline_file(text, "cart.py");
        let top = find_declaration(&lines, &outline.declarations, "total").expect("total");
        assert_eq!(top.line, 8);
        let member = find_declaration(&lines, &outline.declarations, "Cart.total").expect("member");
        assert_eq!(member.line, 2);
        assert_eq!(
            declaration_end(
                &lines,
                &outline.declarations,
                member,
                Ends::AtAnyDeclaration
            ),
            3,
            "the blank line after the body is not part of it"
        );
        assert!(find_declaration(&lines, &outline.declarations, "missing").is_none());
    }
}
