//! The filter language of `query_concepts`: which nodes have or lack something, without a graph
//! query language. Paths, counts and aggregates have their own tools.
//!
//! ```text
//! filter    := or
//! or        := and ( 'OR' and )*
//! and       := atom ( 'AND' atom )*
//! atom      := 'NOT'? primary
//! primary   := '(' filter ')' | key '=' value | key '!=' value | 'has' '(' key ')'
//! ```
//!
//! Keywords are case-insensitive and `NOT` binds tighter than `AND`, which binds tighter than `OR`.
//! Equality keys are `kind`, `domain`, `slug`, `title` and `created_by`; `has(key)` takes any
//! relation key. Example: `(kind=domain OR kind=capability) AND has(elements)`.

use std::fmt::Write as _;

use answer_format::whitespace::{is_whitespace, trim};

use crate::frontmatter::Value;
use crate::loaded_vault::LoadedDocument;
use crate::relations::GRAPH_ARRAY_KEYS;

/// The kinds a filter may name, and the ones a list may be narrowed to.
pub const NODE_KINDS: [&str; 6] = [
    "project",
    "domain",
    "capability",
    "element",
    "document",
    "vault-readme",
];

const EQUALITY_KEYS: [&str; 5] = ["kind", "domain", "slug", "title", "created_by"];

/// Why a filter was refused. The two kinds are told apart so an agent that named a value the filter
/// does not allow is given what is allowed, and one that wrote something unreadable is not.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FilterError {
    /// A key or kind outside what the filter allows.
    NotAllowed {
        what: &'static str,
        received: String,
        allowed: &'static [&'static str],
    },
    /// Anything else the reader could not read.
    Unreadable(String),
}

