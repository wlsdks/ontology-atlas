//! `query_plan` against the operations it describes: a plan must state the arguments and the counts
//! the operation itself would use, refuse what the operation refuses, and cost no more than one
//! pass over the edges a level, however many cycles the graph holds.

mod support;

use std::time::{Duration, Instant};

use ontology_graph::{
    compile, run_query, CompiledGraph, Direction, Operation, QueryError, QueryRequest,
};
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

const BIG: usize = 230;
/// Nodes in pairs that depend on each other: more cycles and more components than any default limit.
const PAIRED: usize = 50;

fn big_slug(number: usize) -> String {
    format!("capabilities/c{number:03}")
}

/// A project that holds one domain of `BIG` capabilities, each depending on the first and on the one
/// before it, the first depending back on the second (a cycle), and `PAIRED` capabilities in
/// two-node cycles: most default limits of most operations are past their end somewhere in it.
fn big_vault() -> CompiledGraph {
    let mut files: Vec<(String, String)> = (0..BIG)
        .map(|number| {
            let mut lines = String::new();
            if number == 0 {
                lines.push_str(&format!("  - {}\n", big_slug(1)));
            } else {
                lines.push_str(&format!(
                    "  - {}\n  - {}\n",
                    big_slug(0),
                    big_slug(number - 1)
                ));
            }
            (
                format!("{}.md", big_slug(number)),
                node(
                    100 + number,
                    "capability",
                    &format!("dependencies:\n{lines}"),
                ),
            )
        })
        .collect();
    for paired in 0..PAIRED {
        let partner = paired ^ 1;
        files.push((
            format!("capabilities/pair{paired:02}.md"),
            node(
                1000 + paired,
                "capability",
                &format!("dependencies:\n  - capabilities/pair{partner:02}\n"),
            ),
        ));
    }
    let held: String = (0..BIG)
        .map(|number| format!("  - {}\n", big_slug(number)))
        .collect();
    files.push((
        "domains/core.md".to_string(),
        node(2, "domain", &format!("capabilities:\n{held}")),
    ));
    files.push((
        "atlas.md".to_string(),
        node(1, "project", "domains:\n  - domains/core\n"),
    ));
    compile(&plant(&files).documents).expect("compiles")
}

/// The call each operation needs to answer on `big_vault`, whatever else it has defaults for.
fn subject_of(target: &str) -> QueryRequest {
    let hub = Some(big_slug(0));
    let request = call(target);
    match target {
        "path" | "all_paths" | "explain_relation" => QueryRequest {
            from: Some(big_slug(100)),
            to: hub,
            ..request
        },
        "relation_check" => QueryRequest {
            from: Some(big_slug(100)),
            to: Some(big_slug(101)),
            relation_type: Some("relates".to_string()),
            ..request
        },
        "pattern_walk" => QueryRequest {
            slug: hub,
            pattern: Some(vec!["depends_on".to_string()]),
            ..request
        },
        "containment_tree" => QueryRequest {
            slug: Some("atlas".to_string()),
            ..request
        },
        "project_scope" | "project_map" => QueryRequest {
            project: Some("atlas".to_string()),
            ..request
        },
        "domain_profile" | "lineage" => QueryRequest {
            slug: Some("domains/core".to_string()),
            ..request
        },
        "recommend_relations" => {
            let mut request = request;
            request.selection.arguments.kind = Some("capability".to_string());
            request
        }
        "neighbors" | "reachability" | "impact" | "blast_radius" | "subgraph"
        | "builder_context" | "node_profile" | "similar_nodes" => QueryRequest {
            slug: hub,
            ..request
        },
        _ => request,
    }
}

/// The plan of the call `request` makes.
fn planning(request: &QueryRequest) -> QueryRequest {
    QueryRequest {
        operation: Operation::QueryPlan,
        target_operation: Some(request.operation),
        ..request.clone()
    }
}

