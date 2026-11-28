//! A refusal the script server threw as a plain sentence, with the `errorCode` that server gave it:
//! it read the code off the words (a sentence that says a name does not exist is `not_found`, one
//! that says something must be a shape is `invalid_arguments`, the rest `tool_error`). Agents branch
//! on the code, so the three tools that were ported with their sentences keep the code their
//! sentences earned.

use crate::error::{ErrorCode, ToolError};

const NOT_FOUND: [&str; 3] = [
    "not found",
    "does not exist",
    "does not resolve to a compiled ontology node",
];
const CONFLICT: [&str; 3] = ["already exists", "conflict", "identical"];
const INVALID: [&str; 9] = [
    "must be",
    "must not",
    "cannot be",
    "requires exactly one of",
    "at least one",
    "invalid value",
    "received:",
    "points outside",
    "too many",
];

fn code_of(message: &str) -> ErrorCode {
    let lower = message.to_lowercase();
    let says = |words: &[&str]| words.iter().any(|word| lower.contains(word));
    if says(&NOT_FOUND) {
        ErrorCode::NotFound
    } else if says(&CONFLICT) {
        ErrorCode::Conflict
    } else if says(&INVALID) {
        ErrorCode::InvalidArguments
    } else {
        ErrorCode::ToolError
    }
}

/// `message` as a failure, coded by what it says.
pub fn plain_refusal(message: impl Into<String>) -> ToolError {
    let message = message.into();
    ToolError::new(code_of(&message), message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_sentence_is_coded_by_the_words_the_script_server_read_it_by() {
        assert_eq!(
            code_of("Project slug does not exist in vault: \"x\"."),
            ErrorCode::NotFound
        );
        assert_eq!(
            code_of("rootPath must be an absolute local path; received \"x\"."),
            ErrorCode::InvalidArguments
        );
        assert_eq!(
            code_of("connect_project_source blocked: the file is malformed."),
            ErrorCode::ToolError
        );
        assert_eq!(code_of("a conflict arose"), ErrorCode::Conflict);
    }
}
