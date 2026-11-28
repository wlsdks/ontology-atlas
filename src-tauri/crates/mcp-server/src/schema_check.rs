//! Checks a value against the JSON Schema subset the tool input contracts use: `type`, `enum`,
//! `properties`, `required`, `additionalProperties: false`, `items`, `minItems`/`maxItems`,
//! `uniqueItems`, `minLength`/`maxLength`, `pattern`, `minimum`/`maximum`, `format: date-time`,
//! `anyOf` and `examples`.
//!
//! A tool may advertise a short schema for a deep argument and keep the full one here
//! (`surface/review-input-schemas.json`, written by `scripts/mcp/differential/write-review-schemas.mjs`
//! from the script server's own contracts). A call that breaks the full contract is refused with
//! the field, the rule it broke, the shape of the object it sits in, one valid example of the field
//! and the nearest documented rule, so one retry can repair it. Both servers write those words, so
//! the text is the script server's: lengths are UTF-16 units, numbers are written as JavaScript
//! writes them and an object lists its keys in JavaScript's order.

use std::collections::HashSet;
use std::fmt;
use std::sync::OnceLock;

use answer_format::json::quote;
use answer_format::key_order::in_object_order;
use answer_format::number;
use answer_format::utf16;
use indexmap::IndexMap;
use regex::Regex;
use serde::de::{self, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::ToolError;
use crate::suggestions::closest_allowed_value;

const SHAPE_MAX_CHARS: usize = 900;
const EXAMPLE_MAX_CHARS: usize = 900;
/// Longest slice of a received value a refusal repeats.
const ECHO_MAX_CHARS: usize = 120;
/// Deeper than any checked contract; a value nested past it is refused before the walk.
const MAX_NESTING: usize = 64;
const NON_BLANK_STRING: &str = "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$";
const SHA256_DIGEST: &str = "^sha256:[a-f0-9]{64}$";
const SCHEMAS: &str = include_str!("../surface/review-input-schemas.json");

/// A JSON value that keeps the order its object keys arrived in, which `serde_json::Value` does not.
#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Number(f64),
    Text(String),
    List(Vec<Json>),
    Object(IndexMap<String, Json>),
}

impl<'de> Deserialize<'de> for Json {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Reader;
        impl<'de> Visitor<'de> for Reader {
            type Value = Json;
            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a JSON value")
            }
            fn visit_unit<E>(self) -> Result<Json, E> {
                Ok(Json::Null)
            }
            fn visit_bool<E>(self, value: bool) -> Result<Json, E> {
                Ok(Json::Bool(value))
            }
            fn visit_i64<E>(self, value: i64) -> Result<Json, E> {
                Ok(Json::Number(value as f64))
            }
            fn visit_u64<E>(self, value: u64) -> Result<Json, E> {
                Ok(Json::Number(value as f64))
            }
            fn visit_f64<E>(self, value: f64) -> Result<Json, E> {
                Ok(Json::Number(value))
            }
            fn visit_str<E: de::Error>(self, value: &str) -> Result<Json, E> {
                Ok(Json::Text(value.to_string()))
            }
            fn visit_string<E>(self, value: String) -> Result<Json, E> {
                Ok(Json::Text(value))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Json, A::Error> {
                let mut items = Vec::new();
                while let Some(item) = seq.next_element()? {
                    items.push(item);
                }
                Ok(Json::List(items))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Json, A::Error> {
                let mut fields = IndexMap::new();
                while let Some((key, value)) = map.next_entry::<String, Json>()? {
                    // The last of a repeated key wins, in the place the first took: JSON.parse.
                    fields.insert(key, value);
                }
                Ok(Json::Object(fields))
            }
        }
        deserializer.deserialize_any(Reader)
    }
}

impl Json {
    fn field(&self, name: &str) -> Option<&Json> {
        match self {
            Json::Object(fields) => fields.get(name),
            _ => None,
        }
    }

    fn text(&self) -> Option<&str> {
        match self {
            Json::Text(text) => Some(text),
            _ => None,
        }
    }

    fn number(&self) -> Option<f64> {
        match self {
            Json::Number(value) => Some(*value),
            _ => None,
        }
    }

    fn list(&self) -> Option<&[Json]> {
        match self {
            Json::List(items) => Some(items),
            _ => None,
        }
    }

