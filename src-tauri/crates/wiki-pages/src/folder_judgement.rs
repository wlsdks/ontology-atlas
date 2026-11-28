//! The three findings only the whole folder shows: `dangling-wikilink` (a `[[wiki/...]]` target that
//! is not a page), `orphan-page` (nothing links here, with two or more pages) and
//! `shared-source-unlinked` (pages written from one primary source that do not link each other).
//! A page asked about alone would read as an orphan, so a page is always judged against every page.

use std::collections::{HashMap, HashSet};

use answer_format::utf16;

use crate::problem::Problem;
use crate::wiki_template::WIKI_DIR;

/// Partners named before the rest are counted.
const PARTNERS_NAMED: usize = 10;

/// What the folder half reads of one page.
pub struct FolderPage<'a> {
    /// `wiki/<slug>.md`.
    pub path: &'a str,
    pub sources: &'a [String],
    pub links: &'a [(String, usize)],
}

struct Entry<'a> {
    path: &'a str,
    slug: &'a str,
    links: &'a [(String, usize)],
    sources: HashSet<&'a str>,
    /// The sources in the page's own order, the first being the primary.
    ordered_sources: &'a [String],
    primary: Option<&'a str>,
}

impl Entry<'_> {
    fn is_partner(&self, other: &Entry<'_>, same_page: bool) -> bool {
        !same_page
            && (self.primary.is_some_and(|primary| other.sources.contains(primary))
                || other.primary.is_some_and(|primary| self.sources.contains(primary)))
    }
}

struct Partners {
    named: Vec<usize>,
    more: usize,
}

