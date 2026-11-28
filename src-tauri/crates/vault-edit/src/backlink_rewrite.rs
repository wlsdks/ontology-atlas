//! Moving every reference to a node when it is renamed, merged away or given another kind: the
//! graph lists that name it, the `domain:` that names it, the notes written about it, and the
//! links to it in other bodies. The result is a plan of whole new file texts; nothing is written
//! here.
//!
//! A bare name or a `…/name` suffix is moved only while the name belongs to one node, so
//! `capabilities/foo` beside `elements/foo` never redirects the wrong one.

use std::borrow::Cow;
use std::sync::OnceLock;

use confined_files::{unwritable_slug_reason, ModifiedTime};
use icu_normalizer::ComposingNormalizerBorrowed;
use regex::{Captures, Regex};
use vault_document::schema::GRAPH_ARRAY_KEYS;
use vault_document::{Document, LoadedDocument};

use crate::document_edit::{edit_frontmatter, KeyChange};
use crate::node_fields::{normalized_references, NodeFields};
use crate::setting::Setting;
use crate::source_document::{SourceDocument, SourceRefusal};

/// The list a node of `holder_kind` keeps a `child_kind` node in, or `None` when it keeps none.
pub fn containment_key_for(holder_kind: &str, child_kind: &str) -> Option<&'static str> {
    let (key, holders): (&'static str, &[&str]) = match child_kind {
        "domain" => ("domains", &["project"]),
        "capability" => ("capabilities", &["project", "domain"]),
        "element" => ("elements", &["project", "domain", "capability"]),
        _ => return None,
    };
    holders.contains(&holder_kind).then_some(key)
}

const CONTAINMENT_KEYS: [&str; 3] = ["domains", "capabilities", "elements"];

/// What to redirect, and how.
pub struct Redirect<'a> {
    pub from: &'a str,
    pub to: &'a str,
    /// Slugs left alone: a node about to be replaced whole must not also be rewritten.
    pub exclude: &'a [String],
    /// Set when the target changes kind, so referrers move it between their kind-named lists.
    pub target_kind: Option<&'a str>,
}

/// One document that would change.
#[derive(Debug, Clone)]
pub struct ReferrerUpdate {
    pub slug: String,
    /// The keys that change, in file order of first change.
    pub keys: Vec<String>,
    pub body_changed: bool,
}

/// An entry a kind change left where it was, because its holder keeps no list for the new kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeptEntry {
    pub slug: String,
    pub key: String,
    pub reference: String,
    pub holder_kind: String,
}

/// A referrer's new text, made from the file as it was read.
#[derive(Debug, Clone)]
pub struct Rewrite {
    pub source: SourceDocument,
    pub text: String,
}

#[derive(Debug, Default)]
pub struct RedirectPlan {
    pub updates: Vec<ReferrerUpdate>,
    pub kept_in_place: Vec<KeptEntry>,
    /// Referrers a write tool never edits (agent instruction files, hidden paths): left as they were.
    pub unwritable_referrers: Vec<String>,
    pub rewrites: Vec<Rewrite>,
}

fn composed(text: &str) -> Cow<'_, str> {
    ComposingNormalizerBorrowed::new_nfc().normalize(text)
}

fn tail(slug: &str) -> &str {
    slug.rsplit('/').next().unwrap_or(slug)
}

struct Names<'a> {
    from: &'a str,
    to: &'a str,
    from_tail: &'a str,
    to_tail: &'a str,
    can_rewrite_tail: bool,
}

impl Names<'_> {
    /// The name `reference` becomes, or `None` when it does not name the target.
    fn moved(&self, reference: &str) -> Option<String> {
        let reference = composed(reference);
        if reference == self.from {
            return Some(self.to.to_string());
        }
        if !self.can_rewrite_tail {
            return None;
        }
        if reference == self.from_tail {
            return Some(self.to_tail.to_string());
        }
        let prefix = reference.strip_suffix(self.from_tail)?.strip_suffix('/')?;
        Some(format!("{prefix}/{}", self.to_tail))
    }
}

fn wiki_link() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\[\[([^\]\[|#\r\n]+)((?:#[^\]\[|\r\n]*)?(?:\|[^\]\[\r\n]*)?)\]\]")
            .unwrap_or_else(|error| unreachable!("a fixed pattern: {error}"))
    })
}

fn file_link() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\(([^()\s]+)\.md(#[^()\s]*)?\)")
            .unwrap_or_else(|error| unreachable!("a fixed pattern: {error}"))
    })
}