    /// `JSON.stringify(value)`.
    fn stringify(&self) -> String {
        match self {
            Json::Null => "null".to_string(),
            Json::Bool(value) => value.to_string(),
            Json::Number(value) => number::text(*value),
            Json::Text(text) => quote(text),
            Json::List(items) => format!(
                "[{}]",
                items.iter().map(Json::stringify).collect::<Vec<_>>().join(",")
            ),
            Json::Object(fields) => format!(
                "{{{}}}",
                in_object_order(fields.iter())
                    .into_iter()
                    .map(|(key, value)| format!("{}:{}", quote(key), value.stringify()))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
        }
    }

    fn to_value(&self) -> Value {
        match self {
            Json::Null => Value::Null,
            Json::Bool(value) => Value::Bool(*value),
            Json::Number(value) => {
                if value.fract() == 0.0 && value.abs() < 9e15 {
                    json!(*value as i64)
                } else {
                    json!(value)
                }
            }
            Json::Text(text) => Value::String(text.clone()),
            Json::List(items) => Value::Array(items.iter().map(Json::to_value).collect()),
            Json::Object(fields) => {
                Value::Object(fields.iter().map(|(key, value)| (key.clone(), value.to_value())).collect())
            }
        }
    }
}

/// The contracts the script server keeps whole.
pub struct ReviewSchemas {
    pub proposal: Json,
    pub qualification: Json,
}

pub fn review_schemas() -> &'static ReviewSchemas {
    static LOADED: OnceLock<ReviewSchemas> = OnceLock::new();
    LOADED.get_or_init(|| {
        let mut whole: IndexMap<String, Json> =
            serde_json::from_str(SCHEMAS).unwrap_or_default();
        ReviewSchemas {
            proposal: whole.shift_remove("proposal").unwrap_or(Json::Null),
            qualification: whole.shift_remove("qualification").unwrap_or(Json::Null),
        }
    })
}

/// A refusal that carries, until a schema with a description wraps it, the words so far.
struct Failure {
    message: String,
    fields: Vec<(&'static str, Value)>,
    described: bool,
}

type Check = Result<(), Failure>;

fn type_of(value: &Json) -> &'static str {
    match value {
        Json::Null => "null",
        Json::List(_) => "array",
        Json::Number(number) => {
            if number.fract() == 0.0 && number.is_finite() {
                "integer"
            } else {
                "number"
            }
        }
        Json::Text(_) => "string",
        Json::Bool(_) => "boolean",
        Json::Object(_) => "object",
    }
}

fn matches_type(value: &Json, wanted: &str) -> bool {
    let actual = type_of(value);
    if wanted == "number" {
        return actual == "number" || actual == "integer";
    }
    actual == wanted
}

fn type_text(name: &str) -> String {
    match name {
        "object" => "an object",
        "array" => "an array",
        "string" => "a string",
        "integer" => "an integer",
        "number" => "a number",
        "boolean" => "a boolean",
        "null" => "null",
        other => other,
    }
    .to_string()
}

fn schema_types(schema: &Json) -> Option<Vec<&str>> {
    match schema.field("type")? {
        Json::Text(name) => Some(vec![name]),
        Json::List(names) => Some(names.iter().filter_map(Json::text).collect()),
        _ => None,
    }
}

fn types_text(schema: &Json) -> String {
    schema_types(schema)
        .unwrap_or_default()
        .iter()
        .map(|name| type_text(name))
        .collect::<Vec<_>>()
        .join(" or ")
}

/// A received value as a refusal may repeat it: a string JSON-escaped and cut to
/// `ECHO_MAX_CHARS`, a scalar as written, anything else by its type.
fn echo(value: &Json) -> String {
    match value {
        Json::Text(text) => {
            let length = utf16::len(text);
            if length <= ECHO_MAX_CHARS {
                quote(text)
            } else {
                format!("{}\u{2026} ({length} characters)", quote(utf16::prefix(text, ECHO_MAX_CHARS)))
            }
        }
        Json::Null => "null".to_string(),
        Json::Number(value) => number::text(*value),
        Json::Bool(value) => value.to_string(),
        other => type_text(type_of(other)),
    }
}

fn is_plain_name(key: &str) -> bool {
    !key.is_empty()
        && utf16::len(key) <= 64
        && key
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '$' | '-'))
}

