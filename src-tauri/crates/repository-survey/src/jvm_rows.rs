//! The abilities a Java or Kotlin product offers, from the facts of its files:
//! - an HTTP resource class, JAX-RS (`@Path` with `@GET`, `@POST`...) or Spring (`@RestController`
//!   or `@Controller`, `@RequestMapping`, `@GetMapping`...), is one `route` row whose members are
//!   its routes, those it inherits from a repository base class included;
//! - a `static void main` (Kotlin: a top-level `fun main`) is an `executable`;
//! - scheduled work is a `worker`: a `@Scheduled` method, a `scheduleAtFixedRate` or
//!   `scheduleWithFixedDelay` call, or a class implementing a repository task type that is
//!   runnable and takes a scheduler;
//! - a message consumer is a `worker` too, one row per method or class annotated as a Kafka,
//!   RabbitMQ, JMS, SQS or Pulsar listener, named for its method, apart from the class's
//!   scheduled work;
//! - three or more concrete classes in one folder whose supertype is the same type are a
//!   `family`, the supertype resolved through the file, an explicit import or the package. A class
//!   whose supertype cannot be resolved is in no family, and Java and Kotlin runtime types
//!   (`java.*`, `kotlin.*`) found none.
//!
//! Types resolve through one map of every class the files declare, so the cost is linear in the
//! bytes read plus the classes times their supertype chains.

use std::collections::{HashMap, HashSet};

use answer_format::collation::compare_text;

use crate::ability_row::{AbilityKind, AbilityRow};
use crate::jvm_file_facts::{annotations_by_method, JvmAnnotation, JvmClass, JvmFileFacts};

const FAMILY_SIZE: usize = 3;
/// Supertype chains are followed this many levels up.
const ANCESTOR_LIMIT: usize = 8;
/// A file importing more packages whole than this leaves every unknown type undecided.
const WILDCARD_LIMIT: usize = 64;
const MESSAGE_LISTENERS: [&str; 5] = [
    "KafkaListener",
    "RabbitListener",
    "JmsListener",
    "SqsListener",
    "PulsarListener",
];
const JAX_RS_METHODS: [&str; 7] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
const SPRING_CONTROLLERS: [&str; 2] = ["RestController", "Controller"];
const RUNNABLE_TYPES: [&str; 2] = ["java.lang.Runnable", "java.util.TimerTask"];

/// A class as the files declare it: the file's index and the class's index in it.
type ClassRef = (usize, usize);

struct Types<'a> {
    files: &'a [&'a JvmFileFacts],
    by_qualified_name: HashMap<&'a str, ClassRef>,
    supertypes: HashMap<ClassRef, Vec<String>>,
    ancestors: HashMap<ClassRef, Vec<String>>,
}