/// The problems of every page, in the order the pages are given.
pub fn judge_folder(pages: &[FolderPage<'_>]) -> Vec<Vec<Problem>> {
    let entries: Vec<Entry<'_>> = pages
        .iter()
        .map(|page| Entry {
            path: page.path,
            slug: page.path.strip_suffix(".md").unwrap_or(page.path),
            links: page.links,
            sources: page.sources.iter().map(String::as_str).collect(),
            ordered_sources: page.sources,
            primary: page.sources.first().map(String::as_str),
        })
        .collect();
    // The last page of a slug wins, and inbound links are keyed by slug.
    let by_slug: HashMap<&str, usize> = entries
        .iter()
        .enumerate()
        .map(|(index, entry)| (entry.slug, index))
        .collect();
    let mut inbound: HashMap<&str, Vec<&str>> = HashMap::new();
    for entry in &entries {
        for (target, _) in entry.links {
            if target == entry.slug || !by_slug.contains_key(target.as_str()) {
                continue;
            }
            inbound.entry(target.as_str()).or_default().push(entry.slug);
        }
    }
    let mut listed_by: HashMap<&str, Vec<usize>> = HashMap::new();
    let mut primary_of: HashMap<&str, Vec<usize>> = HashMap::new();
    let mut primary_listing: HashMap<(&str, &str), usize> = HashMap::new();
    for (index, entry) in entries.iter().enumerate() {
        for source in &entry.sources {
            listed_by.entry(source).or_default().push(index);
        }
        let Some(primary) = entry.primary else {
            continue;
        };
        primary_of.entry(primary).or_default().push(index);
        for source in &entry.sources {
            *primary_listing.entry((primary, source)).or_default() += 1;
        }
    }
    let entry_at = |index: usize| entries.get(index);

    let unlinked_partners = |index: usize| -> Option<Partners> {
        let entry = entry_at(index)?;
        let primary = entry.primary?;
        let mut linked: HashSet<&str> = inbound
            .get(entry.slug)
            .map(|slugs| slugs.iter().copied().collect())
            .unwrap_or_default();
        for (target, _) in entry.links {
            if by_slug.contains_key(target.as_str()) {
                linked.insert(target.as_str());
            }
        }
        let linked_partners = linked
            .iter()
            .filter(|slug| {
                by_slug.get(*slug).and_then(|at| entry_at(*at)).is_some_and(|other| {
                    entry.is_partner(other, std::ptr::eq(entry, other))
                })
            })
            .count();
        let listing = listed_by.get(primary).map_or(&[][..], Vec::as_slice);
        let mut partners = listing.len().saturating_sub(1);
        let mut lists: Vec<&[usize]> = vec![listing];
        for source in entry.ordered_sources {
            if source == primary {
                continue;
            }
            let written = primary_of.get(source.as_str()).map_or(&[][..], Vec::as_slice);
            let own = primary_listing.get(&(source.as_str(), primary)).copied().unwrap_or(0);
            partners = (partners + written.len()).saturating_sub(own);
            if !written.is_empty() {
                lists.push(written);
            }
        }
        let unlinked = partners.saturating_sub(linked_partners);
        if unlinked == 0 {
            return None;
        }
        let mut heads = vec![0usize; lists.len()];
        let mut named: Vec<usize> = Vec::new();
        let mut previous: Option<usize> = None;
        while named.len() < PARTNERS_NAMED {
            let mut pick: Option<usize> = None;
            for (list, items) in lists.iter().enumerate() {
                let Some(at) = items.get(heads.get(list).copied().unwrap_or(0)) else {
                    continue;
                };
                let better = pick.is_none_or(|held| {
                    lists
                        .get(held)
                        .and_then(|held_items| held_items.get(heads.get(held).copied().unwrap_or(0)))
                        .is_none_or(|current| at < current)
                });
                if better {
                    pick = Some(list);
                }
            }
            let Some(list) = pick else {
                break;
            };
            let other = lists
                .get(list)
                .and_then(|items| items.get(heads.get(list).copied().unwrap_or(0)))
                .copied()?;
            if let Some(head) = heads.get_mut(list) {
                *head += 1;
            }
            if previous == Some(other) || other == index {
                continue;
            }
            previous = Some(other);
            if entry_at(other).is_some_and(|candidate| !linked.contains(candidate.slug)) {
                named.push(other);
            }
        }
        let more = unlinked.saturating_sub(named.len());
        Some(Partners { named, more })
    };

    (0..entries.len())
        .map(|index| {
            let Some(entry) = entry_at(index) else {
                return Vec::new();
            };
            let mut problems = Vec::new();
            for (target, line) in entry.links {
                let dangles = target != entry.slug
                    && !by_slug.contains_key(target.as_str())
                    && target.starts_with(&format!("{WIKI_DIR}/"));
                if dangles {
                    problems.push(Problem::new(
                        "dangling-wikilink",
                        format!("`[[{target}]]` names a page that is not in this folder. Link only to a page that exists, or write the page."),
                        Some(*line),
                        "dangling-wikilink",
                        vec![("target", target.clone())],
                    ));
                }
            }
            if entries.len() >= 2 && !inbound.contains_key(entry.slug) {
                problems.push(Problem::new(
                    "orphan-page",
                    "No other page links here. A page nobody points at is reached only by its file name; link it from the page that talks about its topic.",
                    None,
                    "orphan-page",
                    Vec::new(),
                ));
            }
            if let Some(shared) = unlinked_partners(index) {
                for other in &shared.named {
                    let Some(partner) = entry_at(*other) else {
                        continue;
                    };
                    let mut common: Vec<&str> = entry
                        .sources
                        .iter()
                        .copied()
                        .filter(|source| {
                            partner.sources.contains(source)
                                && (entry.primary == Some(*source) || partner.primary == Some(*source))
                        })
                        .collect();
                    common.sort_by(|left, right| utf16::compare(left, right));
                    let listed = common
                        .iter()
                        .map(|source| format!("`{source}`"))
                        .collect::<Vec<_>>()
                        .join(", ");
                    problems.push(Problem::new(
                        "shared-source-unlinked",
                        format!("`{}` also lists {listed} and neither page links the other. Two write-ups of one document that do not know about each other cannot carry a disagreement between them.", partner.path),
                        None,
                        "shared-source-unlinked",
                        vec![("other", partner.path.to_string()), ("sources", listed)],
                    ));
                }
                if shared.more > 0 {
                    problems.push(Problem::new(
                        "shared-source-unlinked",
                        format!("{} more pages share a primary source with this one and neither page links the other. Link the write-ups of one document to each other.", shared.more),
                        None,
                        "shared-source-unlinked-more",
                        vec![("count", shared.more.to_string())],
                    ));
                }
            }
            problems
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page<'a>(path: &'a str, sources: &'a [String], links: &'a [(String, usize)]) -> FolderPage<'a> {
        FolderPage { path, sources, links }
    }

    #[test]
    fn a_dangling_link_an_orphan_and_two_unlinked_write_ups_of_one_source_are_each_found() {
        let notes = vec!["sources/notes.md".to_string()];
        let none: Vec<(String, usize)> = Vec::new();
        let to_missing = vec![("wiki/gone".to_string(), 12)];
        let pages = [
            page("wiki/a.md", &notes, &to_missing),
            page("wiki/b.md", &notes, &none),
        ];
        let found = judge_folder(&pages);
        let codes: Vec<Vec<&str>> = found
            .iter()
            .map(|problems| problems.iter().map(|problem| problem.code.as_str()).collect())
            .collect();
        assert_eq!(
            codes,
            [
                vec!["dangling-wikilink", "orphan-page", "shared-source-unlinked"],
                vec!["orphan-page", "shared-source-unlinked"],
            ]
        );
        assert_eq!(found[0][0].line, Some(12));
    }

    #[test]
    fn linking_each_other_clears_the_orphan_and_the_shared_source_findings() {
        let notes = vec!["sources/notes.md".to_string()];
        let to_b = vec![("wiki/b".to_string(), 3)];
        let to_a = vec![("wiki/a".to_string(), 3)];
        let pages = [page("wiki/a.md", &notes, &to_b), page("wiki/b.md", &notes, &to_a)];
        assert!(judge_folder(&pages).iter().all(Vec::is_empty));
    }

    #[test]
    fn a_folder_of_one_page_has_no_orphan() {
        let none: Vec<String> = Vec::new();
        let no_links: Vec<(String, usize)> = Vec::new();
        assert!(judge_folder(&[page("wiki/a.md", &none, &no_links)])[0].is_empty());
    }
}