/// `request` with the arguments a plan stated for it set: what the plan says the operation would
/// use, put where the operation reads it.
fn with_stated(request: &QueryRequest, stated: &Value) -> QueryRequest {
    let count = |name: &str| stated[name].as_u64().and_then(|n| usize::try_from(n).ok());
    let mut request = request.clone();
    request.direction = stated["direction"].as_str().and_then(Direction::parse);
    request.depth = count("depth");
    request.max_hops = count("maxHops");
    request.iterations = count("iterations");
    request.limit = count("limit");
    request.search_budget = stated["searchBudget"].as_f64();
    request
}

#[test]
fn a_plan_for_every_operation_states_what_the_operation_does_when_a_call_leaves_it_out() {
    let graph = big_vault();
    let mut planned_count = 0;
    for target in Operation::plan_target_names() {
        let sent = subject_of(target);
        let planned = json_of(&graph, &planning(&sent));
        let stated = &planned["normalized"];
        let bare = run_query(&graph, &sent);
        if matches!(bare, Err(QueryError::NotAnsweredYet(_))) {
            continue;
        }
        let expected = json_of(&graph, &sent);
        let with_stated_arguments = json_of(&graph, &with_stated(&sent, stated));
        assert_eq!(
            with_stated_arguments, expected,
            "{target}: running with the arguments its plan states changes the answer"
        );
        planned_count += 1;
    }
    assert_eq!(planned_count, 34);
}

#[test]
fn a_plan_states_a_limit_where_the_operation_has_one_and_none_where_it_has_not() {
    let graph = big_vault();
    let limit_of = |target: &str| {
        json_of(&graph, &planning(&subject_of(target)))["normalized"]["limit"].clone()
    };
    assert_eq!(limit_of("node_profile"), 20);
    assert_eq!(limit_of("explain_relation"), 20);
    assert_eq!(limit_of("centrality"), 10);
    assert_eq!(limit_of("containment_tree"), 200);
    assert_eq!(limit_of("health"), Value::Null);
    assert_eq!(limit_of("path"), Value::Null);
}

#[test]
fn a_plan_counts_what_the_operation_counts() {
    let graph = chain();
    let planned = plan(&graph, "match_nodes", call("query_plan"));
    let ran = json_of(&graph, &call("match_nodes"));
    assert_eq!(planned["estimate"]["totalMatches"], ran["totalMatches"]);
    let planned = plan(&graph, "match_edges", call("query_plan"));
    let ran = json_of(&graph, &call("match_edges"));
    assert_eq!(planned["estimate"]["totalMatches"], ran["totalMatches"]);
}

#[test]
fn a_plan_names_its_start_the_way_the_operation_does() {
    let graph = big_vault();
    let by_seed = |operation: &str, name: &str| QueryRequest {
        seed: Some(name.to_string()),
        ..call(operation)
    };
    for operation in ["reachability", "impact", "blast_radius"] {
        let refused = run_query(&graph, &by_seed(operation, &big_slug(0))).err();
        assert!(refused.is_some(), "{operation} takes no seed");
        let planned = run_query(
            &graph,
            &plan_of(operation, by_seed("query_plan", &big_slug(0))),
        )
        .err();
        assert_eq!(planned, refused, "{operation}");
    }
    let focus = "domain:core";
    let planned = plan(&graph, "builder_context", by_seed("query_plan", focus));
    let ran = json_of(&graph, &by_seed("builder_context", focus));
    assert_eq!(planned["normalized"]["slug"], ran["focus"]);
    assert_eq!(planned["normalized"]["slug"], "domains/core");
    let planned = plan(&graph, "subgraph", by_seed("query_plan", &big_slug(5)));
    assert_eq!(planned["normalized"]["slug"], big_slug(5));
    assert!(run_query(&graph, &by_seed("subgraph", focus)).is_err());
    assert!(run_query(&graph, &plan_of("subgraph", by_seed("query_plan", focus))).is_err());
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
