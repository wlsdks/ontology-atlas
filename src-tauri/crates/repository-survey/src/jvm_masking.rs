//! Java and Kotlin source with every comment and the inside of every string and character literal
//! replaced by spaces, newlines and quote marks kept, so offsets and line numbers still hold and
//! nothing written in prose or data reads as code. Kotlin block comments nest and `${...}`
//! templates are skipped whole. Every byte of a blanked range becomes one space, so the masked
//! text is as long as the original and a byte offset means the same place in both.

/// `text` with comments and literal contents blanked.
pub fn mask_jvm_source(text: &str, kotlin: bool) -> String {
    let bytes = text.as_bytes();
    let mut masked: Vec<u8> = bytes.to_vec();
    let mut index = 0;
    while index < bytes.len() {
        let Some(&byte) = bytes.get(index) else { break };
        let rest = bytes.get(index..).unwrap_or_default();
        let end = if rest.starts_with(b"//") {
            let end = line_end(bytes, index);
            blank(&mut masked, index, end);
            end
        } else if rest.starts_with(b"/*") {
            let end = block_comment_end(bytes, index, kotlin);
            blank(&mut masked, index, end);
            end
        } else if rest.starts_with(b"\"\"\"") {
            let close = find_from(bytes, b"\"\"\"", index + 3);
            let content_end = close.unwrap_or(bytes.len());
            blank(&mut masked, index + 3, content_end);
            close.map_or(content_end, |at| at + 3)
        } else if byte == b'"' || byte == b'\'' {
            let close = literal_close(bytes, index, byte, kotlin);
            let content_end = close.unwrap_or_else(|| line_end(bytes, index));
            blank(&mut masked, index + 1, content_end);
            close.map_or(content_end, |at| at + 1)
        } else {
            index += 1;
            continue;
        };
        index = end.max(index + 1);
    }
    // Only ASCII spaces replaced bytes of whole characters, so the text is still UTF-8.
    String::from_utf8(masked).unwrap_or_default()
}

fn line_end(bytes: &[u8], start: usize) -> usize {
    bytes
        .get(start..)
        .and_then(|rest| rest.iter().position(|byte| *byte == b'\n'))
        .map_or(bytes.len(), |at| start + at)
}

fn find_from(bytes: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    let rest = bytes.get(from..)?;
    rest.windows(needle.len())
        .position(|window| window == needle)
        .map(|at| from + at)
}

/// Spaces over `from..to`, newlines kept. A byte of a multi-byte character is blanked with the
/// rest of its bytes, never alone, because a literal or comment is blanked whole.
fn blank(masked: &mut [u8], from: usize, to: usize) {
    let to = to.min(masked.len());
    for byte in masked.get_mut(from..to).unwrap_or_default() {
        if *byte != b'\n' {
            *byte = b' ';
        }
    }
}

fn block_comment_end(bytes: &[u8], start: usize, nested: bool) -> usize {
    let mut depth: i64 = 0;
    let mut index = start;
    while index < bytes.len() {
        let rest = bytes.get(index..).unwrap_or_default();
        if rest.starts_with(b"/*") {
            depth = if nested { depth + 1 } else { 1 };
            index += 2;
        } else if rest.starts_with(b"*/") {
            depth -= 1;
            index += 2;
            if depth == 0 {
                return index;
            }
        } else {
            index += 1;
        }
    }
    bytes.len()
}

/// The index of the quote closing a one-line literal opened at `start`, none when the line ends
/// first.
fn literal_close(bytes: &[u8], start: usize, quote: u8, kotlin: bool) -> Option<usize> {
    let mut index = start + 1;
    while index < bytes.len() {
        let character = *bytes.get(index)?;
        if character == b'\\' {
            index += 1;
        } else if character == b'\n' {
            return None;
        } else if character == quote {
            return Some(index);
        } else if kotlin
            && quote == b'"'
            && character == b'$'
            && bytes.get(index + 1) == Some(&b'{')
        {
            let mut depth: i64 = 0;
            index += 1;
            while index < bytes.len() && bytes.get(index) != Some(&b'\n') {
                if bytes.get(index) == Some(&b'{') {
                    depth += 1;
                } else if bytes.get(index) == Some(&b'}') {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                index += 1;
            }
            if bytes.get(index) == Some(&b'\n') {
                return None;
            }
        }
        index += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_comment_and_a_string_are_blanked_with_the_offsets_kept() {
        let text = "int a; // @Scheduled\nString s = \"@GetMapping\";\n";
        let masked = mask_jvm_source(text, false);
        assert_eq!(masked.len(), text.len());
        assert!(!masked.contains("Scheduled"));
        assert!(!masked.contains("GetMapping"));
        assert!(masked.contains("String s = \"           \";"));
    }

    #[test]
    fn a_kotlin_block_comment_nests_and_a_template_is_skipped_whole() {
        let masked = mask_jvm_source(
            "/* a /* b */ still comment */ fun x() = \"${ \"}\" }\"",
            true,
        );
        assert!(masked.contains("fun x()"));
        assert!(!masked.contains("still"));
    }

    #[test]
    fn a_multi_byte_character_in_a_comment_keeps_the_text_valid_and_as_long() {
        let text = "// 주문\nclass A {}";
        let masked = mask_jvm_source(text, false);
        assert_eq!(masked.len(), text.len());
        assert!(masked.ends_with("class A {}"));
    }
}