impl<'a> Types<'a> {
    fn new(files: &'a [&'a JvmFileFacts]) -> Self {
        let mut by_qualified_name = HashMap::new();
        for (file_index, file) in files.iter().enumerate() {
            for (class_index, class) in file.classes.iter().enumerate() {
                by_qualified_name
                    .entry(class.qualified_name.as_str())
                    .or_insert((file_index, class_index));
            }
        }
        Self {
            files,
            by_qualified_name,
            supertypes: HashMap::new(),
            ancestors: HashMap::new(),
        }
    }

    fn class(&self, reference: ClassRef) -> Option<&'a JvmClass> {
        self.files.get(reference.0)?.classes.get(reference.1)
    }

    fn declared(&self, name: &str) -> Option<ClassRef> {
        self.by_qualified_name.get(name).copied()
    }

    /// The qualified name a type reference in `file` means, or none when it cannot be decided: a
    /// type declared in the file, an explicit import, a type of the same package, a type in an
    /// imported package, and with no wildcard import left open, the language's implicit package.
    fn resolve(&self, reference: &str, file: &JvmFileFacts) -> Option<String> {
        let mut parts = reference.split('.');
        let head = parts.next().unwrap_or("");
        let rest: Vec<&str> = parts.collect();
        if !rest.is_empty() && head.chars().next().is_some_and(|c| c.is_ascii_lowercase()) {
            return Some(reference.to_string());
        }
        let suffix = if rest.is_empty() {
            String::new()
        } else {
            format!(".{}", rest.join("."))
        };
        if let Some(local) = file.by_name.get(head).and_then(|at| file.classes.get(*at)) {
            return Some(format!("{}{suffix}", local.qualified_name));
        }
        if let Some(imported) = file.imports.explicit.get(head) {
            return Some(format!("{imported}{suffix}"));
        }
        let same_package = match &file.imports.package_name {
            Some(package) => format!("{package}.{head}"),
            None => head.to_string(),
        };
        if self.by_qualified_name.contains_key(same_package.as_str()) {
            return Some(format!("{same_package}{suffix}"));
        }
        if file.imports.wildcards.len() > WILDCARD_LIMIT {
            return None;
        }
        for spec in &file.imports.wildcards {
            let candidate = format!("{spec}.{head}");
            if self.by_qualified_name.contains_key(candidate.as_str()) {
                return Some(format!("{candidate}{suffix}"));
            }
        }
        if !file.imports.wildcards.is_empty() {
            return None;
        }
        let package = if file.kotlin { "kotlin" } else { "java.lang" };
        Some(format!("{package}.{head}{suffix}"))
    }

    /// The resolved supertypes of a class; an unresolvable one is left out.
    fn supertypes_of(&mut self, reference: ClassRef) -> Vec<String> {
        if let Some(held) = self.supertypes.get(&reference) {
            return held.clone();
        }
        let resolved: Vec<String> = match (self.files.get(reference.0), self.class(reference)) {
            (Some(file), Some(class)) => class
                .supertypes
                .iter()
                .filter_map(|name| self.resolve(name, file))
                .collect(),
            _ => Vec::new(),
        };
        self.supertypes.insert(reference, resolved.clone());
        resolved
    }

    /// Every type above a class, nearest first, followed through repository classes up to the
    /// ancestor limit.
    fn ancestors_of(&mut self, reference: ClassRef) -> Vec<String> {
        if let Some(held) = self.ancestors.get(&reference) {
            return held.clone();
        }
        let mut found: Vec<String> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let mut frontier = vec![reference];
        for _ in 0..ANCESTOR_LIMIT {
            if frontier.is_empty() {
                break;
            }
            let mut next = Vec::new();
            for current in &frontier {
                for name in self.supertypes_of(*current) {
                    if !seen.insert(name.clone()) {
                        continue;
                    }
                    found.push(name.clone());
                    if let Some(above) = self.declared(&name) {
                        next.push(above);
                    }
                }
            }
            frontier = next;
        }
        self.ancestors.insert(reference, found.clone());
        found
    }
}

fn find_annotation<'c>(class: &'c JvmClass, name: &str) -> Option<&'c JvmAnnotation> {
    class
        .annotations
        .iter()
        .find(|annotation| annotation.name == name)
}

/// A resource class's base paths and the annotation that sets them, or none when it is not one.
fn resource_base<'c>(
    class: &'c JvmClass,
    file: &JvmFileFacts,
) -> Option<(Option<Vec<String>>, &'c JvmAnnotation)> {
    if class.keyword == "interface" || !class.has_body {
        return None;
    }
    if file.imports.jax_rs {
        if let Some(path) = find_annotation(class, "Path") {
            return Some((path.paths.clone(), path));
        }
    }
    let controller = class
        .annotations
        .iter()
        .find(|annotation| SPRING_CONTROLLERS.contains(&annotation.name.as_str()))?;
    if !file.imports.spring {
        return None;
    }
    match find_annotation(class, "RequestMapping") {
        Some(mapping) => Some((mapping.paths.clone(), mapping)),
        None => Some((Some(vec![String::new()]), controller)),
    }
}

fn join_route(base: &str, path: &str) -> String {
    let joined: Vec<&str> = [base, path]
        .into_iter()
        .map(|part| part.trim_matches('/'))
        .filter(|part| !part.is_empty())
        .collect();
    format!("/{}", joined.join("/"))
}

