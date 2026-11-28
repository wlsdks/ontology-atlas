//! `add_relations` (and the retired `add_relation`): draw edges between nodes that exist. An edge
//! and the reason for it are written in one change to the source node's frontmatter, so a failure
//! cannot leave a relation with no reason or a reason with no relation.

use answer_format::whitespace::trim;
use vault_edit::{
    exists, key_patch, normalized_references, refs_for, without_target, NodeFields, Setting,
    SourceDocument, typed_containment,
};

use super::answer_fields::{failed_row, output, Answer, Fields};
use super::object_checks::{allowed_keys, member, non_blank, plain_object};
use super::patch_document::{patch_document, source_refusal};
use super::relation_notes::{notes_of, notes_value, set_note};
use super::relation_types::{containment_notice, key_of, kind_of, relation_type};
use super::sent_setting::setting_of;
use super::vault_view::VaultView;
use super::write_aftermath::findings_on_written;
use super::write_gates::{require_graph_node, require_not_reserved};
use super::concept_effect::effect;
use super::expected_mtime::modified_ms;
use crate::arguments::Arguments;
use crate::audit::{ActivityContent, ShareMeasure, WriteDone, WriteRecord};
use crate::error::ToolError;
use crate::write_checkpoint::Permit;

const BATCH_ROWS_MAX: usize = 50;
const ROW_KEYS: [&str; 5] = ["from", "to", "type", "why", "expected_mtime"];

pub fn expected_mtime_of(value: Option<&Setting>) -> Result<Option<f64>, ToolError> {
    match value {
        None => Ok(None),
        Some(Setting::Number(number)) if number.is_finite() && *number >= 0.0 => Ok(Some(*number)),
        Some(_) => Err(ToolError::invalid(
            "expected_mtime must be a non-negative finite number.",
        )),
    }
}

/// The time a guarded call is given back: only when the caller proved it had read the file.
fn guarded_mtime(expected: Option<f64>, read: Option<f64>, current: Option<f64>) -> Option<Setting> {
    match (expected, read, current) {
        (Some(expected), Some(read), Some(current))
            if !vault_time(expected).differs_from(vault_time(read)) =>
        {
            Some(Setting::Number(current))
        }
        _ => None,
    }
}

fn vault_time(milliseconds: f64) -> confined_files::ModifiedTime {
    confined_files::ModifiedTime::from_milliseconds(milliseconds)
}

pub struct RelationRow {
    pub row: Setting,
    pub from: String,
    pub to: String,
    pub changed: bool,
    pub why: Option<String>,
}

