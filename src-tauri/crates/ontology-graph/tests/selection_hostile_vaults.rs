//! The selection operations on vaults built to hurt them: a dependency chain and a ring ten
//! thousand long, and a hub fifty thousand nodes depend on. Every operation must answer without
//! recursion as deep as the graph, and a list must stop at the limit the call gave it.

mod support;

use ontology_graph::{compile, run_query, CompiledGraph, Operation, QueryRequest};
use support::{node, plant};

const LONG: usize = 10_000;
const HUB: usize = 50_000;
const LIMIT: usize = 5;
/// The operations that read the whole graph, with no node named.
const WHOLE_GRAPH: [&str; 7] = [
    "match_nodes",
    "recommend_relations",
    "health",
    "growth_plan",
    "maintenance_plan",
    "workspace_brief",
    "similar_nodes",
];

fn slug(number: usize) -> String {
    format!("capabilities/n{number:06}")
}

fn vault(count: usize, depends_on: impl Fn(usize) -> Vec<usize>) -> CompiledGraph {
    let files: Vec<(String, String)> = (0..count)
        .map(|number| {
            let lines: String = depends_on(number)
                .into_iter()
                .map(|target| format!("  - {}\n", slug(target)))
                .collect();
            let extra = if lines.is_empty() {
                String::new()
            } else {
                format!("dependencies:\n{lines}")
            };
            (
                format!("{}.md", slug(number)),
                node(number, "capability", &extra),
            )
        })
        .collect();
    compile(&plant(&files).documents).expect("compiles")
}

fn ask(graph: &CompiledGraph, operation: &str) -> String {
    let mut request = QueryRequest::new(Operation::parse(operation).expect("an operation"));
    request.limit = Some(LIMIT);
    request.slug = (operation == "similar_nodes").then(|| slug(0));
    request.selection.arguments.kind =
        (operation == "recommend_relations").then(|| "capability".to_string());
    let answer = run_query(graph, &request).expect("answers");
    answer_format::json::to_string(&answer).expect("writes")
}

/// A page that listed every node of the graph would be megabytes; one that obeys the limit is a few
/// dozen kilobytes however large the graph is.
const PAGE_BOUND: usize = 200_000;

#[test]
fn a_ring_and_a_chain_ten_thousand_long_answer_every_operation_within_their_limit() {
    for (name, graph) in [
        ("ring", vault(LONG, |number| vec![(number + 1) % LONG])),
        (
            "chain",
            vault(LONG, |number| {
                if number + 1 < LONG {
                    vec![number + 1]
                } else {
                    Vec::new()
                }
            }),
        ),
    ] {
        for operation in WHOLE_GRAPH {
            let text = ask(&graph, operation);
            assert!(
                text.len() < PAGE_BOUND,
                "{operation} on the {name} wrote {} bytes",
                text.len()
            );
        }
    }
}

#[test]
fn a_hub_fifty_thousand_nodes_depend_on_is_listed_by_the_limit_not_by_its_degree() {
    let graph = vault(HUB, |number| if number == 0 { Vec::new() } else { vec![0] });
    for operation in WHOLE_GRAPH {
        let text = ask(&graph, operation);
        assert!(
            text.len() < PAGE_BOUND,
            "{operation} on the hub wrote {} bytes",
            text.len()
        );
    }
    let matched: serde_json::Value =
        serde_json::from_str(&ask(&graph, "match_nodes")).expect("is JSON");
    assert_eq!(matched["nodes"].as_array().map(Vec::len), Some(LIMIT));
    assert_eq!(matched["limited"], true);
}

/// `maintenance_plan` reads the body of every node, and a body is a file read and a parse, so a plan
/// that read each body twice or in one thread took 3.5 seconds on this hub in a release build; one
/// read per body, spread over the cores, takes about one. The bound is the best of three runs in an
/// unoptimised test build (about 0.4 seconds on a quiet twelve-core machine), loose enough for a
/// loaded one and tight enough that a second read of every body fails it.
#[test]
fn maintenance_plan_on_the_hub_reads_each_body_once_and_answers_within_the_bound() {
    const BOUND: std::time::Duration = std::time::Duration::from_millis(1_500);
    let graph = vault(HUB, |number| if number == 0 { Vec::new() } else { vec![0] });
    let best = (0..3)
        .map(|_| {
            let started = std::time::Instant::now();
            ask(&graph, "maintenance_plan");
            started.elapsed()
        })
        .min()
        .expect("three runs");
    assert!(best < BOUND, "maintenance_plan on the hub took {best:?}");
}
