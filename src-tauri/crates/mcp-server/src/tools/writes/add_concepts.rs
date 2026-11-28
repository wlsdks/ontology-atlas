//! `add_concepts` (and the retired `add_concept`): create nodes. Each row is its own write, so one
//! failing row is reported as `ok: false` and the rest still land; use one call per row for an
//! all-or-nothing add.

use std::collections::BTreeSet;

use answer_format::whitespace::trim;
use confined_files::PlanEntry;
use vault_document::schema::flat_slug_issue;
use vault_edit::{
    check_node_identity, new_file, new_node_fields, NewNode, NodeFields, NodeUids, Setting,
    CREATABLE_KINDS,
};

use super::answer_fields::{failed_row, output, Answer, Fields};
use super::object_checks::{
    allowed_keys, non_blank, one_of, optional_non_blank, optional_text_list, plain_object,
};
use super::sent_setting::setting_of;
use super::slug_refusal::slug_refusal;
use super::vault_view::VaultView;
use super::write_aftermath::{
    coverage_change, findings_on_written, measure_coverage, share_counts, source_state,
};
use super::write_gates::{member, refuse_recheck_mark};
use super::write_support::{
    created_by, effect, identity_refusal, modified_ms, SessionUids,
};
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::error::{ConflictDetails, ToolError};
use crate::write_checkpoint::Permit;

const BATCH_ROWS_MAX: usize = 50;
const GRAPH_REF_ARRAY_MAX_ITEMS: usize = 500;
const ROW_KEYS: [&str; 10] = [
    "slug",
    "kind",
    "title",
    "domain",
    "domains",
    "capabilities",
    "elements",
    "path",
    "body",
    "labels",
];

/// `display_<locale>` for each label worth keeping, in the order sent.
fn locale_labels(labels: Option<&Setting>) -> Vec<(String, String)> {
    let Some(Setting::Map(members)) = labels else {
        return Vec::new();
    };
    members
        .iter()
        .filter(|(locale, _)| locale.len() == 2 && locale.bytes().all(|byte| byte.is_ascii_lowercase()))
        .filter_map(|(locale, value)| {
            let text = trim(value.as_text()?);
            (!text.is_empty()).then(|| (format!("display_{locale}"), text.to_string()))
        })
        .collect()
}

fn locale_codes_of_vault(view: &VaultView<'_>) -> BTreeSet<String> {
    let mut codes = BTreeSet::new();
    for document in view.documents() {
        for (key, _) in document.frontmatter().iter() {
            let name = key.as_str();
            if let Some(code) = name.strip_prefix("display_") {
                if code.len() == 2 && code.bytes().all(|byte| byte.is_ascii_lowercase()) {
                    codes.insert(code.to_string());
                }
            }
        }
    }
    codes
}

fn normalized_title(title: &str) -> String {
    trim(title)
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// A node whose title a new one is compared with.
struct KnownTitle {
    slug: String,
    held_title: String,
    kind: String,
}

impl KnownTitle {
    fn of(document: &vault_document::LoadedDocument) -> Self {
        let frontmatter = document.frontmatter();
        Self {
            slug: document.slug().to_string(),
            held_title: frontmatter
                .truthy("title")
                .or_else(|| frontmatter.truthy("name"))
                .map_or_else(|| document.slug().to_string(), |value| value.display_text()),
            kind: frontmatter.text("kind").unwrap_or("unknown").to_string(),
        }
    }
}

fn known_titles(view: &VaultView<'_>) -> Vec<KnownTitle> {
    view.documents().iter().map(KnownTitle::of).collect()
}

/// Advisory: exact match after lowercasing and collapsing whitespace, since fuzzy matching flags
/// different concepts (auth-login vs auth-logout). It never blocks.
fn duplicate_title_warning(known: &[KnownTitle], title: &str, slug: &str) -> Option<String> {
    let wanted = normalized_title(title);
    if wanted.is_empty() {
        return None;
    }
    known
        .iter()
        .find(|other| other.slug != slug && normalized_title(&other.held_title) == wanted)
        .map(|other| {
            format!(
                "a node titled \"{title}\" already exists at \"{}\" (kind: {}): if this is the same concept, patch_concept on \"{}\" instead of adding a duplicate.",
                other.slug, other.kind, other.slug
            )
        })
}

struct Row<'a> {
    members: &'a [(String, Setting)],
}

