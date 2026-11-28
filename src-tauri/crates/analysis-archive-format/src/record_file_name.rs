//! The name of a record file: its moment and its id, so the newest record sorts last and the name
//! alone says which record it holds: `2026-11-27T09-15-30-123Z-<uuid>.md`.

const STAMP_LENGTH: usize = 24;

/// Whether `text` is a version 4 UUID in lower case, `8-4-4-4-12`.
pub fn is_uuid_v4(text: &str) -> bool {
    let groups: Vec<&str> = text.split('-').collect();
    let lengths_fit = groups.len() == 5
        && groups
            .iter()
            .zip([8_usize, 4, 4, 4, 12])
            .all(|(group, length)| group.len() == length);
    let lower_hex = text
        .bytes()
        .all(|byte| byte == b'-' || byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
    let version_four = groups.get(2).is_some_and(|group| group.starts_with('4'));
    let variant = groups
        .get(3)
        .is_some_and(|group| group.starts_with(['8', '9', 'a', 'b']));
    lengths_fit && lower_hex && version_four && variant
}

/// The name the record made at `created_at` with `id` is kept under.
pub fn record_file_name(created_at: &str, id: &str) -> String {
    format!("{}-{id}.md", created_at.replace([':', '.'], "-"))
}

/// Whether `name` is the name of a record file, whatever it holds.
pub fn is_record_file_name(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".md") else {
        return false;
    };
    let (Some(stamp), Some(id)) = (stem.get(..STAMP_LENGTH), stem.get(STAMP_LENGTH + 1..)) else {
        return false;
    };
    stem.as_bytes().get(STAMP_LENGTH) == Some(&b'-') && is_stamp(stamp) && is_uuid_v4(id)
}

/// `YYYY-MM-DDTHH-MM-SS-mmmZ`.
fn is_stamp(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == STAMP_LENGTH
        && bytes.iter().enumerate().all(|(place, byte)| match place {
            4 | 7 | 13 | 16 | 19 => *byte == b'-',
            10 => *byte == b'T',
            23 => *byte == b'Z',
            _ => byte.is_ascii_digit(),
        })
}

/// Whether `name` is a record file's name that ends in the id `id`.
pub fn is_record_of(name: &str, id: &str) -> bool {
    is_record_file_name(name)
        && name
            .strip_suffix(".md")
            .and_then(|stem| stem.strip_suffix(id))
            .is_some_and(|before| before.ends_with('-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

    #[test]
    fn the_name_a_record_is_kept_under_is_found_by_its_id_and_by_nothing_looser() {
        let name = record_file_name("2026-11-27T09:15:30.123Z", ID);
        assert_eq!(name, format!("2026-11-27T09-15-30-123Z-{ID}.md"));
        assert!(is_record_file_name(&name));
        assert!(is_record_of(&name, ID));
        for refused in [
            format!("2026-11-27T09-15-30-123Z-{ID}.markdown"),
            format!("2026-11-27T09-15-30-123-{ID}.md"),
            format!("2026-11-27T09-15-30-123Z-{}.md", ID.to_uppercase()),
            format!("2026-11-27T09:15:30.123Z-{ID}.md"),
            "2026-11-27T09-15-30-123Z-0a1b2c3d-4e5f-3a6b-8c7d-9e0f1a2b3c4d.md".to_string(),
            "2026-11-27T09-15-30-123Z-0a1b2c3d-4e5f-4a6b-7c7d-9e0f1a2b3c4d.md".to_string(),
            "2026-11-27T09-15-30-123Z-\u{e9}a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4.md".to_string(),
            "notes.md".to_string(),
            format!(".{name}"),
        ] {
            assert!(!is_record_file_name(&refused), "{refused}");
        }
        assert!(!is_record_of(&name, "0a1b2c3d-4e5f-4a6b-8c7d-000000000000"));
    }
}
