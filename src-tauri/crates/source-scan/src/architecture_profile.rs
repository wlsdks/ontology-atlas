//! An architecture profile: a reviewed Markdown document that names the roles of a codebase by
//! path, which role may depend on which, and the evidence for those choices. This file reads one
//! from its frontmatter and finds the profiles of a vault; [`crate::architecture_conformance`]
//! measures source against one.
//!
//! A profile that does not read is refused with the sentence that says which key is wrong. Whether
//! a refusal is a wrong argument, a missing thing or any other failure is fixed here, where the
//! sentence is written, because agents branch on that code.

use std::collections::BTreeMap;

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use vault_document::frontmatter::{Frontmatter, Value};

pub const PROFILE_CONTRACT: &str = "architecture-profile/v1";

/// What kind of failure a refused profile is, as an agent's `errorCode` tells it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProfileErrorKind {
    /// A value the profile holds is not what it must be.
    Invalid,
    /// Something the profile names does not exist.
    NotFound,
    /// Any other refusal.
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileError {
    pub kind: ProfileErrorKind,
    pub message: String,
}

impl std::fmt::Display for ProfileError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ProfileError {}

impl ProfileError {
    fn invalid(message: String) -> Self {
        Self {
            kind: ProfileErrorKind::Invalid,
            message,
        }
    }
    fn failed(message: String) -> Self {
        Self {
            kind: ProfileErrorKind::Failed,
            message,
        }
    }
    fn not_found(message: String) -> Self {
        Self {
            kind: ProfileErrorKind::NotFound,
            message,
        }
    }
}