impl Row<'_> {
    fn get(&self, key: &str) -> Option<&Setting> {
        member(self.members, key)
    }
}

/// Everything one row writes, once its fields are known to be well formed.
fn new_node_of(row: &Row<'_>, created_by: String) -> Result<NewNode, ToolError> {
    let slug = non_blank(row.get("slug"), "slug")?.to_string();
    non_blank(row.get("kind"), "kind")?;
    let title = non_blank(row.get("title"), "title")?.to_string();
    let domain = optional_non_blank(row.get("domain"), "domain")?.map(str::to_string);
    let domains = optional_text_list(row.get("domains"), "domains", GRAPH_REF_ARRAY_MAX_ITEMS)?;
    let capabilities =
        optional_text_list(row.get("capabilities"), "capabilities", GRAPH_REF_ARRAY_MAX_ITEMS)?;
    let elements = optional_text_list(row.get("elements"), "elements", GRAPH_REF_ARRAY_MAX_ITEMS)?;
    let path = optional_non_blank(row.get("path"), "path")?.map(str::to_string);
    if row.get("body").is_some_and(|body| body.as_text().is_none()) {
        return Err(ToolError::invalid("body must be a string."));
    }
    let kind = one_of(row.get("kind"), "kind", &CREATABLE_KINDS)?.to_string();
    if domains.is_some() && kind != "project" {
        return Err(ToolError::failed(format!(
            "domains lists a project's domains; a {kind} names its one parent domain in `domain`."
        )));
    }
    Ok(NewNode {
        slug,
        kind,
        title,
        domain,
        domains,
        capabilities,
        elements,
        path,
        display_names: locale_labels(row.get("labels")),
        created_by,
    })
}

fn expected_field_warnings(kind: &str, fields: &NodeFields) -> Vec<String> {
    let expected: &[&str] = match kind {
        "capability" | "element" => &["domain"],
        _ => &[],
    };
    expected
        .iter()
        .filter(|key| match fields.get(key) {
            None => true,
            Some(Setting::Text(text)) => trim(text).is_empty(),
            Some(_) => false,
        })
        .map(|key| format!("expected field \"{key}\" missing for kind \"{kind}\""))
        .collect()
}

fn partial_locale_warning(vault_locales: &BTreeSet<String>, used: &[(String, String)]) -> Option<String> {
    let own: BTreeSet<String> = used
        .iter()
        .filter_map(|(key, _)| key.strip_prefix("display_").map(str::to_string))
        .collect();
    let all: BTreeSet<&String> = vault_locales.iter().chain(own.iter()).collect();
    let missing: Vec<&&String> = all.iter().filter(|code| !own.contains(**code)).collect();
    if all.len() < 2 || missing.is_empty() {
        return None;
    }
    let names: Vec<String> = missing.iter().map(|code| format!("\"{code}\"")).collect();
    let listed: Vec<&str> = all.iter().map(|code| code.as_str()).collect();
    Some(format!(
        "labels has no {}, which other nodes in this vault use; add it (labels: {{ {} }}) so those readers see a native name",
        names.join(", "),
        listed.join(", ")
    ))
}

/// What one written row reports.
struct Landed {
    slug: String,
    title: String,
    kind: String,
    row: Setting,
}

/// The titles a row is compared with: the vault as it is when a single node is added; for a batch,
/// the vault before the batch plus the rows that landed.
enum TitlePool<'a> {
    Vault,
    Batch(&'a [KnownTitle]),
}