/// The routes a class declares itself: `METHOD /path` relative to `base`, undecidable ones left out.
fn own_routes(class: &JvmClass, file: &JvmFileFacts, base: &str) -> Vec<String> {
    let mut routes = Vec::new();
    for member in &class.members {
        for group in annotations_by_method(member) {
            let mut methods: Vec<String> = Vec::new();
            let mut paths: Option<Vec<String>> = Some(vec![String::new()]);
            let mut mapped = false;
            for annotation in group.iter().filter_map(|at| member.annotations.get(*at)) {
                let name = annotation.name.as_str();
                if file.imports.jax_rs && JAX_RS_METHODS.contains(&name) {
                    methods.push(name.to_string());
                    mapped = true;
                } else if file.imports.jax_rs && name == "Path" {
                    paths = annotation.paths.clone();
                } else if file.imports.spring_web {
                    let fixed = match name {
                        "GetMapping" => Some("GET"),
                        "PostMapping" => Some("POST"),
                        "PutMapping" => Some("PUT"),
                        "DeleteMapping" => Some("DELETE"),
                        "PatchMapping" => Some("PATCH"),
                        "RequestMapping" => None,
                        _ => continue,
                    };
                    mapped = true;
                    paths = annotation.paths.clone();
                    match fixed {
                        Some(method) => methods.push(method.to_string()),
                        None => methods.extend(annotation.request_methods.iter().cloned()),
                    }
                }
            }
            let Some(paths) = paths.filter(|_| mapped) else {
                continue;
            };
            for method in &methods {
                for path in &paths {
                    routes.push(format!("{method} {}", join_route(base, path)));
                }
            }
        }
    }
    routes
}

fn route_rows(files: &[&JvmFileFacts], types: &mut Types<'_>) -> Vec<AbilityRow> {
    let mut rows = Vec::new();
    for (file_index, file) in files.iter().enumerate() {
        for (class_index, class) in file.classes.iter().enumerate() {
            let Some((Some(base_paths), at)) = resource_base(class, file) else {
                continue;
            };
            let inherited: Vec<ClassRef> = types
                .ancestors_of((file_index, class_index))
                .iter()
                .filter_map(|name| types.declared(name))
                .collect();
            let mut members: Vec<String> = Vec::new();
            let mut seen: HashSet<String> = HashSet::new();
            for base in &base_paths {
                let sources =
                    std::iter::once((file_index, class_index)).chain(inherited.iter().copied());
                for source in sources {
                    let (Some(source_file), Some(source_class)) =
                        (files.get(source.0), types.class(source))
                    else {
                        continue;
                    };
                    for route in own_routes(source_class, source_file, base) {
                        if seen.insert(route.clone()) {
                            members.push(route);
                        }
                    }
                }
            }
            if !members.is_empty() {
                rows.push(
                    AbilityRow::at(AbilityKind::Route, &class.name, &file.path, at.line)
                        .with_members(members),
                );
            }
        }
    }
    rows
}

fn is_task_type(reference: ClassRef, types: &mut Types<'_>) -> bool {
    let Some(class) = types.class(reference) else {
        return false;
    };
    if !class.is_abstract || !class.has_body {
        return false;
    }
    if !types
        .ancestors_of(reference)
        .iter()
        .any(|name| RUNNABLE_TYPES.contains(&name.as_str()))
    {
        return false;
    }
    class.scheduler_in_body
}

fn worker_rows(files: &[&JvmFileFacts], types: &mut Types<'_>) -> Vec<AbilityRow> {
    let mut rows = Vec::new();
    let mut named: HashSet<String> = HashSet::new();
    // A row named for its class stands for the whole class; one named for a method is that
    // method's own.
    let mut push = |file: &JvmFileFacts,
                    class: &JvmClass,
                    method: Option<&str>,
                    line: usize,
                    name: Option<String>| {
        let name = name.unwrap_or_else(|| class.name.clone());
        let key = if name == class.name {
            class.qualified_name.clone()
        } else {
            format!("{}\0{name}", class.qualified_name)
        };
        if !named.insert(key) {
            return;
        }
        let symbol = match method {
            Some(method) => format!("{}.{method}", class.name),
            None => class.name.clone(),
        };
        rows.push(
            AbilityRow::at(AbilityKind::Worker, &name, &file.path, line).with_symbol(&symbol),
        );
    };
    for file in files {
        for class in &file.classes {
            // Each consumer is its own ability, named for its method; a class-level one takes the
            // class name, so the class's scheduled work is then named for its method too.
            let class_listener = class
                .annotations
                .iter()
                .find(|annotation| MESSAGE_LISTENERS.contains(&annotation.name.as_str()));
            if let Some(listener) = class_listener {
                push(file, class, None, listener.line, None);
            }
            for member in &class.members {
                for listener in member
                    .annotations
                    .iter()
                    .filter(|annotation| MESSAGE_LISTENERS.contains(&annotation.name.as_str()))
                {
                    let method = annotated_method(member, listener);
                    let name = method
                        .map(|method| format!("{}.{method}", class.name))
                        .unwrap_or_else(|| class.name.clone());
                    push(file, class, method, listener.line, Some(name));
                }
                if let Some(scheduled) = member
                    .annotations
                    .iter()
                    .find(|annotation| annotation.name == "Scheduled")
                {
                    let method = annotated_method(member, scheduled);
                    let name = match (class_listener, method) {
                        (Some(_), Some(method)) => Some(format!("{}.{method}", class.name)),
                        _ => None,
                    };
                    push(file, class, method, scheduled.line, name);
                }
            }
        }
        for call in &file.schedule_calls {
            let Some(class) = call.class.and_then(|at| file.classes.get(at)) else {
                continue;
            };
            push(file, class, call.method.as_deref(), call.line, None);
        }
    }
    let task_types: HashSet<String> = {
        let mut found = HashSet::new();
        for (file_index, file) in files.iter().enumerate() {
            for (class_index, class) in file.classes.iter().enumerate() {
                if is_task_type((file_index, class_index), types) {
                    found.insert(class.qualified_name.clone());
                }
            }
        }
        found
    };
    if !task_types.is_empty() {
        for (file_index, file) in files.iter().enumerate() {
            for (class_index, class) in file.classes.iter().enumerate() {
                if class.is_abstract {
                    continue;
                }
                let below = types
                    .ancestors_of((file_index, class_index))
                    .iter()
                    .any(|name| task_types.contains(name));
                if below {
                    push(file, class, None, class.line, None);
                }
            }
        }
    }
    rows
}