fn add_relation(
    permit: &Permit<'_>,
    members: &[(String, Setting)],
    batch_row: bool,
) -> Result<RelationRow, ToolError> {
    let context = permit.context();
    let from = non_blank(member(members, "from"), "from")?;
    let to = non_blank(member(members, "to"), "to")?;
    let requested = relation_type(member(members, "type"), "type").or_else(|refusal| {
        non_blank(member(members, "type"), "type").and(Err(refusal))
    })?;
    let expected = expected_mtime_of(member(members, "expected_mtime"))?;
    let view = VaultView::read(permit)?;
    let canonical_from = view.resolve(from)?;
    let canonical_to = view.resolve(to)?;
    let from_kind = kind_of(&view, Some(canonical_from.as_deref().unwrap_or(from)));
    let to_kind = kind_of(&view, Some(canonical_to.as_deref().unwrap_or(to)));
    let typed = (requested == "contains")
        .then(|| typed_containment(from_kind.as_deref(), to_kind.as_deref()))
        .flatten();
    let relation = typed.unwrap_or(requested);
    let key = key_of(relation);
    let notice = containment_notice(requested, relation, from_kind.as_deref(), to_kind.as_deref());
    require_not_reserved(
        view.document(canonical_from.as_deref().unwrap_or(from)),
        "add_relations",
    )?;
    let Some(canonical_from) = canonical_from else {
        return Err(view.not_found("Source slug does not exist in vault", from, true));
    };
    let Some(canonical_to) = canonical_to else {
        return Err(view.not_found("Target slug does not exist in vault", to, true));
    };
    require_graph_node(view.document(&canonical_from), &canonical_from, "Source")?;
    require_graph_node(view.document(&canonical_to), &canonical_to, "Target")?;

    let writable = permit
        .write_path(&canonical_from)
        .map_err(|error| super::slug_refusal::slug_refusal(&error))?;
    let source = SourceDocument::read(writable.as_confined(), &canonical_from)
        .map_err(|refusal| source_refusal(&view, &canonical_from, refusal))?;
    let fields = NodeFields::from_frontmatter(source.document.frontmatter());
    let resolver = view.references();
    let unchanged = |notice: Option<&String>| {
        Fields::new()
            .with_bool("ok", true)
            .with_bool("alreadyExists", true)
            .with_bool("changed", false)
            .with_text("from", &canonical_from)
            .with_text("to", &canonical_to)
            .with_text("type", relation)
            .with_some(
                "mtime",
                guarded_mtime(expected, source.modified_ms(), source.modified_ms()),
            )
            .with_some("notice", notice.map(Setting::text))
            .into_setting()
    };
    let why = member(members, "why")
        .and_then(Setting::as_text)
        .map(trim)
        .filter(|why| !why.is_empty())
        .map(str::to_string);

    let (patch, wrote_notice) = if key == "domain" {
        if exists(&fields, "domain", &canonical_to, &resolver) {
            return Ok(RelationRow {
                row: unchanged(None),
                from: canonical_from,
                to: canonical_to,
                changed: false,
                why: why.clone(),
            });
        }
        if let Some(existing) = fields.text("domain").filter(|text| !trim(text).is_empty()) {
            return Err(ToolError::failed(format!(
                "Source slug already has domain \"{existing}\". Use patch_concept to change it explicitly."
            )));
        }
        (
            vec![("domain".to_string(), Setting::text(&canonical_to))],
            None,
        )
    } else {
        let existing = refs_for(&fields, key);
        let already = exists(&fields, key, &canonical_to, &resolver)
            || (typed.is_some() && exists(&fields, "contains", &canonical_to, &resolver));
        if already {
            return Ok(RelationRow {
                row: unchanged(notice.as_ref()),
                from: canonical_from,
                to: canonical_to,
                changed: false,
                why: why.clone(),
            });
        }
        if relation == "depends_on" && why.is_none() {
            return Err(ToolError::invalid(
                "why is required and must be nonblank for a new depends_on relation. Explain the stable semantic dependency after explicit human approval.",
            ));
        }
        let mut next = existing;
        next.push(Setting::text(&canonical_to));
        let Setting::List(next) = normalized_references(&next) else {
            return Err(ToolError::failed("a relation list could not be built"));
        };
        let mut patch = key_patch(&fields, key, next);
        if let Some(why) = &why {
            let mut notes = notes_of(&fields);
            set_note(&mut notes, &canonical_to, why);
            patch.push(("relation_notes".to_string(), notes_value(notes)));
        }
        (patch, notice)
    };
    let patched = patch_document(permit, &view, &canonical_from, &patch, None, expected)?;
    let findings = if batch_row {
        Vec::new()
    } else {
        findings_on_written(context, std::slice::from_ref(&canonical_from))
    };
    let row = Fields::new()
        .with_bool("ok", true)
        .with_bool("changed", true)
        .with_text("from", &canonical_from)
        .with_text("to", &canonical_to)
        .with_text("type", relation)
        .with_some(
            "mtime",
            expected.and(patched.modified_ms).map(Setting::Number),
        )
        .with_some("notice", wrote_notice.as_deref().map(Setting::text))
        .with_texts_if_any("findings", findings)
        .into_setting();
    Ok(RelationRow {
        row,
        from: canonical_from,
        to: canonical_to,
        changed: true,
        why,
    })
}

fn failed_relation(
    members: Option<&[(String, Setting)]>,
    label: &str,
    error: ToolError,
) -> Result<Setting, ToolError> {
    let text = |key: &str| {
        members
            .and_then(|members| member(members, key))
            .and_then(Setting::as_text)
            .unwrap_or_default()
            .to_string()
    };
    let fields = Fields::new()
        .with_bool("ok", false)
        .with_text("from", &text("from"))
        .with_text("to", &text("to"))
        .with_text("type", &text("type"));
    failed_row(fields, &error.naming_row(label))
}

