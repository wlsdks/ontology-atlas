//! The order a JavaScript object lists its keys in: the keys that are array indices (`"0"`,
//! `"12"`, without a leading zero and below 2^32 - 1) first, ascending, then every other key in the
//! order it was added. An agent that reads a node's frontmatter through the JavaScript server sees
//! this order, so a key such as `2024` sorts ahead of `uid`.

/// Whether `key` is a canonical array index.
fn array_index(key: &str) -> Option<u32> {
    let first = key.bytes().next()?;
    if !first.is_ascii_digit()
        || (first == b'0' && key.len() > 1)
        || !key.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    key.parse::<u32>().ok().filter(|index| *index != u32::MAX)
}

/// `entries` in the order a JavaScript object lists them.
pub fn in_object_order<'a, T>(
    entries: impl Iterator<Item = (&'a String, T)>,
) -> Vec<(&'a String, T)> {
    let mut indexed: Vec<(u32, (&'a String, T))> = Vec::new();
    let mut named: Vec<(&'a String, T)> = Vec::new();
    for (key, value) in entries {
        match array_index(key) {
            Some(index) => indexed.push((index, (key, value))),
            None => named.push((key, value)),
        }
    }
    if indexed.is_empty() {
        return named;
    }
    indexed.sort_by_key(|(index, _)| *index);
    indexed
        .into_iter()
        .map(|(_, entry)| entry)
        .chain(named)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_that_are_array_indices_come_first_in_numeric_order() {
        let keys: Vec<String> = ["uid", "10", "2", "02", "kind", "4294967295", "0"]
            .map(String::from)
            .to_vec();
        let ordered: Vec<&str> = in_object_order(keys.iter().map(|key| (key, ())))
            .into_iter()
            .map(|(key, ())| key.as_str())
            .collect();
        assert_eq!(ordered, ["0", "2", "10", "uid", "02", "kind", "4294967295"]);
    }
}
