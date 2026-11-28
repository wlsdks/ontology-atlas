//! The newest `limit` record names below a cursor, found while the folder is listed and holding no
//! more than `limit` of them: a history of a hundred thousand records costs one pass and a handful of
//! names. Names sort by their moment, so newest is greatest.

use std::cmp::Reverse;
use std::collections::BinaryHeap;

pub struct NamePage {
    limit: usize,
    below: Option<String>,
    /// The greatest names seen, the smallest of them on top.
    kept: BinaryHeap<Reverse<String>>,
    total: usize,
    candidates: usize,
}

/// What a listing found: the page, newest first, how many names there were, and where the next page
/// starts when there is one.
pub struct FoundPage {
    pub names: Vec<String>,
    pub total: usize,
    pub next_cursor: Option<String>,
}

impl NamePage {
    /// A page of at most `limit` names, all smaller than `below` when one is given.
    pub fn new(limit: usize, below: Option<String>) -> Self {
        Self {
            limit,
            below,
            kept: BinaryHeap::with_capacity(limit.saturating_add(1)),
            total: 0,
            candidates: 0,
        }
    }

    pub fn add(&mut self, name: String) {
        self.total += 1;
        if self.below.as_ref().is_some_and(|below| name >= *below) {
            return;
        }
        self.candidates += 1;
        if self.kept.len() < self.limit {
            self.kept.push(Reverse(name));
        } else if self
            .kept
            .peek()
            .is_some_and(|Reverse(smallest)| name > *smallest)
        {
            self.kept.pop();
            self.kept.push(Reverse(name));
        }
    }

    pub fn finish(self) -> FoundPage {
        let mut names: Vec<String> = self.kept.into_iter().map(|Reverse(name)| name).collect();
        names.sort_unstable_by(|left, right| right.cmp(left));
        let next_cursor = if self.candidates > names.len() {
            names.last().cloned()
        } else {
            None
        };
        FoundPage {
            names,
            total: self.total,
            next_cursor,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(limit: usize, below: Option<&str>, names: &[&str]) -> FoundPage {
        let mut page = NamePage::new(limit, below.map(String::from));
        for name in names {
            page.add((*name).to_string());
        }
        page.finish()
    }

    #[test]
    fn pages_follow_each_other_newest_first_without_a_gap_or_a_repeat() {
        let names = ["a", "e", "c", "b", "d"];
        let first = page(2, None, &names);
        assert_eq!(first.names, ["e", "d"]);
        assert_eq!(first.total, 5);
        assert_eq!(first.next_cursor.as_deref(), Some("d"));
        let second = page(2, first.next_cursor.as_deref(), &names);
        assert_eq!(second.names, ["c", "b"]);
        assert_eq!(second.total, 5);
        let third = page(2, second.next_cursor.as_deref(), &names);
        assert_eq!(third.names, ["a"]);
        assert_eq!(third.next_cursor, None);
    }
}