/// The method an annotation sits on: the first method name after it in the same member head.
fn annotated_method<'m>(
    member: &'m crate::jvm_file_facts::JvmMember,
    annotation: &JvmAnnotation,
) -> Option<&'m str> {
    member
        .names
        .iter()
        .find(|(offset, _)| *offset > annotation.start)
        .map(|(_, name)| name.as_str())
}

fn folder_of(path: &str) -> &str {
    path.rsplit_once('/').map_or(".", |(folder, _)| folder)
}

/// The supertype a class's family is named for: its resolved supertype, raised through repository
/// supertypes declared in the same folder, so handlers under a shared folder base join that
/// base's family.
fn family_bases(reference: ClassRef, folder: &str, types: &mut Types<'_>) -> Vec<String> {
    let mut bases = Vec::new();
    for name in types.supertypes_of(reference) {
        let mut base = name;
        for _ in 0..ANCESTOR_LIMIT {
            let Some(declared) = types.declared(&base) else {
                break;
            };
            let Some(file) = types.files.get(declared.0) else {
                break;
            };
            if folder_of(&file.path) != folder {
                break;
            }
            let above: Vec<String> = types
                .supertypes_of(declared)
                .into_iter()
                .filter(|parent| {
                    types
                        .declared(parent)
                        .and_then(|at| types.files.get(at.0))
                        .is_some_and(|parent_file| folder_of(&parent_file.path) == folder)
                })
                .collect();
            let [only] = above.as_slice() else { break };
            base = only.clone();
        }
        bases.push(base);
    }
    bases
}

fn is_runtime_type(name: &str) -> bool {
    name.starts_with("java.") || name.starts_with("kotlin.")
}

struct FamilyGroup<'a> {
    folder: String,
    base: String,
    members: Vec<(&'a JvmFileFacts, &'a JvmClass)>,
}

fn family_rows(files: &[&JvmFileFacts], types: &mut Types<'_>) -> Vec<AbilityRow> {
    let mut groups: Vec<FamilyGroup<'_>> = Vec::new();
    let mut at: HashMap<(String, String), usize> = HashMap::new();
    for (file_index, file) in files.iter().enumerate() {
        for (class_index, class) in file.classes.iter().enumerate() {
            if class.outer.is_some()
                || class.is_abstract
                || class.keyword == "enum"
                || class.keyword == "record"
            {
                continue;
            }
            let folder = folder_of(&file.path).to_string();
            let mut seen: HashSet<String> = HashSet::new();
            for base in family_bases((file_index, class_index), &folder, types) {
                if !seen.insert(base.clone()) || is_runtime_type(&base) {
                    continue;
                }
                let key = (folder.clone(), base.clone());
                let group = *at.entry(key).or_insert_with(|| {
                    groups.push(FamilyGroup {
                        folder: folder.clone(),
                        base: base.clone(),
                        members: Vec::new(),
                    });
                    groups.len() - 1
                });
                if let Some(held) = groups.get_mut(group) {
                    held.members.push((file, class));
                }
            }
        }
    }
    let mut rows = Vec::new();
    for mut group in groups {
        if group.members.len() < FAMILY_SIZE {
            continue;
        }
        group.members.sort_by(|left, right| {
            compare_text(&left.0.path, &right.0.path).then(left.1.start.cmp(&right.1.start))
        });
        let Some((first_file, first_class)) = group.members.first() else {
            continue;
        };
        let name = group.base.rsplit('.').next().unwrap_or("").to_string();
        let mut row = AbilityRow::at(AbilityKind::Family, &name, &group.folder, first_class.line)
            .with_symbol(&group.base)
            .with_members(
                group
                    .members
                    .iter()
                    .map(|(_, class)| class.name.clone())
                    .collect(),
            );
        row.evidence = format!("{}:L{}", first_file.path, first_class.line);
        rows.push(row);
    }
    rows.sort_by(|left, right| {
        compare_text(&left.path, &right.path).then_with(|| compare_text(&left.name, &right.name))
    });
    rows
}