impl FilterError {
    fn unreadable(message: impl Into<String>) -> Self {
        Self::Unreadable(message.into())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Open,
    Close,
    Comma,
    Equals,
    NotEquals,
    Quoted(String),
    Word(String),
    And,
    Or,
    Not,
    Has,
}

impl Token {
    /// The token's value as the message of an unexpected one names it.
    fn text(&self) -> &str {
        match self {
            Self::Open => "(",
            Self::Close => ")",
            Self::Comma => ",",
            Self::Equals => "=",
            Self::NotEquals => "!=",
            Self::Quoted(text) | Self::Word(text) => text,
            Self::And => "AND",
            Self::Or => "OR",
            Self::Not => "NOT",
            Self::Has => "has",
        }
    }
}

fn is_word_character(character: char) -> bool {
    character.is_ascii_alphanumeric()
        || matches!(character, '_' | '/' | '.' | '-')
        || ('\u{ac00}'..='\u{d7a3}').contains(&character)
}

fn tokenize(input: &str) -> Result<Vec<Token>, FilterError> {
    let characters: Vec<char> = input.chars().collect();
    // Positions are counted in UTF-16 units, as the messages always have.
    let mut units_before: Vec<usize> = Vec::with_capacity(characters.len() + 1);
    let mut total = 0;
    for character in &characters {
        units_before.push(total);
        total += character.len_utf16();
    }
    units_before.push(total);
    let position = |index: usize| units_before.get(index).copied().unwrap_or(total);
    let mut tokens = Vec::new();
    let mut index = 0;
    while let Some(&character) = characters.get(index) {
        match character {
            _ if is_whitespace(character) => index += 1,
            '(' => {
                tokens.push(Token::Open);
                index += 1;
            }
            ')' => {
                tokens.push(Token::Close);
                index += 1;
            }
            ',' => {
                tokens.push(Token::Comma);
                index += 1;
            }
            '=' => {
                tokens.push(Token::Equals);
                index += 1;
            }
            '!' if characters.get(index + 1) == Some(&'=') => {
                tokens.push(Token::NotEquals);
                index += 2;
            }
            '"' | '\'' => {
                let quote = character;
                let mut end = index + 1;
                let mut text = String::new();
                while let Some(&next) = characters.get(end) {
                    if next == quote {
                        break;
                    }
                    if next == '\\' {
                        if let Some(&escaped) = characters.get(end + 1) {
                            text.push(escaped);
                            end += 2;
                            continue;
                        }
                    }
                    text.push(next);
                    end += 1;
                }
                if end >= characters.len() {
                    return Err(FilterError::unreadable(format!(
                        "unterminated string at position {}",
                        position(index)
                    )));
                }
                tokens.push(Token::Quoted(text));
                index = end + 1;
            }
            _ => {
                let end = characters
                    .iter()
                    .enumerate()
                    .skip(index)
                    .find(|(_, candidate)| !is_word_character(**candidate))
                    .map_or(characters.len(), |(at, _)| at);
                if end == index {
                    return Err(FilterError::unreadable(format!(
                        "unexpected character {} at position {}",
                        answer_format::json::quote(&character.to_string()),
                        position(index)
                    )));
                }
                let word: String = characters
                    .get(index..end)
                    .unwrap_or_default()
                    .iter()
                    .collect();
                tokens.push(match word.to_uppercase().as_str() {
                    "AND" => Token::And,
                    "OR" => Token::Or,
                    "NOT" => Token::Not,
                    "HAS" => Token::Has,
                    _ => Token::Word(word),
                });
                index = end;
            }
        }
    }
    Ok(tokens)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Node {
    Or(Box<Node>, Box<Node>),
    And(Box<Node>, Box<Node>),
    Not(Box<Node>),
    Compare {
        key: String,
        equals: bool,
        value: String,
    },
    Has(String),
}

/// A filter read, ready to be tried against documents.
#[derive(Debug, Clone)]
pub struct QueryFilter {
    root: Node,
}

fn is_key(text: &str) -> bool {
    let mut characters = text.chars();
    characters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
}

struct Reader {
    tokens: Vec<Token>,
}

impl Reader {
    fn at(&self, position: usize) -> Option<&Token> {
        self.tokens.get(position)
    }

    fn or(&self, position: usize) -> Result<(Node, usize), FilterError> {
        let (mut left, mut next) = self.and(position)?;
        while self.at(next) == Some(&Token::Or) {
            let (right, after) = self.and(next + 1)?;
            left = Node::Or(Box::new(left), Box::new(right));
            next = after;
        }
        Ok((left, next))
    }

    fn and(&self, position: usize) -> Result<(Node, usize), FilterError> {
        let (mut left, mut next) = self.atom(position)?;
        while self.at(next) == Some(&Token::And) {
            let (right, after) = self.atom(next + 1)?;
            left = Node::And(Box::new(left), Box::new(right));
            next = after;
        }
        Ok((left, next))
    }

    fn atom(&self, position: usize) -> Result<(Node, usize), FilterError> {
        match self.at(position) {
            None => Err(FilterError::unreadable("unexpected end of filter")),
            Some(Token::Not) => {
                let (node, next) = self.atom(position + 1)?;
                Ok((Node::Not(Box::new(node)), next))
            }
            Some(_) => self.primary(position),
        }
    }

    fn primary(&self, position: usize) -> Result<(Node, usize), FilterError> {
        let Some(token) = self.at(position) else {
            return Err(FilterError::unreadable("unexpected end of filter"));
        };
        match token {
            Token::Open => {
                let (node, next) = self.or(position + 1)?;
                if self.at(next) != Some(&Token::Close) {
                    return Err(FilterError::unreadable("expected `)` to close group"));
                }
                Ok((node, next + 1))
            }
            Token::Has => self.has(position),
            Token::Word(key) => self.comparison(key, position),
            other => Err(FilterError::unreadable(format!(
                "unexpected token: {}",
                other.text()
            ))),
        }
    }

    fn has(&self, position: usize) -> Result<(Node, usize), FilterError> {
        if self.at(position + 1) != Some(&Token::Open) {
            return Err(FilterError::unreadable("expected `(` after has"));
        }
        let Some(Token::Word(key)) = self.at(position + 2) else {
            return Err(FilterError::unreadable("expected key inside has(...)"));
        };
        if self.at(position + 3) != Some(&Token::Close) {
            return Err(FilterError::unreadable("expected `)` to close has(...)"));
        }
        if !is_key(key) {
            return Err(FilterError::unreadable(format!("invalid key: {key}")));
        }
        let canonical = if key == "depends_on" {
            "dependencies"
        } else {
            key.as_str()
        };
        if !GRAPH_ARRAY_KEYS.contains(&key.as_str()) && !GRAPH_ARRAY_KEYS.contains(&canonical) {
            return Err(FilterError::NotAllowed {
                what: "has key",
                received: key.clone(),
                allowed: &GRAPH_ARRAY_KEYS,
            });
        }
        Ok((Node::Has(canonical.to_string()), position + 4))
    }

    fn comparison(&self, key: &str, position: usize) -> Result<(Node, usize), FilterError> {
        if !is_key(key) {
            return Err(FilterError::unreadable(format!("invalid key: {key}")));
        }
        if !EQUALITY_KEYS.contains(&key) {
            return Err(FilterError::NotAllowed {
                what: "key",
                received: key.to_string(),
                allowed: &EQUALITY_KEYS,
            });
        }
        let equals = match self.at(position + 1) {
            Some(Token::Equals) => true,
            Some(Token::NotEquals) => false,
            _ => {
                return Err(FilterError::unreadable(format!(
                    "expected = or != after key {key}"
                )))
            }
        };
        let operator = if equals { "=" } else { "!=" };
        let Some(Token::Word(value) | Token::Quoted(value)) = self.at(position + 2) else {
            return Err(FilterError::unreadable(format!(
                "expected value after {key} {operator}"
            )));
        };
        if key == "kind" && !NODE_KINDS.contains(&value.to_lowercase().as_str()) {
            return Err(FilterError::NotAllowed {
                what: "kind",
                received: value.clone(),
                allowed: &NODE_KINDS,
            });
        }
        Ok((
            Node::Compare {
                key: key.to_string(),
                equals,
                value: value.clone(),
            },
            position + 3,
        ))
    }
}

impl QueryFilter {
    pub fn parse(input: &str) -> Result<Self, FilterError> {
        let trimmed = trim(input);
        if trimmed.is_empty() {
            return Err(FilterError::unreadable("filter is empty"));
        }
        let reader = Reader {
            tokens: tokenize(trimmed)?,
        };
        let (root, next) = reader.or(0)?;
        if let Some(token) = reader.at(next) {
            return Err(FilterError::unreadable(format!(
                "unexpected token at position {next}: {}",
                token.text()
            )));
        }
        Ok(Self { root })
    }

    pub fn matches(&self, document: &LoadedDocument) -> bool {
        evaluate(&self.root, document)
    }

    /// The filter as it was read, fully bracketed.
    pub fn represented(&self) -> String {
        let mut text = String::new();
        write_node(&self.root, &mut text);
        text
    }
}

fn write_node(node: &Node, text: &mut String) {
    match node {
        Node::Or(left, right) => write_logical(left, "OR", right, text),
        Node::And(left, right) => write_logical(left, "AND", right, text),
        Node::Not(child) => {
            text.push_str("NOT ");
            write_node(child, text);
        }
        Node::Compare { key, equals, value } => {
            let _ = write!(text, "{key} {} {value}", if *equals { "=" } else { "!=" });
        }
        Node::Has(key) => {
            let _ = write!(text, "has({key})");
        }
    }
}

fn write_logical(left: &Node, operator: &str, right: &Node, text: &mut String) {
    text.push('(');
    write_node(left, text);
    let _ = write!(text, " {operator} ");
    write_node(right, text);
    text.push(')');
}

fn evaluate(node: &Node, document: &LoadedDocument) -> bool {
    match node {
        Node::And(left, right) => evaluate(left, document) && evaluate(right, document),
        Node::Or(left, right) => evaluate(left, document) || evaluate(right, document),
        Node::Not(child) => !evaluate(child, document),
        Node::Compare { key, equals, value } => {
            let actual = match key.as_str() {
                "slug" => document.slug().to_string(),
                _ => document
                    .frontmatter()
                    .get(key)
                    .map(Value::display_text)
                    .unwrap_or_default(),
            };
            let same = actual.to_lowercase() == value.to_lowercase();
            same == *equals
        }
        Node::Has(key) => {
            let frontmatter = document.frontmatter();
            let field = if key == "dependencies" {
                frontmatter
                    .get("dependencies")
                    .or_else(|| frontmatter.get("depends_on"))
            } else {
                frontmatter.get(key)
            };
            match field {
                Some(Value::List(items)) => !items.is_empty(),
                Some(Value::Text(text)) => !trim(text).is_empty(),
                Some(_) => true,
                None => false,
            }
        }
    }
}