fn echo_name(key: &str) -> String {
    if is_plain_name(key) {
        key.to_string()
    } else {
        echo(&Json::Text(key.to_string()))
    }
}

fn number_text(value: &Json) -> String {
    value.number().map(number::text).unwrap_or_default()
}

/// One-line picture of a schema: `{a, b?: string, c: "x"|"y"}`, objects two levels deep.
fn describe_shape(schema: &Json, depth: usize) -> String {
    let Json::Object(fields) = schema else {
        return "any".to_string();
    };
    if let Some(options) = schema.field("anyOf").and_then(Json::list) {
        return options
            .iter()
            .map(|option| describe_shape(option, depth))
            .collect::<Vec<_>>()
            .join(" | ");
    }
    if let Some(values) = schema.field("enum").and_then(Json::list) {
        return values.iter().map(Json::stringify).collect::<Vec<_>>().join("|");
    }
    let type_name = match schema.field("type") {
        Some(Json::List(names)) => Some(names.iter().filter_map(Json::text).collect::<Vec<_>>().join("|")),
        Some(Json::Text(name)) => Some(name.clone()),
        _ => None,
    };
    if type_name.as_deref() == Some("array") {
        let mut bounds = Vec::new();
        if let Some(minimum) = schema.field("minItems") {
            bounds.push(format!("\u{2265}{}", number_text(minimum)));
        }
        if let Some(maximum) = schema.field("maxItems") {
            bounds.push(format!("\u{2264}{}", number_text(maximum)));
        }
        let items = fields
            .get("items")
            .map_or_else(|| "any".to_string(), |items| describe_shape(items, depth));
        return format!("{items}[{}]", bounds.join(" "));
    }
    if type_name.as_deref() == Some("object") {
        if let Some(Json::Object(properties)) = schema.field("properties") {
            if depth == 0 {
                return "{\u{2026}}".to_string();
            }
            let required: HashSet<&str> = schema
                .field("required")
                .and_then(Json::list)
                .map(|names| names.iter().filter_map(Json::text).collect())
                .unwrap_or_default();
            let described: Vec<String> = in_object_order(properties.iter())
                .into_iter()
                .map(|(key, child)| {
                    format!(
                        "{key}{}: {}",
                        if required.contains(key.as_str()) { "" } else { "?" },
                        describe_shape(child, depth - 1)
                    )
                })
                .collect();
            return format!("{{{}}}", described.join(", "));
        }
    }
    if matches!(type_name.as_deref(), Some("number" | "integer")) {
        if let Some(minimum) = schema.field("minimum") {
            let name = type_name.as_deref().unwrap_or_default();
            return match schema.field("maximum") {
                Some(maximum) => format!("{name} {}..{}", number_text(minimum), number_text(maximum)),
                None => format!("{name} \u{2265}{}", number_text(minimum)),
            };
        }
    }
    if type_name.as_deref() == Some("string") {
        if let Some(format) = schema.field("format").and_then(Json::text) {
            return format!("string ({format})");
        }
    }
    type_name.unwrap_or_else(|| "any".to_string())
}

fn shape_of(schema: &Json) -> String {
    let text = describe_shape(schema, 2);
    if utf16::len(&text) <= SHAPE_MAX_CHARS {
        text
    } else {
        describe_shape(schema, 1)
    }
}

fn first_type(schema: &Json) -> Option<&str> {
    schema_types(schema).and_then(|names| names.first().copied())
}