fn add_one(
    permit: &Permit<'_>,
    row: &Row<'_>,
    vault_locales: &BTreeSet<String>,
    pool: &TitlePool<'_>,
) -> Result<Landed, ToolError> {
    let context = permit.context();
    let node = new_node_of(row, created_by(context))?;
    let body = row.get("body").and_then(Setting::as_text);
    let uid = SessionUids.mint();
    let fields = new_node_fields(&node, &uid)
        .ok_or_else(|| ToolError::failed(format!("Unknown kind: {}.", node.kind)))?;
    let view = VaultView::read(permit)?;
    let duplicate = match pool {
        TitlePool::Vault => duplicate_title_warning(&known_titles(&view), &node.title, &node.slug),
        TitlePool::Batch(_) => None,
    };
    let writable = permit
        .write_path(&node.slug)
        .map_err(|error| slug_refusal(&error))?;
    if writable.as_confined().exists() {
        return Err(ToolError::conflict_with(
            format!(
                "Doc already exists at \"{}\". To update fields, use patch_concept(slug, frontmatter, body, expected_mtime). To rename, use rename_concept(oldSlug, newSlug). Never delete-then-add: that loses backlinks.",
                node.slug
            ),
            ConflictDetails {
                subject: "Doc already exists",
                slug: node.slug.clone(),
                recovery_tools: vec!["patch_concept", "rename_concept"],
                avoid_tools: vec!["delete_concept"],
                ..ConflictDetails::default()
            },
        ));
    }
    if let Some(issue) = flat_slug_issue(&node.kind, &node.slug) {
        return Err(ToolError::failed(issue));
    }
    check_node_identity(view.documents(), &node.slug, &fields)
        .map_err(|refusal| identity_refusal(&refusal))?;
    let default_body = vault_document::starter_body::starter_body(&node.kind, &node.title).unwrap_or_default();
    let text = new_file(fields.entries(), body.unwrap_or(&default_body));
    let file = writable.as_confined().clone();
    permit.apply(
        vec![PlanEntry::write(writable, text).expecting_absent()],
        confined_files::Reservations::Refuse(&|path, text| vault_edit::reservation_in(path, text)),
    )?;
    let mut warnings = expected_field_warnings(&node.kind, &fields);
    warnings.extend(duplicate);
    if let Some(warning) = partial_locale_warning(vault_locales, &node.display_names) {
        warnings.push(warning);
    }
    if let TitlePool::Batch(known) = pool {
        warnings.extend(duplicate_title_warning(known, &node.title, &node.slug));
    }
    let findings = match pool {
        TitlePool::Batch(_) => Vec::new(),
        TitlePool::Vault => findings_on_written(context, std::slice::from_ref(&node.slug)),
    };
    let row = Fields::new()
        .with_bool("ok", true)
        .with_text("slug", &node.slug)
        .with_bool("changed", true)
        .with_number("mtime", modified_ms(&file))
        .with_texts_if_any("warnings", warnings)
        .with_texts_if_any("findings", findings)
        .into_setting();
    Ok(Landed {
        slug: node.slug,
        title: node.title,
        kind: node.kind,
        row,
    })
}

fn duplicate_in_batch(index: usize, slug: &str, first: usize) -> ToolError {
    let first_seen = format!("concepts[{first}]");
    ToolError::conflict_with(
        format!("concepts[{index}] duplicate slug in input batch; first seen at {first_seen}"),
        ConflictDetails {
            row_name: Some(format!("concepts[{index}]")),
            subject: "Duplicate slug in input batch",
            slug: slug.to_string(),
            first_seen_at: Some(first_seen),
            ..ConflictDetails::default()
        },
    )
}

