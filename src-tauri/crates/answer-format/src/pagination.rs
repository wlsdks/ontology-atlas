//! Where a page of rows lies in the list it was cut from, as every answer that pages says it:
//! `offset`, `limit`, `total`, `returned`, `hasMore` and the `nextOffset` that continues.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Pagination {
    pub offset: usize,
    pub limit: usize,
    pub total: usize,
    pub returned: usize,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
    /// Where the next page starts; `null` on the last page.
    #[serde(rename = "nextOffset")]
    pub next_offset: Option<usize>,
}

impl Pagination {
    /// The page of `returned` rows that starts at `offset` in a list of `total`, asked with
    /// `limit`. The next page starts where this one ended, so no row is skipped or repeated.
    pub const fn of(offset: usize, limit: usize, total: usize, returned: usize) -> Self {
        let end = offset.saturating_add(returned);
        let has_more = end < total;
        Self {
            offset,
            limit,
            total,
            returned,
            has_more,
            next_offset: if has_more { Some(end) } else { None },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_next_offset_starts_where_the_page_ended_and_the_last_page_has_none() {
        let first = Pagination::of(0, 100, 250, 100);
        assert_eq!(first.next_offset, Some(100));
        assert!(first.has_more);
        let last = Pagination::of(200, 100, 250, 50);
        assert_eq!(last.next_offset, None);
        assert!(!last.has_more);
    }

    #[test]
    fn a_page_cut_short_by_size_continues_after_the_rows_it_returned() {
        let cut = Pagination::of(40, 100, 500, 7);
        assert_eq!(cut.next_offset, Some(47));
        assert_eq!(
            serde_json::to_string(&cut).expect("serializes"),
            r#"{"offset":40,"limit":100,"total":500,"returned":7,"hasMore":true,"nextOffset":47}"#
        );
    }
}