pub fn call(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let Some(raw_rows) = arguments
        .elements("relations")
        .filter(|_| arguments.get("relations").is_some())
    else {
        return Err(ToolError::invalid(
            "relations must be an array of relation specs",
        ));
    };
    if raw_rows.is_empty() {
        return Ok(WriteDone {
            output: output(Fields::new().with("relations", Setting::List(Vec::new())))?,
            record: WriteRecord::Nothing,
        });
    }
    if raw_rows.len() > BATCH_ROWS_MAX {
        return Err(ToolError::invalid(format!(
            "Too many relations: {}. Max {BATCH_ROWS_MAX} per call — split into multiple add_relations batches.",
            raw_rows.len()
        )));
    }
    let context = permit.context();
    let mut results: Vec<Setting> = Vec::new();
    let mut done: Vec<Option<RelationRow>> = Vec::new();
    for (index, raw) in raw_rows.iter().enumerate() {
        let label = format!("relations[{index}]");
        let parsed = setting_of(raw)?;
        let outcome = plain_object(&parsed, &label).and_then(|members| {
            allowed_keys(members, &label, &ROW_KEYS)?;
            add_relation(permit, members, true)
        });
        match outcome {
            Ok(row) => {
                results.push(row.row.clone());
                done.push(Some(row));
            }
            Err(error) => {
                let members = match &parsed {
                    Setting::Map(members) => Some(members.as_slice()),
                    _ => None,
                };
                results.push(failed_relation(members, &label, error)?);
                done.push(None);
            }
        }
    }
    let wrote: Vec<&RelationRow> = done.iter().flatten().collect();
    let ok_rows = wrote.len();
    // A row's own `mtime` goes stale when a later row writes the same source, so the batch also
    // returns each touched source's time after the last row, for a source whose first changed row
    // was guarded by `expected_mtime`.
    let mut guarded: Vec<(String, bool)> = Vec::new();
    for row in wrote.iter().filter(|row| row.changed) {
        if !guarded.iter().any(|(from, _)| *from == row.from) {
            let proven = matches!(row.row.member("mtime"), Some(Setting::Number(_)));
            guarded.push((row.from.clone(), proven));
        }
    }
    let view = VaultView::read(permit)?;
    let mut mtimes: Vec<(String, Setting)> = Vec::new();
    for (from, proven) in &guarded {
        let at = view
            .document(from)
            .and_then(|document| modified_ms(document.file()));
        if let (true, Some(at)) = (proven, at) {
            mtimes.push((from.clone(), Setting::Number(at)));
        }
    }
    let mut touched: Vec<String> = Vec::new();
    for row in wrote.iter().filter(|row| row.changed) {
        if !touched.contains(&row.from) {
            touched.push(row.from.clone());
        }
    }
    let findings = findings_on_written(context, &touched);
    let answer = Fields::new()
        .with("relations", Setting::List(results))
        .with_some(
            "mtimes",
            (!mtimes.is_empty()).then_some(Setting::Map(mtimes)),
        )
        .with_texts_if_any("findings", findings);
    let out = output(answer)?;
    if ok_rows == 0 {
        return Ok(WriteDone {
            output: out,
            record: WriteRecord::Nothing,
        });
    }
    let mut reasons: Vec<String> = Vec::new();
    for why in wrote.iter().filter_map(|row| row.why.clone()) {
        if !reasons.contains(&why) {
            reasons.push(why);
        }
    }
    let changed_from: Vec<&str> = wrote
        .iter()
        .filter(|row| row.changed)
        .map(|row| row.from.as_str())
        .collect();
    Ok(WriteDone {
        output: out,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: "(batch)".to_string(),
                summary: format!("add_relations {ok_rows} rows written"),
                why: (!reasons.is_empty()).then(|| reasons.join(" · ")),
                logged_as: None,
            },
            concepts: effect(&[], &changed_from, &[]),
            share: ShareMeasure::Unchanged,
        },
    })
}

/// The retired `add_relation`: one row, answered as the row.
pub fn call_one(permit: &Permit<'_>, arguments: &Arguments) -> Result<WriteDone, ToolError> {
    let mut members: Vec<(String, Setting)> = Vec::new();
    for key in arguments.keys() {
        if let Some(raw) = arguments.get(key) {
            members.push((key.to_string(), setting_of(raw)?));
        }
    }
    let row = add_relation(permit, &members, false)?;
    let relation_type = member(&members, "type")
        .and_then(Setting::as_text)
        .unwrap_or_default();
    Ok(WriteDone {
        output: crate::answer::ToolOutput::json(&Answer(&row.row))?,
        record: WriteRecord::Wrote {
            activity: ActivityContent {
                target: row.from.clone(),
                summary: format!("{} --{relation_type}--> {}", row.from, row.to),
                why: member(&members, "why").and_then(Setting::as_text).map(str::to_string),
                logged_as: None,
            },
            concepts: if row.changed {
                effect(&[], &[&row.from], &[])
            } else {
                effect(&[], &[], &[])
            },
            share: ShareMeasure::Unchanged,
        },
    })
}

#[allow(dead_code, reason = "used by remove_relation for the same checks")]
pub fn without(refs: Vec<Setting>, canonical: &str, view: &VaultView<'_>) -> Vec<Setting> {
    without_target(refs, canonical, &view.references())
}