fn batch_row(
    permit: &Permit<'_>,
    raw: &Setting,
    index: usize,
    seen: &mut Vec<(String, usize)>,
    vault_locales: &BTreeSet<String>,
    known: &[KnownTitle],
) -> Result<Landed, (String, ToolError)> {
    let label = format!("concepts[{index}]");
    let mut slug = String::new();
    let mut attempt = || -> Result<Landed, ToolError> {
        let members = plain_object(raw, &label)?;
        slug = member(members, "slug")
            .and_then(Setting::as_text)
            .unwrap_or_default()
            .to_string();
        refuse_recheck_mark(members, &label)?;
        allowed_keys(members, &label, &ROW_KEYS)?;
        if let Some((_, first)) = seen.iter().find(|(held, _)| !slug.is_empty() && *held == slug) {
            return Err(duplicate_in_batch(index, &slug, *first));
        }
        if !slug.is_empty() {
            seen.push((slug.clone(), index));
        }
        add_one(permit, &Row { members }, vault_locales, &TitlePool::Batch(known))
    };
    let result = attempt();
    result.map_err(|error| (slug.clone(), error))
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let Some(raw_rows) = arguments.elements("concepts").filter(|_| arguments.get("concepts").is_some()) else {
        return Err(ToolError::invalid(
            "concepts must be an array of concept specs",
        ));
    };
    if raw_rows.is_empty() {
        return nothing_written(output(Fields::new().with("concepts", Setting::List(Vec::new())))?);
    }
    if raw_rows.len() > BATCH_ROWS_MAX {
        return Err(ToolError::invalid(format!(
            "Too many concepts: {}. Max {BATCH_ROWS_MAX} per call — split into multiple add_concepts batches.",
            raw_rows.len()
        )));
    }
    let context = permit.context();
    let rows: Vec<Setting> = raw_rows
        .iter()
        .map(|raw| setting_of(raw))
        .collect::<Result<_, _>>()?;
    let before_view = VaultView::read(permit)?;
    let before = measure_coverage(context, before_view.documents());
    let mut known = known_titles(&before_view);
    let mut vault_locales = locale_codes_of_vault(&before_view);
    for row in &rows {
        if let Setting::Map(members) = row {
            for (key, _) in locale_labels(member(members, "labels")) {
                if let Some(code) = key.strip_prefix("display_") {
                    vault_locales.insert(code.to_string());
                }
            }
        }
    }
    drop(before_view);
    let mut seen: Vec<(String, usize)> = Vec::new();
    let mut results: Vec<Setting> = Vec::new();
    let mut written: Vec<String> = Vec::new();
    for (index, raw) in rows.iter().enumerate() {
        match batch_row(permit, raw, index, &mut seen, &vault_locales, &known) {
            Ok(landed) => {
                known.push(KnownTitle {
                    slug: landed.slug.clone(),
                    held_title: landed.title.clone(),
                    kind: landed.kind.clone(),
                });
                written.push(landed.slug);
                results.push(landed.row);
            }
            Err((slug, error)) => {
                let fields = Fields::new().with_text("slug", &slug).with_bool("ok", false);
                results.push(failed_row(fields, &error)?);
            }
        }
    }
    let findings = findings_on_written(context, &written);
    let after_view = VaultView::read(permit)?;
    let after = (!written.is_empty())
        .then(|| measure_coverage(context, after_view.documents()))
        .flatten();
    let change = if written.is_empty() {
        None
    } else {
        coverage_change(before.as_ref(), after.as_ref())
    };
    let answer = Fields::new()
        .with("concepts", Setting::List(results))
        .with_texts_if_any("findings", findings)
        .with_some("coverage", change);
    if written.is_empty() {
        return nothing_written(output(answer)?);
    }
    let counts = share_counts(after.as_ref(), source_state(context));
    let summary = format!("add_concepts {} rows written", written.len());
    let target = match written.as_slice() {
        [only] => only.clone(),
        _ => "(batch)".to_string(),
    };
    let added: Vec<&str> = written.iter().map(String::as_str).collect();
    Ok(WriteDone {
        output: output(answer)?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target,
                summary,
                why: None,
                logged_as: None,
            },
            concepts: effect(&added, &[], &[]),
            share: ShareMeasure::Measure(Box::new(move || counts)),
        },
    })
}

fn nothing_written(output: crate::answer::ToolOutput) -> Result<WriteDone, ToolError> {
    Ok(WriteDone {
        output,
        record: WriteRecord::Nothing,
    })
}

/// The retired `add_concept`: one row, answered as the row.
pub fn call_one(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let mut members: Vec<(String, Setting)> = Vec::new();
    for key in arguments.keys() {
        if let Some(raw) = arguments.get(key) {
            members.push((key.to_string(), setting_of(raw)?));
        }
    }
    let view = VaultView::read(permit)?;
    let vault_locales = locale_codes_of_vault(&view);
    drop(view);
    let landed = add_one(permit, &Row { members: &members }, &vault_locales, &TitlePool::Vault)?;
    let context = permit.context();
    let after_view = VaultView::read(permit)?;
    let coverage = measure_coverage(context, after_view.documents());
    let counts = share_counts(coverage.as_ref(), source_state(context));
    let kind = member(&members, "kind").and_then(Setting::as_text).unwrap_or_default();
    Ok(WriteDone {
        output: crate::answer::ToolOutput::json(&Answer(&landed.row))?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: landed.slug.clone(),
                summary: format!("add_concept {kind}:{}", landed.slug),
                why: None,
                logged_as: None,
            },
            concepts: effect(&[&landed.slug], &[], &[]),
            share: ShareMeasure::Measure(Box::new(move || counts)),
        },
    })
}
