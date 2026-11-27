//! How many bytes a successful reply of an answer is, before it is written: the size an import
//! scan weighs against its delivery limit. A reply holds the answer's text twice, once escaped as
//! the `content` text and once as the `structuredContent`, so the size is a sum of lengths. The
//! escaped text is written into a counter, so no second copy of the answer is made to measure it.

use std::io::{self, Write};

/// A writer that keeps how many bytes it was given and nothing else.
struct ByteCount(usize);

impl Write for ByteCount {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0 += bytes.len();
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// The reply's opening up to the escaped text, between the text and the structure, and its end.
const BEFORE_TEXT: &str = r#"{"content":[{"type":"text","text":"#;
const BETWEEN: &str = r#"}],"structuredContent":"#;
const AFTER_STRUCTURE: &str = "}";

/// The UTF-8 bytes of the reply that carries `answer_text`, an answer that is a JSON object.
pub fn reply_bytes(answer_text: &str) -> usize {
    let mut counter = ByteCount(0);
    let escaped = match answer_format::json::to_writer(&mut counter, answer_text) {
        Ok(()) => counter.0,
        Err(_) => answer_text.len() + 2,
    };
    BEFORE_TEXT.len() + escaped + BETWEEN.len() + answer_text.len() + AFTER_STRUCTURE.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::answer::{CallToolResult, ToolOutput};

    #[test]
    fn the_size_is_the_length_of_the_reply_the_server_writes() {
        let answer = serde_json::json!({
            "text": "quote \" backslash \\ newline \n tab \t bell \u{7} 한국어 emoji 😀",
            "list": [1, 2, 3],
        });
        let output = ToolOutput::json(&answer).expect("an object answer");
        let written = answer_format::json::to_string(&CallToolResult::success(output))
            .expect("the reply is written");
        let answer_text = answer_format::json::to_string(&answer).expect("the answer is written");
        assert_eq!(reply_bytes(&answer_text), written.len());
    }
}