/// `body` with every link shape to the target moved: `[[slug]]`, `[[slug#h]]`, `[[slug|alias]]`,
/// `(slug.md)` and `(slug.md#a)`. Bare prose paths are evidence, not references.
fn moved_links(body: &str, names: &Names<'_>) -> Option<String> {
    let mut changed = false;
    let after_wiki = wiki_link().replace_all(body, |captures: &Captures<'_>| {
        let whole = captures.get(0).map_or("", |found| found.as_str());
        let target = captures.get(1).map_or("", |found| found.as_str());
        let rest = captures.get(2).map_or("", |found| found.as_str());
        match names.moved(answer_format::whitespace::trim(target)) {
            Some(moved) => {
                changed = true;
                format!("[[{moved}{rest}]]")
            }
            None => whole.to_string(),
        }
    });
    let after_file = file_link().replace_all(&after_wiki, |captures: &Captures<'_>| {
        let whole = captures.get(0).map_or("", |found| found.as_str());
        let target = captures.get(1).map_or("", |found| found.as_str());
        let anchor = captures.get(2).map_or("", |found| found.as_str());
        match names.moved(target) {
            Some(moved) => {
                changed = true;
                format!("({moved}.md{anchor})")
            }
            None => whole.to_string(),
        }
    });
    changed.then(|| after_file.into_owned())
}

/// What one referrer's frontmatter becomes.
struct Edited {
    next: NodeFields,
    touched: Vec<String>,
}

impl Edited {
    fn set(&mut self, key: &str, value: Setting) {
        self.next.set(key, value);
        if !self.touched.iter().any(|held| held == key) {
            self.touched.push(key.to_string());
        }
    }

    fn remove(&mut self, key: &str) {
        self.next.remove(key);
        if !self.touched.iter().any(|held| held == key) {
            self.touched.push(key.to_string());
        }
    }
}

