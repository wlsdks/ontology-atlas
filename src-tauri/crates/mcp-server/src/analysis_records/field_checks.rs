//! The checks a record's fields pass, each with the sentence it fails with. A field is named in the
//! sentence the way the writer names it, so an agent that reads a `problems` row knows which line of
//! the file to look at.

use indexmap::IndexMap;

use super::record_fault::RecordFault;
use super::record_value::RecordValue;

pub type Row = IndexMap<String, RecordValue>;

/// The longest text most fields may hold, in UTF-16 units.
pub const TEXT_MAX: usize = 100_000;
/// The most items most lists may hold.
pub const LIST_MAX: usize = 200;

/// Whether `text` is a version 4 UUID in lower case, `8-4-4-4-12`.
pub fn is_uuid(text: &str) -> bool {
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

/// Whether `text` is `sha256:` and 64 lower-case hexadecimal digits.
pub fn is_digest(text: &str) -> bool {
    text.strip_prefix("sha256:").is_some_and(|digits| {
        digits.len() == 64
            && digits
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

pub fn object<'a>(value: &'a RecordValue, name: &str) -> Result<&'a Row, RecordFault> {
    value
        .as_object()
        .ok_or_else(|| RecordFault::new(format!("{name} must be a plain object.")))
}

/// The row has every key of `keys` and no other.
pub fn fields(row: &Row, keys: &[&str], name: &str) -> Result<(), RecordFault> {
    let fits = keys.iter().all(|key| row.contains_key(*key))
        && row.keys().all(|key| keys.contains(&key.as_str()));
    if fits {
        Ok(())
    } else {
        Err(RecordFault::new(format!(
            "{name} has missing or unsupported fields."
        )))
    }
}

/// The key's value; `fields` has already said it is there.
pub fn field<'a>(row: &'a Row, key: &str) -> &'a RecordValue {
    static ABSENT: RecordValue = RecordValue::Null;
    row.get(key).unwrap_or(&ABSENT)
}

pub fn text<'a>(
    value: &'a RecordValue,
    name: &str,
    allow_empty: bool,
    max: usize,
) -> Result<&'a str, RecordFault> {
    let fits = value.as_text().filter(|text| {
        (allow_empty || !answer_format::whitespace::trim(text).is_empty())
            && answer_format::utf16::len(text) <= max
    });
    fits.ok_or_else(|| {
        RecordFault::new(format!(
            "{name} must be {} bounded string.",
            if allow_empty { "a" } else { "a non-empty" }
        ))
    })
}

pub fn nullable_text(value: &RecordValue, name: &str) -> Result<(), RecordFault> {
    if value.is_null() {
        Ok(())
    } else {
        text(value, name, false, TEXT_MAX).map(|_| ())
    }
}

pub fn one_of(value: &RecordValue, values: &[&str], name: &str) -> Result<(), RecordFault> {
    if value.as_text().is_some_and(|text| values.contains(&text)) {
        Ok(())
    } else {
        Err(RecordFault::new(format!("{name} is unsupported.")))
    }
}

pub fn uuid(value: &RecordValue, name: &str) -> Result<(), RecordFault> {
    if value.as_text().is_some_and(is_uuid) {
        Ok(())
    } else {
        Err(RecordFault::new(format!("{name} must be a UUIDv4.")))
    }
}

pub fn digest(value: &RecordValue, name: &str) -> Result<(), RecordFault> {
    if value.as_text().is_some_and(is_digest) {
        Ok(())
    } else {
        Err(RecordFault::new(format!(
            "{name} must be a SHA-256 digest."
        )))
    }
}

pub fn list<'a>(
    value: &'a RecordValue,
    name: &str,
    maximum: usize,
) -> Result<&'a [RecordValue], RecordFault> {
    value
        .as_list()
        .filter(|items| items.len() <= maximum)
        .ok_or_else(|| RecordFault::new(format!("{name} must be a bounded array.")))
}

/// A list of distinct non-empty texts.
pub fn strings<'a>(
    value: &'a RecordValue,
    name: &str,
    maximum: usize,
) -> Result<Vec<&'a str>, RecordFault> {
    let items = list(value, name, maximum)?;
    let mut texts: Vec<&str> = Vec::with_capacity(items.len());
    for item in items {
        texts.push(text(item, name, false, 1024)?);
    }
    let mut distinct = texts.clone();
    distinct.sort_unstable();
    distinct.dedup();
    if distinct.len() == texts.len() {
        Ok(texts)
    } else {
        Err(RecordFault::new(format!("{name} must not repeat values.")))
    }
}

/// `2026-11-27T09:15:30.123Z`, a moment that exists, written as it would be read back.
pub fn timestamp(value: &RecordValue) -> Result<&str, RecordFault> {
    let written = text(value, "createdAt", false, 24)?;
    let exact = answer_format::iso_time::parse_iso(written)
        .is_some_and(|ms| answer_format::iso_time::to_iso_string(ms) == written);
    if exact {
        Ok(written)
    } else {
        Err(RecordFault::new(
            "createdAt must be an exact UTC timestamp.",
        ))
    }
}