/// A minimal value that passes `schema`: required fields only, arrays at their minimum length,
/// strings as `<field>` placeholders.
fn example_of(schema: &Json, key: &str) -> Json {
    let Json::Object(_) = schema else {
        return Json::Null;
    };
    if let Some(first) = schema.field("examples").and_then(Json::list).and_then(<[Json]>::first) {
        return first.clone();
    }
    if let Some(first) = schema.field("anyOf").and_then(Json::list).and_then(<[Json]>::first) {
        return example_of(first, key);
    }
    if let Some(first) = schema.field("enum").and_then(Json::list).and_then(<[Json]>::first) {
        return first.clone();
    }
    match first_type(schema) {
        Some("object") => {
            let properties = schema.field("properties");
            let mut fields = IndexMap::new();
            for name in schema
                .field("required")
                .and_then(Json::list)
                .unwrap_or_default()
                .iter()
                .filter_map(Json::text)
            {
                let child = properties.and_then(|all| all.field(name));
                fields.insert(
                    name.to_string(),
                    child.map_or(Json::Null, |child| example_of(child, name)),
                );
            }
            Json::Object(fields)
        }
        Some("array") => {
            let length = schema.field("minItems").and_then(Json::number).unwrap_or(0.0) as usize;
            let item = schema
                .field("items")
                .map_or(Json::Null, |items| example_of(items, key));
            Json::List((0..length).map(|index| numbered(&item, index)).collect())
        }
        Some("number")
            if schema.field("minimum").is_some() && schema.field("maximum").is_some() =>
        {
            let minimum = schema.field("minimum").and_then(Json::number).unwrap_or(0.0);
            let maximum = schema.field("maximum").and_then(Json::number).unwrap_or(0.0);
            Json::Number(minimum + (maximum - minimum) * 0.8)
        }
        Some("integer" | "number") => {
            Json::Number(schema.field("minimum").and_then(Json::number).unwrap_or(0.0))
        }
        Some("boolean") => Json::Bool(true),
        Some("null") => Json::Null,
        Some("string") => {
            if schema.field("format").and_then(Json::text) == Some("date-time") {
                return Json::Text("2026-01-31T09:00:00.000Z".to_string());
            }
            if schema.field("pattern").and_then(Json::text) == Some(SHA256_DIGEST) {
                return Json::Text(format!("sha256:{}", "0".repeat(64)));
            }
            Json::Text(format!("<{key}>"))
        }
        _ => Json::Null,
    }
}