/// Route, executable, worker and family rows for the Java and Kotlin files among `files`, in that
/// order.
pub fn jvm_rows(files: &[&JvmFileFacts]) -> Vec<AbilityRow> {
    let mut types = Types::new(files);
    let mut rows = route_rows(files, &mut types);
    rows.extend(
        files
            .iter()
            .flat_map(|file| file.executables.iter().cloned()),
    );
    rows.extend(worker_rows(files, &mut types));
    rows.extend(family_rows(files, &mut types));
    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jvm_file_facts::read_jvm_file;

    fn names(rows: &[AbilityRow]) -> Vec<String> {
        rows.iter()
            .map(|row| format!("{} {} {}:{}", row.kind.word(), row.name, row.path, row.line))
            .collect()
    }

    #[test]
    fn a_controller_is_one_route_row_whose_members_include_those_of_its_base_class() {
        let base = read_jvm_file(
            "api/BaseResource.java",
            "package shop.api;\nimport org.springframework.web.bind.annotation.*;\npublic abstract class BaseResource {\n  @GetMapping(\"/ping\")\n  public String ping() { return \"\"; }\n}\n",
        );
        let controller = read_jvm_file(
            "api/OrderController.java",
            "package shop.api;\nimport org.springframework.web.bind.annotation.*;\n@RestController\n@RequestMapping(\"/orders\")\npublic class OrderController extends BaseResource {\n  @PostMapping\n  public void make() {}\n}\n",
        );
        let rows = jvm_rows(&[&base, &controller]);
        let route = rows
            .iter()
            .find(|row| row.kind == AbilityKind::Route)
            .expect("a route row");
        assert_eq!(route.name, "OrderController");
        assert_eq!(
            route.members.as_deref(),
            Some(&["POST /orders".to_string(), "GET /orders/ping".to_string()][..])
        );
        assert_eq!(route.line, 4);
    }

    #[test]
    fn a_scheduled_method_and_a_listener_are_workers_named_for_their_methods() {
        let file = read_jvm_file(
            "jobs/Digest.java",
            "package jobs;\npublic class Digest {\n  @Scheduled(fixedRate = 5)\n  void send() {}\n  @KafkaListener(topics = \"a\")\n  void consume() {}\n}\n",
        );
        let rows = jvm_rows(&[&file]);
        assert_eq!(
            names(&rows),
            [
                "worker Digest jobs/Digest.java:3",
                "worker Digest.consume jobs/Digest.java:5"
            ]
        );
    }

    #[test]
    fn three_classes_in_one_folder_with_the_same_repository_supertype_are_a_family() {
        let base = read_jvm_file(
            "h/Handler.java",
            "package h;\npublic interface Handler {}\n",
        );
        let one = read_jvm_file(
            "h/A.java",
            "package h;\npublic class A implements Handler {}\n",
        );
        let two = read_jvm_file(
            "h/B.java",
            "package h;\npublic class B implements Handler {}\n",
        );
        let three = read_jvm_file(
            "h/C.java",
            "package h;\npublic class C implements Handler {}\n",
        );
        let rows = jvm_rows(&[&base, &one, &two, &three]);
        let family = rows
            .iter()
            .find(|row| row.kind == AbilityKind::Family)
            .expect("a family");
        assert_eq!(family.name, "Handler");
        assert_eq!(
            family.members.as_deref(),
            Some(&["A".to_string(), "B".to_string(), "C".to_string()][..])
        );
        assert_eq!(family.evidence, "h/A.java:L2");
    }
}