/// `axis:name`, such as `style:layered`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ProfilePattern {
    pub axis: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileRole {
    pub id: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DependencyPolicy {
    Explicit,
    LowerOnly,
}

impl DependencyPolicy {
    pub fn word(self) -> &'static str {
        match self {
            Self::Explicit => "explicit",
            Self::LowerOnly => "lower-only",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchitectureProfile {
    pub uid: String,
    pub slug: String,
    pub project_uid: String,
    pub title: String,
    pub patterns: Vec<ProfilePattern>,
    pub scope_paths: Vec<String>,
    pub exclude_paths: Vec<String>,
    /// In the order the profile ranks them (`role_order`, else by name).
    pub roles: Vec<ProfileRole>,
    pub dependency_policy: DependencyPolicy,
    /// Which import usages the rules govern: `value`, `type_only`.
    pub dependency_usages: Vec<String>,
    /// For each role that lists one, the roles it may depend on.
    pub allows: BTreeMap<String, Vec<String>>,
    pub evidence: Vec<String>,
    /// The slug of the document it was read from.
    pub document_slug: String,
}

const DEPENDENCY_USAGE_VALUES: [&str; 2] = ["value", "type_only"];

fn is_uuid_v4(text: &str) -> bool {
    const LENGTHS: [usize; 5] = [8, 4, 4, 4, 12];
    let groups: Vec<&str> = text.split('-').collect();
    let [_, _, version, variant, _] = groups.as_slice() else {
        return false;
    };
    groups.iter().zip(LENGTHS).all(|(group, length)| {
        group.len() == length
            && group
                .chars()
                .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
    }) && version.starts_with('4')
        && matches!(variant.chars().next(), Some('8' | '9' | 'a' | 'b'))
}

fn is_role_id(text: &str) -> bool {
    let mut characters = text.chars();
    characters.next().is_some_and(|c| c.is_ascii_lowercase())
        && characters.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// A locale is recognised by shape (two letters), never by the app's locale list.
fn is_locale(text: &str) -> bool {
    text.len() == 2 && text.chars().all(|c| c.is_ascii_lowercase())
}

fn non_blank(value: Option<&Value>, name: &str) -> Result<String, ProfileError> {
    match value {
        Some(Value::Text(text)) if !trim(text).is_empty() => Ok(trim(text).to_string()),
        _ => Err(ProfileError::invalid(format!(
            "{name} must be a non-empty string."
        ))),
    }
}

fn string_array(
    value: Option<&Value>,
    name: &str,
    allow_empty: bool,
) -> Result<Vec<String>, ProfileError> {
    let Some(Value::List(items)) = value else {
        return Err(ProfileError::invalid(format!(
            "{name} must be {} array of strings.",
            if allow_empty { "an" } else { "a non-empty" }
        )));
    };
    if !allow_empty && items.is_empty() {
        return Err(ProfileError::invalid(format!(
            "{name} must be a non-empty array of strings."
        )));
    }
    let mut rows: Vec<String> = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        rows.push(non_blank(
            Some(&Value::Text(item.clone())),
            &format!("{name}[{index}]"),
        )?);
    }
    let mut seen = std::collections::HashSet::new();
    if !rows.iter().all(|row| seen.insert(row.as_str())) {
        return Err(ProfileError::invalid(format!(
            "{name} must not contain duplicates."
        )));
    }
    Ok(rows)
}

fn parse_patterns(value: Option<&Value>) -> Result<Vec<ProfilePattern>, ProfileError> {
    string_array(value, "patterns", false)?
        .into_iter()
        .enumerate()
        .map(|(index, row)| {
            let separator = row.find(':').filter(|at| *at > 0 && *at + 1 < row.len());
            let Some(at) = separator else {
                return Err(ProfileError::failed(format!(
                    "patterns[{index}] must use axis:name."
                )));
            };
            Ok(ProfilePattern {
                axis: non_blank(
                    Some(&Value::Text(row[..at].to_string())),
                    &format!("patterns[{index}].axis"),
                )?,
                name: non_blank(
                    Some(&Value::Text(row[at + 1..].to_string())),
                    &format!("patterns[{index}].name"),
                )?,
            })
        })
        .collect()
}

fn parse_dependency_usages(value: Option<&Value>) -> Result<Vec<String>, ProfileError> {
    let Some(value) = value else {
        return Ok(DEPENDENCY_USAGE_VALUES
            .iter()
            .map(|usage| (*usage).to_string())
            .collect());
    };
    let usages = string_array(Some(value), "dependency_usages", false)?;
    if let Some(unsupported) = usages
        .iter()
        .find(|usage| !DEPENDENCY_USAGE_VALUES.contains(&usage.as_str()))
    {
        return Err(ProfileError::failed(format!(
            "dependency_usages contains unsupported usage: {unsupported}. Expected one of {}.",
            DEPENDENCY_USAGE_VALUES.join(", ")
        )));
    }
    Ok(usages)
}

pub fn parse_architecture_profile(
    frontmatter: &Frontmatter,
    document_slug: &str,
) -> Result<ArchitectureProfile, ProfileError> {
    if frontmatter.text("architecture_schema") != Some(PROFILE_CONTRACT) {
        return Err(ProfileError::invalid(format!(
            "architecture_schema must be {PROFILE_CONTRACT}."
        )));
    }
    let uid = non_blank(frontmatter.get("profile_uid"), "profile_uid")?;
    let project_uid = non_blank(frontmatter.get("project_uid"), "project_uid")?;
    if !is_uuid_v4(&uid) {
        return Err(ProfileError::invalid(
            "profile_uid must be a lowercase UUIDv4.".to_string(),
        ));
    }
    if !is_uuid_v4(&project_uid) {
        return Err(ProfileError::invalid(
            "project_uid must be a lowercase UUIDv4.".to_string(),
        ));
    }
    // An alias would keep two spellings of one policy in two parsers, and ignoring the key
    // would silently flip a profile's result.
    if frontmatter.contains_key("type_only_dependencies") {
        return Err(ProfileError::failed(
            "type_only_dependencies was replaced by dependency_usages: write dependency_usages: [value] for the old free, or omit the key for the old ruled.".to_string(),
        ));
    }

    let entries = frontmatter.in_object_order();
    // `summary_<id>`, not `role_summary_<id>`: every `role_*` key is a path group. The ids are
    // kept in the order the file wrote them, so the first problem reported is the first one read.
    let mut role_summaries: Vec<String> = Vec::new();
    let mut localized: Vec<(String, Vec<String>)> = Vec::new();
    for (key, value) in &entries {
        let Some(rest) = key.strip_prefix("summary_") else {
            continue;
        };
        let split = rest.rfind('_').filter(|at| *at > 0);
        let locale = split.map_or("", |at| &rest[at + 1..]);
        let id = match split {
            Some(at) if is_locale(locale) => &rest[..at],
            _ => rest,
        };
        if !is_role_id(id) {
            return Err(ProfileError::failed(format!(
                "Invalid architecture role id: {id}."
            )));
        }
        non_blank(Some(value), key)?;
        if id == rest {
            if !role_summaries.iter().any(|known| known == id) {
                role_summaries.push(id.to_string());
            }
        } else if let Some((_, locales)) = localized.iter_mut().find(|(known, _)| known == id) {
            if !locales.iter().any(|known| known == locale) {
                locales.push(locale.to_string());
            }
        } else {
            localized.push((id.to_string(), vec![locale.to_string()]));
        }
    }
    let mut role_paths: Vec<(String, Vec<String>)> = Vec::new();
    for (key, value) in &entries {
        let Some(id) = key.strip_prefix("role_") else {
            continue;
        };
        if *key == "role_order" {
            continue;
        }
        if !is_role_id(id) {
            return Err(ProfileError::failed(format!(
                "Invalid architecture role id: {id}."
            )));
        }
        role_paths.push((id.to_string(), string_array(Some(value), key, false)?));
    }
    if role_paths.len() < 2 {
        return Err(ProfileError::failed(
            "architecture profile needs at least two roles.".to_string(),
        ));
    }
    let has_role = |id: &str| role_paths.iter().any(|(known, _)| known == id);
    let role_order: Vec<String> = match frontmatter.get("role_order") {
        None => {
            let mut ids: Vec<String> = role_paths.iter().map(|(id, _)| id.clone()).collect();
            ids.sort_by(|left, right| answer_format::utf16::compare(left, right));
            ids
        }
        Some(value) => string_array(Some(value), "role_order", false)?,
    };
    if role_order.len() != role_paths.len() || role_order.iter().any(|id| !has_role(id)) {
        return Err(ProfileError::failed(
            "role_order must name every role exactly once.".to_string(),
        ));
    }
    for summary_id in &role_summaries {
        if !has_role(summary_id) {
            return Err(ProfileError::not_found(format!(
                "summary_{summary_id} describes a role that does not exist."
            )));
        }
    }
    // A translation of nothing is refused: a locale line may only restate the reviewed
    // canonical sentence.
    for (summary_id, locales) in &localized {
        for locale in locales {
            let key = format!("summary_{summary_id}_{locale}");
            if !has_role(summary_id) {
                return Err(ProfileError::not_found(format!(
                    "{key} describes a role that does not exist."
                )));
            }
            if !role_summaries.contains(summary_id) {
                return Err(ProfileError::failed(format!(
                    "{key} translates summary_{summary_id}, which this profile does not declare."
                )));
            }
        }
    }

    let dependency_policy = match frontmatter.get("dependency_policy") {
        None => DependencyPolicy::Explicit,
        Some(value) => match non_blank(Some(value), "dependency_policy")?.as_str() {
            "explicit" => DependencyPolicy::Explicit,
            "lower-only" => DependencyPolicy::LowerOnly,
            _ => {
                return Err(ProfileError::invalid(
                    "dependency_policy must be explicit or lower-only.".to_string(),
                ))
            }
        },
    };
    let mut allows: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for role_id in &role_order {
        let key = format!("allow_{role_id}");
        let Some(value) = frontmatter.get(&key) else {
            continue;
        };
        let targets = string_array(Some(value), &key, true)?;
        if let Some(unknown) = targets.iter().find(|target| !has_role(target)) {
            return Err(ProfileError::failed(format!(
                "{key} references unknown role: {unknown}."
            )));
        }
        allows.insert(role_id.clone(), targets);
    }

    let slug = non_blank(frontmatter.get("profile_slug"), "profile_slug")?;
    let title = non_blank(frontmatter.get("title"), "title")?;
    let patterns = parse_patterns(frontmatter.get("patterns"))?;
    let scope_paths = string_array(frontmatter.get("scope_paths"), "scope_paths", false)?;
    let exclude_paths = match frontmatter.get("exclude_paths") {
        None => Vec::new(),
        Some(value) => string_array(Some(value), "exclude_paths", false)?,
    };
    let dependency_usages = parse_dependency_usages(frontmatter.get("dependency_usages"))?;
    let evidence = string_array(frontmatter.get("evidence"), "evidence", false)?;
    let roles = role_order
        .iter()
        .map(|id| ProfileRole {
            id: id.clone(),
            paths: role_paths
                .iter()
                .find(|(known, _)| known == id)
                .map(|(_, paths)| paths.clone())
                .unwrap_or_default(),
        })
        .collect();
    Ok(ArchitectureProfile {
        uid,
        slug,
        project_uid,
        title,
        patterns,
        scope_paths,
        exclude_paths,
        roles,
        dependency_policy,
        dependency_usages,
        allows,
        evidence,
        document_slug: document_slug.to_string(),
    })
}

/// A document of the vault, as far as profiles are concerned: its slug and its frontmatter.
pub struct ProfileDocument<'a> {
    pub slug: &'a str,
    pub frontmatter: &'a Frontmatter,
}

/// A canonical text of a frontmatter, whatever order its keys were written in: two mirrors of one
/// profile can serialise differently.
fn fingerprint(frontmatter: &Frontmatter) -> String {
    let mut entries: Vec<(&String, &Value)> = frontmatter.iter().collect();
    entries.sort_by(|left, right| answer_format::utf16::compare(left.0, right.0));
    entries
        .iter()
        .map(|(key, value)| format!("{key}={}", serde_json_text(value)))
        .collect::<Vec<_>>()
        .join("\u{0}")
}

fn serde_json_text(value: &Value) -> String {
    answer_format::json::to_string(value).unwrap_or_default()
}

/// The profiles of `documents`, sorted by slug. An identical `profile_uid` and frontmatter is one
/// record reached twice (a generated mirror, a link) and is read once; any other repeat of a
/// slug is a real conflict that fails closed, naming both files.
pub fn find_architecture_profiles(
    documents: &[ProfileDocument<'_>],
) -> Result<Vec<ArchitectureProfile>, ProfileError> {
    let mut profiles: Vec<ArchitectureProfile> = Vec::new();
    let mut seen: BTreeMap<String, (String, String, String)> = BTreeMap::new();
    for document in documents {
        if document.frontmatter.text("architecture_schema") != Some(PROFILE_CONTRACT) {
            continue;
        }
        let profile = parse_architecture_profile(document.frontmatter, document.slug)?;
        let print = fingerprint(document.frontmatter);
        if let Some((uid, previous_print, previous_slug)) = seen.get(&profile.slug) {
            if *uid == profile.uid && *previous_print == print {
                continue;
            }
            return Err(ProfileError::failed(format!(
                "Duplicate architecture profile slug: {}. {previous_slug} and {} both declare it with different contents. Give one of them another profile_slug, or narrow the scan so only one is read.",
                profile.slug, document.slug
            )));
        }
        seen.insert(
            profile.slug.clone(),
            (profile.uid.clone(), print, document.slug.to_string()),
        );
        profiles.push(profile);
    }
    profiles.sort_by(|left, right| compare_text(&left.slug, &right.slug));
    Ok(profiles)
}

#[cfg(test)]
mod tests {
    use super::*;
    use vault_document::Document;

    fn profile_text(extra: &str) -> String {
        format!(
            "---\narchitecture_schema: architecture-profile/v1\nprofile_uid: 11111111-1111-4111-8111-111111111111\n\
             project_uid: 22222222-2222-4222-8222-222222222222\nprofile_slug: layers\ntitle: Layers\n\
             patterns: [style:layered]\nscope_paths: [src/**]\nrole_views: [src/views/**]\nrole_data: [src/data/**]\n\
             role_order: [views, data]\nevidence: [docs/ARCHITECTURE.md]\n{extra}---\nbody\n"
        )
    }

    fn parse(text: &str) -> Result<ArchitectureProfile, ProfileError> {
        let document = Document::from_text(text);
        parse_architecture_profile(document.frontmatter(), "layers")
    }

    #[test]
    fn a_profile_is_read_with_its_roles_in_rank_order_and_its_rules() {
        let profile = parse(&profile_text(
            "dependency_policy: lower-only\nallow_views: [data]\n",
        ))
        .expect("reads");
        let ids: Vec<&str> = profile.roles.iter().map(|role| role.id.as_str()).collect();
        assert_eq!(ids, ["views", "data"]);
        assert_eq!(profile.dependency_policy, DependencyPolicy::LowerOnly);
        assert_eq!(profile.allows["views"], ["data"]);
        assert_eq!(profile.dependency_usages, ["value", "type_only"]);
    }

    #[test]
    fn each_refusal_names_the_key_and_carries_the_kind_an_agent_branches_on() {
        let bad_policy = parse(&profile_text("dependency_policy: strict\n")).expect_err("refused");
        assert_eq!(
            bad_policy.message,
            "dependency_policy must be explicit or lower-only."
        );
        assert_eq!(bad_policy.kind, ProfileErrorKind::Invalid);
        let renamed = parse(&profile_text("type_only_dependencies: [x]\n")).expect_err("refused");
        assert_eq!(renamed.kind, ProfileErrorKind::Failed);
        let orphan =
            parse(&profile_text("summary_ghost: A role nobody has.\n")).expect_err("refused");
        assert_eq!(
            orphan.message,
            "summary_ghost describes a role that does not exist."
        );
        assert_eq!(orphan.kind, ProfileErrorKind::NotFound);
        let unknown = parse(&profile_text("allow_views: [nope]\n")).expect_err("refused");
        assert_eq!(
            unknown.message,
            "allow_views references unknown role: nope."
        );
    }

    #[test]
    fn two_documents_with_one_slug_are_one_record_only_when_they_are_identical() {
        let first = Document::from_text(&profile_text(""));
        let mirror = Document::from_text(&profile_text(""));
        let other = Document::from_text(&profile_text("dependency_policy: lower-only\n"));
        let documents = |a: &Document, b: &Document| {
            find_architecture_profiles(&[
                ProfileDocument {
                    slug: "a",
                    frontmatter: a.frontmatter(),
                },
                ProfileDocument {
                    slug: "b",
                    frontmatter: b.frontmatter(),
                },
            ])
        };
        assert_eq!(documents(&first, &mirror).expect("one record").len(), 1);
        let conflict = documents(&first, &other).expect_err("conflict");
        assert!(conflict
            .message
            .starts_with("Duplicate architecture profile slug: layers. a and b both declare it"));
    }
}
