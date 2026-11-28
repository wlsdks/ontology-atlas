//! Vaults built to hurt a graph walk: a dependency chain ten thousand long, a ring as long as the
//! chain, a hub every node depends on, and fifty thousand nodes. Each query must answer, within
//! its stated bounds, without recursion as deep as the graph and without holding a path per node.

mod support;

use ontology_graph::{compile, run_query, CompiledGraph, Operation, QueryRequest};
use support::{node, plant};

const CHAIN: usize = 10_000;
const MANY: usize = 50_000;

fn slug(number: usize) -> String {
    format!("capabilities/n{number:06}")
}

/// `count` capabilities, each depending on whatever `depends_on(number)` names.
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

/// A call that names `operation` and nothing else.
fn request(operation: &str) -> QueryRequest {
    QueryRequest::new(Operation::parse(operation).expect("an operation the tool offers"))
}

fn answer(graph: &CompiledGraph, request: &QueryRequest) -> serde_json::Value {
    let answer = run_query(graph, request).expect("answers");
    let text = answer_format::json::to_string(&answer).expect("writes");
    serde_json::from_str(&text).expect("is JSON")
}

#[test]
fn a_chain_ten_thousand_long_is_ordered_searched_and_bounded_without_recursion() {
    let graph = vault(CHAIN, |number| {
        if number + 1 < CHAIN {
            vec![number + 1]
        } else {
            Vec::new()
        }
    });
    let order = answer(&graph, &request("health"))["dependencyOrder"].clone();
    assert_eq!(order["acyclic"], true);
    assert_eq!(order["orderedCount"], CHAIN);

    // The two ends are ten thousand edges apart: a search within twenty hops says so.
    let ends = |operation: &str| QueryRequest {
        from: Some(slug(0)),
        to: Some(slug(CHAIN - 1)),
        ..request(operation)
    };
    assert_eq!(answer(&graph, &ends("path"))["found"], false);

    // Ten thousand starting points overspend the default budget of expanded states: the search
    // stops, and says zero cycles is not proof of none.
    let cycles = answer(&graph, &request("cycles"));
    assert_eq!(cycles["totalCycles"], 0);
    assert_eq!(cycles["evidence"]["status"], "partial");
}

#[test]
fn a_ring_ten_thousand_long_blocks_the_order_and_is_no_cycle_within_the_depth() {
    let graph = vault(CHAIN, |number| vec![(number + 1) % CHAIN]);
    let order = answer(&graph, &request("health"))["dependencyOrder"].clone();
    assert_eq!(order["acyclic"], false);
    assert_eq!(order["orderedCount"], 0);
    // The list of blocked nodes is cut at the health check's own limit.
    assert_eq!(order["blocked"].as_array().map(Vec::len), Some(20));
    let cycles = answer(&graph, &request("cycles"));
    assert_eq!(cycles["totalCycles"], 0);
    let components = answer(&graph, &request("components"));
    assert_eq!(components["totalComponents"], 1);
    assert_eq!(components["largestSize"], CHAIN);
}

#[test]
fn a_small_ring_is_found_once_from_its_lowest_node() {
    let graph = vault(3, |number| vec![(number + 1) % 3]);
    let cycles = answer(&graph, &request("cycles"));
    assert_eq!(cycles["totalCycles"], 1);
    assert_eq!(
        cycles["cycles"][0]["nodes"],
        serde_json::json!([slug(0), slug(1), slug(2), slug(0)])
    );
}

#[test]
fn fifty_thousand_nodes_and_a_hub_they_all_depend_on_answer_every_summary() {
    let graph = vault(
        MANY,
        |number| if number == 0 { Vec::new() } else { vec![0] },
    );
    assert_eq!(graph.nodes().len(), MANY);
    let overview = answer(&graph, &request("overview"));
    assert_eq!(overview["graph"]["edges"], MANY - 1);
    assert_eq!(overview["hubs"][0]["slug"], slug(0));
    let communities = answer(&graph, &request("communities"));
    assert_eq!(communities["summary"]["communities"], 1);
    let busiest = answer(&graph, &request("match_nodes"));
    assert_eq!(busiest["nodes"][0]["slug"], slug(0));
    let neighbors = answer(
        &graph,
        &QueryRequest {
            slug: Some(slug(0)),
            ..request("neighbors")
        },
    );
    assert_eq!(neighbors["total"], MANY - 1);
    assert_eq!(neighbors["edges"].as_array().map(Vec::len), Some(100));
}