fn list_items(setting: Option<&Setting>) -> Vec<String> {
    match setting {
        Some(Setting::List(items)) => items
            .iter()
            .filter_map(|item| item.as_text().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

fn is_reference_slot(key: &str) -> bool {
    key == "domain" || GRAPH_ARRAY_KEYS.contains(&key)
}

fn redirect_references(
    fields: &NodeFields,
    names: &Names<'_>,
    rewriting_self: bool,
    edited: &mut Edited,
) {
    for (key, value) in fields.entries() {
        match value {
            Setting::List(items) if GRAPH_ARRAY_KEYS.contains(&key.as_str()) => {
                let before: Vec<String> = items
                    .iter()
                    .filter_map(|item| item.as_text().map(str::to_string))
                    .collect();
                let after: Vec<String> = before
                    .iter()
                    .filter_map(|item| match names.moved(item) {
                        Some(_) if rewriting_self => None,
                        Some(moved) => Some(moved),
                        None => Some(item.clone()),
                    })
                    .collect();
                if before != after {
                    let deduped = normalized_references(
                        &after.into_iter().map(Setting::Text).collect::<Vec<_>>(),
                    );
                    edited.set(key, deduped);
                }
            }
            Setting::Text(text) if is_reference_slot(key) => {
                if let Some(moved) = names.moved(text) {
                    if rewriting_self {
                        edited.remove(key);
                    } else {
                        edited.set(key, Setting::Text(moved));
                    }
                }
            }
            Setting::Map(members) if key == "relation_notes" => {
                let mut next: Vec<(String, Setting)> = Vec::new();
                let mut changed = false;
                for (name, note) in members {
                    match names.moved(name) {
                        None => {
                            if !next.iter().any(|(held, _)| held == name) {
                                next.push((name.clone(), note.clone()));
                            }
                        }
                        Some(moved) => {
                            changed = true;
                            if rewriting_self
                                || next.iter().any(|(held, _)| *held == moved)
                                || members.iter().any(|(held, _)| *held == moved)
                            {
                                continue;
                            }
                            next.push((moved, note.clone()));
                        }
                    }
                }
                if changed {
                    if next.is_empty() {
                        edited.remove(key);
                    } else {
                        edited.set(key, Setting::Map(next));
                    }
                }
            }
            _ => {}
        }
    }
}

fn move_between_lists(
    original: &NodeFields,
    holder_kind: &str,
    target_kind: &str,
    slug: &str,
    names: &Names<'_>,
    edited: &mut Edited,
    kept: &mut Vec<KeptEntry>,
) {
    let destination = containment_key_for(holder_kind, target_kind);
    let names_target = |value: &str| names.moved(value).is_some();
    for key in CONTAINMENT_KEYS {
        let Some(Setting::List(_)) = original.get(key) else {
            continue;
        };
        let written = list_items(original.get(key));
        let mut hits: Vec<String> = Vec::new();
        for value in written.iter().filter(|value| names_target(value)) {
            let moved = names.moved(value).unwrap_or_else(|| value.clone());
            if !hits.contains(&moved) {
                hits.push(moved);
            }
        }
        if hits.is_empty() || destination == Some(key) {
            continue;
        }
        let destination_written = destination.and_then(|name| original.get(name));
        let destination_blocked = destination.is_none()
            || destination_written.is_some_and(|written| !matches!(written, Setting::List(_)));
        if destination_blocked {
            for reference in hits {
                kept.push(KeptEntry {
                    slug: slug.to_string(),
                    key: key.to_string(),
                    reference,
                    holder_kind: holder_kind.to_string(),
                });
            }
            continue;
        }
        let Some(destination) = destination else {
            continue;
        };
        let source = list_items(edited.next.get(key));
        let target = list_items(edited.next.get(destination));
        let already_listed = list_items(destination_written)
            .iter()
            .any(|value| names_target(value));
        let next_source: Vec<Setting> = source
            .into_iter()
            .filter(|value| !hits.contains(value))
            .map(Setting::Text)
            .collect();
        let next_target: Vec<Setting> = if already_listed {
            target.into_iter().map(Setting::Text).collect()
        } else {
            target
                .into_iter()
                .chain(hits)
                .map(Setting::Text)
                .collect()
        };
        edited.set(key, normalized_references(&next_source));
        edited.set(destination, normalized_references(&next_target));
    }
    if target_kind != "domain" {
        if let Some(parent) = original.text("domain").filter(|parent| names_target(parent)) {
            kept.push(KeptEntry {
                slug: slug.to_string(),
                key: "domain".to_string(),
                reference: names.moved(parent).unwrap_or_else(|| parent.to_string()),
                holder_kind: holder_kind.to_string(),
            });
        }
    }
}

/// Every document that refers to `redirect.from`, as it would read after the move. `Err` is a
/// referrer that could not be read.
pub fn plan_redirect(
    documents: &[LoadedDocument],
    redirect: &Redirect<'_>,
) -> Result<RedirectPlan, SourceRefusal> {
    let renaming = redirect.from != redirect.to;
    let mut plan = RedirectPlan::default();
    if !renaming && redirect.target_kind.is_none() {
        return Ok(plan);
    }
    let from_tail = tail(redirect.from);
    let tail_owners = documents
        .iter()
        .filter(|document| tail(document.slug()) == from_tail)
        .count();
    let names = Names {
        from: redirect.from,
        to: redirect.to,
        from_tail,
        to_tail: tail(redirect.to),
        can_rewrite_tail: tail_owners == 1
            && documents
                .iter()
                .any(|document| document.slug() == redirect.from),
    };
    for document in documents {
        let slug = document.slug();
        if slug == redirect.from || redirect.exclude.iter().any(|excluded| excluded == slug) {
            continue;
        }
        if !references_anything(document, &names, renaming, redirect.target_kind.is_some()) {
            continue;
        }
        let source = SourceDocument::read(document.file(), slug)?;
        let fields = NodeFields::from_frontmatter(source.document.frontmatter());
        let rewriting_self = slug == redirect.to;
        let mut edited = Edited {
            next: fields.clone(),
            touched: Vec::new(),
        };
        if renaming {
            redirect_references(&fields, &names, rewriting_self, &mut edited);
        }
        let mut kept = Vec::new();
        if let (Some(target_kind), false) = (redirect.target_kind, rewriting_self) {
            let holder_kind = fields.text("kind").map_or("", answer_format::whitespace::trim);
            move_between_lists(&fields, holder_kind, target_kind, slug, &names, &mut edited, &mut kept);
        }
        let body_text = source.document.raw().get(source.document.body_range());
        let moved_body = body_text
            .filter(|_| renaming)
            .and_then(|body| moved_links(body, &names));
        if edited.touched.is_empty() && moved_body.is_none() {
            plan.kept_in_place.extend(kept);
            continue;
        }
        if unwritable_slug_reason(slug).is_some() {
            plan.unwritable_referrers.push(slug.to_string());
            continue;
        }
        plan.kept_in_place.extend(kept);
        let changes: Vec<KeyChange> = edited
            .touched
            .iter()
            .map(|key| match edited.next.get(key) {
                Some(value) => KeyChange::set(key.clone(), value.clone()),
                None => KeyChange::remove(key.clone()),
            })
            .collect();
        let framed = edit_frontmatter(&source.raw, &changes)
            .map_err(|refusal| SourceRefusal::Unreadable {
                slug: slug.to_string(),
                cause: refusal.to_string(),
            })?;
        let text = match moved_body {
            Some(body) => {
                let at = Document::from_text(&framed).body_range().start;
                format!("{}{}", framed.get(..at).unwrap_or_default(), body)
            }
            None => framed,
        };
        plan.updates.push(ReferrerUpdate {
            slug: slug.to_string(),
            keys: edited.touched,
            body_changed: text_body_changed(&source, &text),
        });
        plan.rewrites.push(Rewrite { source, text });
    }
    Ok(plan)
}

fn text_body_changed(source: &SourceDocument, text: &str) -> bool {
    let before = source.raw.get(source.document.body_range()).unwrap_or_default();
    let after = Document::from_text(text);
    after.raw().get(after.body_range()).unwrap_or_default() != before
}

/// A cheap look before a file is read again: a document with no relation to the target and no
/// body link to it is skipped.
fn references_anything(
    document: &LoadedDocument,
    names: &Names<'_>,
    renaming: bool,
    changing_kind: bool,
) -> bool {
    let frontmatter = document.frontmatter();
    let in_frontmatter = frontmatter.iter().any(|(key, value)| match value {
        vault_document::frontmatter::Value::List(items) => {
            GRAPH_ARRAY_KEYS.contains(&key.as_str()) && items.iter().any(|item| names.moved(item).is_some())
        }
        vault_document::frontmatter::Value::Text(text) => {
            is_reference_slot(key.as_str()) && names.moved(text).is_some()
        }
        vault_document::frontmatter::Value::Map(members) => {
            key.as_str() == "relation_notes" && members.keys().any(|name| names.moved(name).is_some())
        }
        _ => false,
    });
    if in_frontmatter {
        return renaming || changing_kind;
    }
    if !renaming {
        return false;
    }
    names.can_rewrite_tail || document.links_to(names.from).unwrap_or(true)
}

/// The modification time a planned entry expects of a rewritten referrer.
pub fn expected_modified(rewrite: &Rewrite) -> Option<ModifiedTime> {
    rewrite.source.modified
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names<'a>(from: &'a str, to: &'a str, can_rewrite_tail: bool) -> Names<'a> {
        Names {
            from,
            to,
            from_tail: tail(from),
            to_tail: tail(to),
            can_rewrite_tail,
        }
    }

    #[test]
    fn a_tail_is_moved_only_while_the_name_belongs_to_one_node() {
        let unique = names("capabilities/foo", "capabilities/bar", true);
        assert_eq!(unique.moved("capabilities/foo").as_deref(), Some("capabilities/bar"));
        assert_eq!(unique.moved("foo").as_deref(), Some("bar"));
        assert_eq!(unique.moved("x/foo").as_deref(), Some("x/bar"));
        assert_eq!(unique.moved("food"), None);
        let shared = names("capabilities/foo", "capabilities/bar", false);
        assert_eq!(shared.moved("foo"), None);
        assert_eq!(shared.moved("capabilities/foo").as_deref(), Some("capabilities/bar"));
    }

    #[test]
    fn a_decomposed_hangul_reference_names_the_composed_slug() {
        let hangul = names("domains/\u{c8fc}\u{bb38}", "domains/order", false);
        assert_eq!(
            hangul.moved("domains/\u{110c}\u{116e}\u{1106}\u{116e}\u{11ab}").as_deref(),
            Some("domains/order")
        );
    }

    #[test]
    fn every_link_shape_moves_and_prose_paths_stay() {
        let moved = names("a/old", "a/new", true);
        let body = "[[a/old]] [[old#h|alias]] [x](a/old.md#top) [y](../a/old.md) a/old in prose [[other]]";
        assert_eq!(
            moved_links(body, &moved).as_deref(),
            Some("[[a/new]] [[new#h|alias]] [x](a/new.md#top) [y](../a/new.md) a/old in prose [[other]]")
        );
        assert_eq!(moved_links("nothing [[else]]", &moved), None);
    }
}
