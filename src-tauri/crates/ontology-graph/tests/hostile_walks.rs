//! Vaults built to hurt the walks of `query_ontology` that count and list what a node reaches: a
//! chain and a ring ten thousand long, and a hub fifty thousand nodes lean on. Every answer must
//! come back with exact totals, lists no longer than `limit`, and no recursion as deep as the graph.

mod support;

use ontology_graph::{compile, run_query, CompiledGraph, Direction, Operation, QueryRequest};
use support::{node, plant};

const CHAIN: usize = 10_000;
const MANY: usize = 50_000;

fn slug(number: usize) -> String {
    format!("capabilities/n{number:06}")
}

/// `count` capabilities, each naming under `key` whatever `targets(number)` gives.
fn vault(count: usize, key: &str, targets: impl Fn(usize) -> Vec<usize>) -> CompiledGraph {
    let files: Vec<(String, String)> = (0..count)
        .map(|number| {
            let lines: String = targets(number)
                .into_iter()
                .map(|target| format!("  - {}\n", slug(target)))
                .collect();
            let extra = if lines.is_empty() {
                String::new()
            } else {
                format!("{key}:\n{lines}")
            };
            (
                format!("{}.md", slug(number)),
                node(number, "capability", &extra),
            )
        })
        .collect();
    compile(&plant(&files).documents).expect("compiles")
}

fn call(operation: &str) -> QueryRequest {
    QueryRequest::new(Operation::parse(operation).expect("an operation the tool offers"))
}

fn at(operation: &str, number: usize) -> QueryRequest {
    QueryRequest {
        slug: Some(slug(number)),
        ..call(operation)
    }
}

fn answer(graph: &CompiledGraph, request: &QueryRequest) -> serde_json::Value {
    let answer = run_query(graph, request).expect("answers");
    let text = answer_format::json::to_string(&answer).expect("writes");
    serde_json::from_str(&text).expect("is JSON")
}

fn len(value: &serde_json::Value) -> usize {
    value.as_array().map_or(usize::MAX, Vec::len)
}

#[test]
fn a_chain_ten_thousand_long_is_walked_twenty_hops_and_no_further() {
    let graph = vault(CHAIN, "dependencies", |number| {
        if number + 1 < CHAIN {
            vec![number + 1]
        } else {
            Vec::new()
        }
    });
    let reach = answer(
        &graph,
        &QueryRequest {
            depth: Some(20),
            direction: Some(Direction::Outgoing),
            limit: Some(5),
            ..at("reachability", 0)
        },
    );
    assert_eq!(reach["summary"]["reachableNodes"], 20);
    assert_eq!(len(&reach["paths"]["rows"]), 5);
    assert_eq!(reach["paths"]["limited"], true);

    let impact = answer(
        &graph,
        &QueryRequest {
            depth: Some(20),
            ..at("impact", CHAIN - 1)
        },
    );
    assert_eq!(impact["total"], 20);
    assert_eq!(len(&impact["nodes"]), 20);

    // Four hops of a pattern on a chain are one path, found without keeping a path per node.
    let pattern = answer(
        &graph,
        &QueryRequest {
            pattern: Some(vec!["depends_on".to_string(); 4]),
            ..at("pattern_walk", 5_000)
        },
    );
    assert_eq!(pattern["paths"]["total"], 1);
    assert_eq!(pattern["paths"]["rows"][0]["end"], slug(5_004));

    let lineage = answer(&graph, &at("lineage", 5_000));
    assert_eq!(len(&lineage["ancestors"]["nodes"]), 0);
}

#[test]
fn a_containment_ring_and_a_containment_chain_ten_thousand_long_are_cut_at_the_depth() {
    let ring = vault(CHAIN, "contains", |number| vec![(number + 1) % CHAIN]);
    let tree = answer(&ring, &at("containment_tree", 0));
    assert_eq!(tree["limited"], false);
    assert_eq!(len(&tree["cycles"]), 1);
    assert_eq!(tree["cycles"][0]["from"], slug(CHAIN - 1));
    assert_eq!(tree["cycles"][0]["to"], slug(0));

    let chain = vault(CHAIN, "contains", |number| {
        if number + 1 < CHAIN {
            vec![number + 1]
        } else {
            Vec::new()
        }
    });
    let tree = answer(&chain, &call("containment_tree"));
    assert_eq!(tree["emittedNodes"], 21);
    assert_eq!(len(&tree["cycles"]), 0);
}

#[test]
fn a_hub_fifty_thousand_nodes_lean_on_is_counted_exactly_and_listed_within_limit() {
    let graph = vault(MANY, "dependencies", |number| {
        if number == 0 {
            Vec::new()
        } else {
            vec![0]
        }
    });
    let limit = Some(10);
    let reach = answer(
        &graph,
        &QueryRequest {
            direction: Some(Direction::Incoming),
            depth: Some(1),
            limit,
            ..at("reachability", 0)
        },
    );
    assert_eq!(reach["summary"]["reachableNodes"], MANY - 1);
    assert_eq!(len(&reach["paths"]["rows"]), 10);
    assert_eq!(len(&reach["edges"]["rows"]), 10);

    let impact = answer(&graph, &QueryRequest { limit, ..at("impact", 0) });
    assert_eq!(impact["total"], MANY - 1);
    assert_eq!(len(&impact["nodes"]), 10);
    assert_eq!(len(&impact["edges"]), 10);

    let blast = answer(&graph, &QueryRequest { limit, ..at("blast_radius", 0) });
    assert_eq!(blast["summary"]["affectedNodes"], MANY - 1);
    assert_eq!(len(&blast["nodes"]["rows"]), 10);

    let subgraph = answer(
        &graph,
        &QueryRequest {
            depth: Some(1),
            limit,
            ..at("subgraph", 0)
        },
    );
    assert_eq!(subgraph["totalNodes"], MANY);
    assert_eq!(len(&subgraph["nodes"]), 10);
    assert!(len(&subgraph["edges"]) <= 10);

    let pattern = answer(
        &graph,
        &QueryRequest {
            pattern: Some(vec!["depends_on".to_string(); 3]),
            direction: Some(Direction::Incoming),
            limit,
            ..at("pattern_walk", 0)
        },
    );
    assert_eq!(pattern["paths"]["limited"], true);
    assert!(len(&pattern["paths"]["rows"]) <= 10);
}

#[test]
fn two_nodes_that_share_a_hub_are_explained_through_it() {
    let graph = vault(MANY, "dependencies", |number| {
        if number == 0 {
            Vec::new()
        } else {
            vec![0]
        }
    });
    let explained = answer(
        &graph,
        &QueryRequest {
            from: Some(slug(1)),
            to: Some(slug(2)),
            ..call("explain_relation")
        },
    );
    assert_eq!(explained["commonNeighbors"]["total"], 1);
    assert_eq!(explained["commonNeighbors"]["rows"][0]["slug"], slug(0));
}