/// The nth copy of an array item gets its own placeholders, so unique-item rules hold.
fn numbered(value: &Json, index: usize) -> Json {
    if index == 0 {
        return value.clone();
    }
    match value {
        Json::Text(text) if text.starts_with('<') && text.ends_with('>') && utf16::len(text) >= 2 => {
            Json::Text(format!("{} {}>", &text[..text.len() - 1], index + 1))
        }
        Json::List(items) => Json::List(items.iter().map(|item| numbered(item, index)).collect()),
        Json::Object(fields) => Json::Object(
            fields
                .iter()
                .map(|(name, child)| (name.clone(), numbered(child, index)))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn last_key(path: &str) -> &str {
    let trimmed = match path.rfind('[') {
        Some(open)
            if path.ends_with(']')
                && path[open + 1..path.len() - 1].chars().all(|digit| digit.is_ascii_digit())
                && path.len() > open + 2 =>
        {
            &path[..open]
        }
        _ => path,
    };
    trimmed.rsplit('.').next().unwrap_or(trimmed)
}

struct Example {
    path: String,
    text: String,
}

/// One valid example for the field at `path`. An array shows one item; an object whose whole
/// example is too long shows its first required field that fits.
fn example_for(schema: &Json, path: &str) -> Option<Example> {
    let Json::Object(_) = schema else {
        return None;
    };
    let type_name = first_type(schema);
    if type_name == Some("array") && schema.field("items").is_some() && schema.field("examples").is_none() {
        return example_for(schema.field("items")?, &format!("{path}[0]"));
    }
    let text = example_of(schema, last_key(path)).stringify();
    if utf16::len(&text) <= EXAMPLE_MAX_CHARS {
        return Some(Example { path: path.to_string(), text });
    }
    if type_name != Some("object") {
        return None;
    }
    for field in schema
        .field("required")
        .and_then(Json::list)
        .unwrap_or_default()
        .iter()
        .filter_map(Json::text)
    {
        let child = schema.field("properties").and_then(|all| all.field(field));
        if let Some(nested) = child.and_then(|child| example_for(child, &format!("{path}.{field}"))) {
            if nested.text.starts_with('{') {
                return Some(nested);
            }
        }
    }
    None
}

#[derive(Default)]
struct Refusal<'a> {
    example_path: Option<&'a str>,
    example_schema: Option<&'a Json>,
    fields: Vec<(&'static str, Value)>,
}

/// The refusal: the broken rule, the object's shape, and a valid example of the field.
fn refuse(path: &str, rule: &str, schema: &Json, options: Refusal<'_>) -> Failure {
    let is_object_with_properties =
        first_type(schema) == Some("object") && schema.field("type").is_some_and(|name| name.text().is_some())
            && schema.field("properties").is_some();
    let shape = if is_object_with_properties {
        format!(" Expected shape of {path}: {}.", shape_of(schema))
    } else {
        String::new()
    };
    let example = example_for(
        options.example_schema.unwrap_or(schema),
        options.example_path.unwrap_or(path),
    );
    let example_sentence = example
        .map(|example| format!(" Example {}: {}.", example.path, example.text))
        .unwrap_or_default();
    let mut fields = vec![("fieldPath", Value::String(path.to_string()))];
    fields.extend(options.fields);
    Failure {
        message: format!("{rule}{shape}{example_sentence}"),
        fields,
        described: false,
    }
}

fn pattern_text(pattern: &str) -> String {
    match pattern {
        NON_BLANK_STRING => "a non-empty single-line string without leading or trailing whitespace or a null byte".to_string(),
        SHA256_DIGEST => "a digest \"sha256:\" followed by 64 lowercase hex digits".to_string(),
        other => format!("a string matching {other}"),
    }
}

fn matches_pattern(pattern: &str, text: &str) -> bool {
    match pattern {
        NON_BLANK_STRING => {
            let is_space = repository_survey::is_js_space;
            !text.is_empty()
                && !text.contains(['\n', '\r', '\u{2028}', '\u{2029}', '\0'])
                && !text.chars().next().is_some_and(is_space)
                && !text.chars().next_back().is_some_and(is_space)
        }
        SHA256_DIGEST => {
            text.strip_prefix("sha256:").is_some_and(|digest| {
                digest.len() == 64
                    && digest.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
        }
        _ => true,
    }
}

fn is_date_time(text: &str) -> bool {
    static DATE_TIME: OnceLock<Regex> = OnceLock::new();
    DATE_TIME
        .get_or_init(|| {
            Regex::new(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:[Zz]|[+-][0-9]{2}:[0-9]{2})$")
                .unwrap_or_else(|_| unreachable!("a fixed pattern"))
        })
        .is_match(text)
}

fn check_string(value: &str, schema: &Json, path: &str) -> Check {
    let length = utf16::len(value);
    if let Some(minimum) = schema.field("minLength").and_then(Json::number) {
        if (length as f64) < minimum {
            return Err(refuse(
                path,
                &format!(
                    "{path} must be at least {} character{} long.",
                    number::text(minimum),
                    if minimum == 1.0 { "" } else { "s" }
                ),
                schema,
                Refusal::default(),
            ));
        }
    }
    if let Some(maximum) = schema.field("maxLength").and_then(Json::number) {
        if (length as f64) > maximum {
            return Err(refuse(
                path,
                &format!(
                    "{path} must be at most {} characters long; received {length}.",
                    number::text(maximum)
                ),
                schema,
                Refusal::default(),
            ));
        }
    }
    if let Some(pattern) = schema.field("pattern").and_then(Json::text) {
        if !matches_pattern(pattern, value) {
            return Err(refuse(
                path,
                &format!("{path} must be {}.", pattern_text(pattern)),
                schema,
                Refusal::default(),
            ));
        }
    }
    if schema.field("format").and_then(Json::text) == Some("date-time") && !is_date_time(value) {
        return Err(refuse(
            path,
            &format!("{path} must be an RFC 3339 date-time."),
            schema,
            Refusal::default(),
        ));
    }
    Ok(())
}

fn check_number(value: f64, schema: &Json, path: &str) -> Check {
    if let Some(minimum) = schema.field("minimum").and_then(Json::number) {
        if value < minimum {
            return Err(refuse(
                path,
                &format!("{path} must be >= {}; received {}.", number::text(minimum), number::text(value)),
                schema,
                Refusal::default(),
            ));
        }
    }
    if let Some(maximum) = schema.field("maximum").and_then(Json::number) {
        if value > maximum {
            return Err(refuse(
                path,
                &format!("{path} must be <= {}; received {}.", number::text(maximum), number::text(value)),
                schema,
                Refusal::default(),
            ));
        }
    }
    Ok(())
}

fn check_array(items: &[Json], schema: &Json, path: &str) -> Check {
    let count = items.len();
    if let Some(minimum) = schema.field("minItems").and_then(Json::number) {
        if (count as f64) < minimum {
            let each = schema.field("items").map(shape_of).unwrap_or_else(|| "any".to_string());
            return Err(refuse(
                path,
                &format!(
                    "{path} must contain at least {} item{}; received {count}. Each item: {each}.",
                    number::text(minimum),
                    if minimum == 1.0 { "" } else { "s" }
                ),
                schema,
                Refusal::default(),
            ));
        }
    }
    if let Some(maximum) = schema.field("maxItems").and_then(Json::number) {
        if (count as f64) > maximum {
            let kept = number::text(maximum);
            return Err(refuse(
                path,
                &format!(
                    "{path} must contain at most {kept} items; received {count}. Split the work across calls or keep the {kept} that matter."
                ),
                schema,
                Refusal::default(),
            ));
        }
    }
    // Items first: a duplicate is compared only once every item has the shape it must have.
    if let Some(item_schema) = schema.field("items") {
        for (index, item) in items.iter().enumerate() {
            check_value(item, item_schema, &format!("{path}[{index}]"))?;
        }
    }
    if schema.field("uniqueItems") == Some(&Json::Bool(true)) {
        let mut seen: IndexMap<String, usize> = IndexMap::new();
        for (index, item) in items.iter().enumerate() {
            let key = item.stringify();
            if let Some(&first) = seen.get(&key) {
                return Err(refuse(
                    path,
                    &format!(
                        "{path} must not repeat items; {path}[{index}] repeats {path}[{first}]: {}. Remove the duplicate.",
                        echo(item)
                    ),
                    schema,
                    Refusal {
                        fields: vec![("duplicateIndex", json!(index)), ("firstIndex", json!(first))],
                        ..Refusal::default()
                    },
                ));
            }
            seen.insert(key, index);
        }
    }
    Ok(())
}

fn closest_allowed_object_field(key: &str, allowed: &[String]) -> Option<String> {
    if key == "relation" && allowed.iter().any(|name| name == "type") {
        return Some("type".to_string());
    }
    closest_allowed_value(key, allowed)
}

fn refuse_unknown_keys(fields: &IndexMap<String, Json>, schema: &Json, path: &str) -> Check {
    let allowed_fields: Vec<String> = match schema.field("properties") {
        Some(Json::Object(properties)) => in_object_order(properties.iter())
            .into_iter()
            .map(|(name, _)| name.clone())
            .collect(),
        _ => Vec::new(),
    };
    let received_in_order: Vec<&String> = in_object_order(fields.iter()).into_iter().map(|(key, _)| key).collect();
    let unknown: Vec<(String, Option<String>)> = received_in_order
        .iter()
        .filter(|key| !allowed_fields.contains(key))
        .map(|key| {
            (
                utf16::prefix(key, ECHO_MAX_CHARS).to_string(),
                closest_allowed_object_field(key, &allowed_fields),
            )
        })
        .collect();
    if unknown.is_empty() {
        return Ok(());
    }
    let mut received: Vec<&String> = received_in_order.clone();
    received.sort_by(|left, right| utf16::compare(left, right));
    let hint = |(name, suggestion): &(String, Option<String>)| match suggestion {
        Some(nearest) => format!("{} (did you mean \"{nearest}\"?)", echo(&Json::Text(name.clone()))),
        None => echo(&Json::Text(name.clone())),
    };
    let head = match unknown.as_slice() {
        [(name, suggestion)] => format!(
            "Unknown field {} in {path}.{}",
            echo(&Json::Text(name.clone())),
            suggestion
                .as_ref()
                .map(|nearest| format!(" Did you mean \"{nearest}\"?"))
                .unwrap_or_default()
        ),
        _ => format!(
            "Unknown fields in {path}: {}.",
            unknown.iter().map(hint).collect::<Vec<_>>().join(", ")
        ),
    };
    let rule = format!(
        "{head} Allowed fields: {}. Received fields: {}.",
        allowed_fields.join(", "),
        received.iter().map(|key| echo_name(key)).collect::<Vec<_>>().join(", ")
    );
    let unknown_rows: Vec<Value> = unknown
        .iter()
        .map(|(name, suggestion)| match suggestion {
            Some(nearest) => json!({ "name": name, "suggestion": nearest }),
            None => json!({ "name": name }),
        })
        .collect();
    Err(refuse(
        path,
        &rule,
        schema,
        Refusal {
            fields: vec![
                ("rowName", Value::String(path.to_string())),
                ("unknownFields", Value::Array(unknown_rows)),
                ("allowedFields", json!(allowed_fields)),
                (
                    "receivedFields",
                    json!(received
                        .iter()
                        .map(|key| utf16::prefix(key, ECHO_MAX_CHARS).to_string())
                        .collect::<Vec<_>>()),
                ),
            ],
            ..Refusal::default()
        },
    ))
}

fn check_object(fields: &IndexMap<String, Json>, schema: &Json, path: &str) -> Check {
    let properties = schema.field("properties");
    let required: Vec<&str> = schema
        .field("required")
        .and_then(Json::list)
        .map(|names| names.iter().filter_map(Json::text).collect())
        .unwrap_or_default();
    for key in &required {
        if !fields.contains_key(*key) {
            let child = properties.and_then(|all| all.field(key));
            let example_path = format!("{path}.{key}");
            return Err(refuse(
                path,
                &format!(
                    "{path} is missing required field \"{key}\"; required: {}.",
                    required.join(", ")
                ),
                schema,
                Refusal {
                    example_path: Some(&example_path),
                    example_schema: Some(child.unwrap_or(&Json::Null)),
                    fields: Vec::new(),
                },
            ));
        }
    }
    if schema.field("additionalProperties") == Some(&Json::Bool(false)) {
        refuse_unknown_keys(fields, schema, path)?;
    }
    if let Some(Json::Object(all)) = properties {
        for (key, child) in in_object_order(all.iter()) {
            if let Some(value) = fields.get(key) {
                check_value(value, child, &format!("{path}.{key}"))?;
            }
        }
    }
    Ok(())
}

fn check_node(value: &Json, schema: &Json, path: &str) -> Check {
    if let Some(options) = schema.field("anyOf").and_then(Json::list) {
        let mut reasons: Vec<String> = Vec::new();
        for option in options {
            match check_value(value, option, path) {
                Ok(()) => return Ok(()),
                Err(failure) => reasons.push(failure.message),
            }
        }
        let expected: Vec<String> = options.iter().map(|option| describe_shape(option, 1)).collect();
        let first = reasons.first().cloned().unwrap_or_default();
        return Err(refuse(
            path,
            &format!("{path} must be {}. {first}", expected.join(" or ")),
            schema,
            Refusal { fields: vec![("expectedType", json!(expected))], ..Refusal::default() },
        ));
    }
    if let Some(names) = schema_types(schema) {
        if !names.iter().any(|name| matches_type(value, name)) {
            let expected = match schema.field("type") {
                Some(declared) => declared.to_value(),
                None => Value::Null,
            };
            return Err(refuse(
                path,
                &format!("{path} must be {}; received {}.", types_text(schema), type_text(type_of(value))),
                schema,
                Refusal {
                    fields: vec![
                        ("expectedType", expected),
                        ("receivedType", Value::String(type_of(value).to_string())),
                    ],
                    ..Refusal::default()
                },
            ));
        }
    }
    if let Some(allowed) = schema.field("enum").and_then(Json::list) {
        if !allowed.contains(value) {
            let names: Vec<&str> = allowed.iter().filter_map(Json::text).collect();
            let suggestion = match value {
                Json::Text(text) if utf16::len(text) <= ECHO_MAX_CHARS => closest_allowed_value(text, &names),
                _ => None,
            };
            let suggestion_text = suggestion
                .as_ref()
                .map(|nearest| format!(" Did you mean \"{nearest}\"?"))
                .unwrap_or_default();
            let example = match (&suggestion, allowed.first()) {
                (Some(nearest), _) => Json::Text(nearest.clone()),
                (None, Some(first)) => first.clone(),
                (None, None) => Json::Null,
            };
            let example_schema = Json::Object(IndexMap::from([(
                "examples".to_string(),
                Json::List(vec![example]),
            )]));
            let mut fields = vec![
                ("valueName", Value::String(path.to_string())),
                (
                    "receivedValue",
                    Value::String(match value {
                        Json::Text(text) => utf16::prefix(text, ECHO_MAX_CHARS).to_string(),
                        other => echo(other),
                    }),
                ),
            ];
            if let Some(nearest) = &suggestion {
                fields.push(("suggestion", Value::String(nearest.clone())));
            }
            fields.push(("allowedValues", json!(names)));
            return Err(refuse(
                path,
                &format!(
                    "{path} must be one of: {}. Received: {}.{suggestion_text}",
                    names.join(", "),
                    echo(value)
                ),
                &example_schema,
                Refusal { fields, ..Refusal::default() },
            ));
        }
    }
    match value {
        Json::Text(text) => check_string(text, schema, path),
        Json::Number(number) => check_number(*number, schema, path),
        Json::List(items) => check_array(items, schema, path),
        Json::Object(fields) => check_object(fields, schema, path),
        Json::Null | Json::Bool(_) => Ok(()),
    }
}

/// The nearest enclosing `description` is appended once, so the refusal carries the rule its field
/// was documented with.
fn check_value(value: &Json, schema: &Json, path: &str) -> Check {
    check_node(value, schema, path).map_err(|mut failure| {
        if let Some(description) = schema.field("description").and_then(Json::text) {
            if !description.is_empty() && !failure.described {
                failure.message = format!("{} {path}: {description}", failure.message);
                failure.described = true;
            }
        }
        failure
    })
}

/// Walks without recursion, so the guard itself cannot overflow the stack.
fn nests_deeper_than(value: &Json, limit: usize) -> bool {
    let mut stack = vec![(value, 0_usize)];
    while let Some((node, depth)) = stack.pop() {
        let children: Vec<&Json> = match node {
            Json::List(items) => items.iter().collect(),
            Json::Object(fields) => fields.values().collect(),
            _ => continue,
        };
        if depth >= limit {
            return true;
        }
        for child in children {
            if matches!(child, Json::List(_) | Json::Object(_)) {
                stack.push((child, depth + 1));
            }
        }
    }
    false
}

/// Refuses with the first field of `value` that breaks `schema`.
pub fn check_against_schema(value: &Json, schema: &Json, path: &str) -> Result<(), ToolError> {
    if nests_deeper_than(value, MAX_NESTING) {
        return Err(ToolError::broken_contract(
            format!(
                "{path} nests arrays or objects more than {MAX_NESTING} levels deep; no contract here is that deep."
            ),
            vec![
                ("fieldPath", Value::String(path.to_string())),
                ("maxNesting", json!(MAX_NESTING)),
            ],
        ));
    }
    check_value(value, schema, path)
        .map_err(|failure| ToolError::broken_contract(failure.message, failure.fields))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(text: &str) -> Json {
        serde_json::from_str(text).expect("json")
    }

    #[test]
    fn a_proposal_without_its_project_is_refused_with_the_shape_and_an_example_of_the_missing_field() {
        let refused = check_against_schema(&read("{}"), &review_schemas().proposal, "proposal")
            .expect_err("refused");
        assert!(refused.message().starts_with("proposal is missing required field \"project\"; required: "), "{}", refused.message());
        assert!(refused.message().contains(" Expected shape of proposal: {project: "), "{}", refused.message());
        assert!(refused.message().contains(" Example proposal.project: {"), "{}", refused.message());
    }

    #[test]
    fn a_misspelled_field_is_named_with_the_nearest_allowed_one_in_the_order_it_was_sent() {
        let schema = read(r#"{"type":"object","properties":{"title":{"type":"string"},"slug":{"type":"string"}},"additionalProperties":false}"#);
        let refused = check_against_schema(&read(r#"{"zeta":1,"titel":"x"}"#), &schema, "row").expect_err("refused");
        assert!(
            refused
                .message()
                .starts_with("Unknown fields in row: \"zeta\", \"titel\" (did you mean \"title\"?). Allowed fields: title, slug. Received fields: titel, zeta."),
            "{}",
            refused.message()
        );
    }

    #[test]
    fn a_value_nested_past_the_deepest_contract_is_refused_before_it_is_walked() {
        let nested = format!("{}1{}", "[".repeat(70), "]".repeat(70));
        let refused = check_against_schema(&read(&nested), &Json::Null, "proposal").expect_err("refused");
        assert!(refused.message().starts_with("proposal nests arrays or objects more than 64 levels deep"));
    }
}
