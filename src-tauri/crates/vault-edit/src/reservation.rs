//! A node reserved for a person (`review_state: human_decides`) is never rewritten by a write
//! tool, whatever it names: a rename or a merge reaches files nobody named.

use std::path::Path;

use confined_files::ReservedForPerson;
use vault_document::Document;

/// The reservation the text of a vault file holds, or `None` when it holds none or does not parse.
pub fn reservation_in(path: &Path, text: &str) -> Option<ReservedForPerson> {
    let document = Document::from_text(text);
    let frontmatter = document.frontmatter();
    if frontmatter.text("review_state") != Some("human_decides") {
        return None;
    }
    Some(ReservedForPerson {
        slug: frontmatter
            .text("slug")
            .map_or_else(|| path.display().to_string(), str::to_string),
        note: frontmatter
            .truthy("review_note")
            .map(|note| note.display_text()),
    })
}
