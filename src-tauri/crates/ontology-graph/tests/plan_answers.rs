//! `query_plan` against the operations it describes: a plan must state the arguments and the counts
//! the operation itself would use, refuse what the operation refuses, and cost no more than one
//! pass over the edges a level, however many cycles the graph holds.

mod support;

use std::time::{Duration, Instant};

use ontology_graph::{compile, run_query, CompiledGraph, Operation, QueryError, QueryRequest};
use serde_json::Value;
use support::{node, plant};

fn slug(number: usize) -> String {
    format!("capabilities/n{number:03}")
}

/// `count` capabilities; node `n` depends on every node `targets(n)` gives.
fn vault(count: usize, targets: impl Fn(usize) -> Vec<usize>) -> CompiledGraph {
    let files: Vec<(String, String)> = (0..count)
        .map(|number| {
            let lines: String = targets(number)
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

fn call(operation: &str) -> QueryRequest {
    QueryRequest::new(Operation::parse(operation).expect("an operation the tool offers"))
}

fn plan_of(target: &str, request: QueryRequest) -> QueryRequest {
    QueryRequest {
        target_operation: Operation::parse(target),
        ..request
    }
}

fn json_of(graph: &CompiledGraph, request: &QueryRequest) -> Value {
    let answer = run_query(graph, request).expect("answers");
    let text = answer_format::json::to_string(&answer).expect("writes");
    serde_json::from_str(&text).expect("is JSON")
}

fn plan(graph: &CompiledGraph, target: &str, request: QueryRequest) -> Value {
    json_of(graph, &plan_of(target, QueryRequest { ..request }))
}

fn chain() -> CompiledGraph {
    vault(8, |number| {
        if number + 1 < 8 {
            vec![number + 1]
        } else {
            Vec::new()
        }
    })
}

fn at(operation: &str, number: usize) -> QueryRequest {
    QueryRequest {
        slug: Some(slug(number)),
        ..call(operation)
    }
}

#[test]
fn a_plan_states_the_arguments_each_operation_takes_when_a_call_leaves_them_out() {
    let graph = chain();
    for operation in ["reachability", "impact", "blast_radius", "subgraph"] {
        let planned = plan(&graph, operation, at("query_plan", 3));
        let ran = json_of(&graph, &at(operation, 3));
        for field in ["direction", "depth"] {
            assert_eq!(
                planned["normalized"][field], ran[field],
                "{operation} {field}"
            );
        }
    }
    let between = |operation: &str| QueryRequest {
        from: Some(slug(0)),
        to: Some(slug(5)),
        ..call(operation)
    };
    let planned = plan(&graph, "all_paths", between("query_plan"));
    let ran = json_of(&graph, &between("all_paths"));
    for field in ["direction", "maxHops", "limit", "searchBudget"] {
        assert_eq!(
            planned["normalized"][field], ran[field],
            "all_paths {field}"
        );
    }
    let planned = plan(&graph, "match_nodes", call("query_plan"));
    let ran = json_of(&graph, &call("match_nodes"));
    assert_eq!(planned["estimate"]["totalMatches"], ran["totalMatches"]);
    let planned = plan(&graph, "match_edges", call("query_plan"));
    let ran = json_of(&graph, &call("match_edges"));
    assert_eq!(planned["estimate"]["totalMatches"], ran["totalMatches"]);
    assert_eq!(planned["normalized"]["limit"], 100);
}

#[test]
fn the_call_a_plan_suggests_keeps_the_subject_and_the_edges_the_call_asked_for() {
    let graph = chain();
    let planned = plan(
        &graph,
        "neighbors",
        QueryRequest {
            include_external: Some(true),
            types: Some(vec!["depends_on".to_string()]),
            ..at("query_plan", 2)
        },
    );
    assert_eq!(
        planned["execution"]["suggestedQuery"],
        serde_json::json!({
            "operation": "neighbors",
            "slug": slug(2),
            "direction": "both",
            "limit": 100,
            "includeExternal": true,
            "types": ["depends_on"],
        })
    );
    assert_eq!(planned["estimate"]["edgeScans"], 2);
    let profile = plan(&graph, "node_profile", at("query_plan", 2));
    assert_eq!(profile["execution"]["suggestedQuery"]["slug"], slug(2));
    assert_eq!(profile["estimate"]["strategy"], "aggregate_scan");
}

#[test]
fn a_plan_refuses_what_the_operation_refuses() {
    let graph = chain();
    let refused = |target: &str, request: QueryRequest| {
        run_query(&graph, &plan_of(target, request))
            .err()
            .expect("refused")
    };
    let structural = QueryRequest {
        types: Some(vec!["contains".to_string()]),
        ..at("query_plan", 1)
    };
    let expected = run_query(
        &graph,
        &QueryRequest {
            types: Some(vec!["contains".to_string()]),
            ..at("impact", 1)
        },
    )
    .err()
    .expect("refused");
    assert_eq!(refused("impact", structural), expected);
    assert!(matches!(
        refused(
            "neighbors",
            QueryRequest {
                slug: Some("capabilities/missing".to_string()),
                ..call("query_plan")
            }
        ),
        QueryError::UnknownNode { field: "slug", .. }
    ));
    assert!(matches!(
        run_query(&graph, &call("query_plan")).err(),
        Some(QueryError::Invalid(_))
    ));
    assert!(matches!(
        refused("query_plan", call("query_plan")),
        QueryError::NotAnAllowedValue { .. }
    ));
}

#[test]
fn a_search_over_a_ring_of_cycles_is_counted_once_per_node_and_stops_when_nothing_is_new() {
    let ring = vault(30, |number| vec![(number + 1) % 30, (number + 2) % 30]);
    let started = Instant::now();
    let planned = plan(
        &ring,
        "all_paths",
        QueryRequest {
            from: Some(slug(0)),
            to: Some(slug(15)),
            max_hops: Some(20),
            ..call("query_plan")
        },
    );
    assert!(started.elapsed() < Duration::from_secs(5));
    assert_eq!(planned["estimate"]["reachableWithinDepth"], 29);
    let levels = planned["estimate"]["frontierByDepth"]
        .as_array()
        .expect("levels")
        .len();
    assert!(
        levels < 20,
        "the search ends when it reaches nothing new: {levels} levels"
    );
    let bound = planned["estimate"]["potentialPathUpperBound"]
        .as_f64()
        .expect("a number");
    assert!(bound > 1e6, "{bound}");
    assert_eq!(planned["estimate"]["costClass"], "high");
    assert_eq!(planned["execution"]["shouldRun"], false);
    assert_eq!(planned["execution"]["nextStep"], "narrow");
    assert_eq!(planned["execution"]["saferQuery"]["maxHops"], 3);
    assert_eq!(planned["execution"]["saferQuery"]["limit"], 10);
    assert!(planned["warnings"].as_array().expect("warnings").len() == 2);
}
