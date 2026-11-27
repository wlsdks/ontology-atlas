//! What the walks of `query_ontology` say on small vaults where one rule decides the answer: an
//! edge found from both of its ends, a tie between equally near nodes, a list longer than `limit`.

mod support;

use ontology_graph::{run_query, CompiledGraph, Direction, Operation, QueryRequest};
use support::{compiled, node};

/// A capability file whose uid is `number`, depending on the capabilities `depends_on`.
fn capability(name: &str, number: usize, depends_on: &[&str]) -> (String, String) {
    let extra = if depends_on.is_empty() {
        String::new()
    } else {
        let lines: String = depends_on
            .iter()
            .map(|target| format!("  - capabilities/{target}\n"))
            .collect();
        format!("dependencies:\n{lines}")
    };
    (
        format!("capabilities/{name}.md"),
        node(number, "capability", &extra),
    )
}

fn call(operation: &str) -> QueryRequest {
    QueryRequest::new(Operation::parse(operation).expect("an operation the tool offers"))
}

fn answer(graph: &CompiledGraph, request: &QueryRequest) -> serde_json::Value {
    let answer = run_query(graph, request).expect("answers");
    let text = answer_format::json::to_string(&answer).expect("writes");
    serde_json::from_str(&text).expect("is JSON")
}

fn rows<'a>(value: &'a serde_json::Value) -> &'a [serde_json::Value] {
    value.as_array().map_or(&[], Vec::as_slice)
}

/// `a` and `b` both depend on `hub`, and `a` depends on `b`: a triangle whose every edge is met
/// from both of its ends when a walk follows edges either way.
fn triangle() -> CompiledGraph {
    compiled(&[
        capability("hub", 1, &[]),
        capability("a", 2, &["hub", "b"]),
        capability("b", 3, &["hub"]),
    ])
}

#[test]
fn an_edge_a_walk_meets_from_both_ends_is_listed_and_counted_once() {
    let graph = triangle();
    let from_hub = |operation: &str| QueryRequest {
        slug: Some("capabilities/hub".to_string()),
        direction: Some(Direction::Both),
        depth: Some(2),
        ..call(operation)
    };

    let reach = answer(&graph, &from_hub("reachability"));
    assert_eq!(reach["summary"]["traversedEdges"], 3);
    assert_eq!(reach["edges"]["total"], 3);
    assert_eq!(reach["byRelation"]["dependencies"], 3);
    let edges = rows(&reach["edges"]["rows"]);
    assert_eq!(edges.len(), 3);
    for edge in edges {
        assert_eq!(
            edge["traversedFrom"], edge["from"],
            "written from its start"
        );
        assert_eq!(edge["traversedTo"], edge["to"]);
    }

    let impact = answer(&graph, &from_hub("impact"));
    assert_eq!(rows(&impact["edges"]).len(), 3);
    assert_eq!(impact["qualification"]["declaredEdges"], 3);

    let blast = answer(&graph, &from_hub("blast_radius"));
    assert_eq!(blast["summary"]["affectedEdges"], 3);
    assert_eq!(rows(&blast["edges"]["rows"]).len(), 3);
}

/// `hub` with five capabilities that depend on it, and the first of them also on the second.
fn hub_with_five_dependents() -> CompiledGraph {
    compiled(&[
        capability("hub", 1, &[]),
        capability("n1", 2, &["hub", "n2"]),
        capability("n2", 3, &["hub"]),
        capability("n3", 4, &["hub"]),
        capability("n4", 5, &["hub"]),
        capability("n5", 6, &["hub"]),
    ])
}

#[test]
fn a_limit_cuts_the_lists_an_answer_writes_and_not_what_it_counts() {
    let graph = hub_with_five_dependents();
    let from_hub = |operation: &str| QueryRequest {
        slug: Some("capabilities/hub".to_string()),
        limit: Some(2),
        ..call(operation)
    };

    let reach = answer(
        &graph,
        &QueryRequest {
            direction: Some(Direction::Incoming),
            ..from_hub("reachability")
        },
    );
    assert_eq!(reach["summary"]["reachableNodes"], 5);
    assert_eq!(reach["summary"]["traversedEdges"], 6);
    assert_eq!(reach["summary"]["layers"], 1);
    assert_eq!(reach["summary"]["terminalNodes"], 4);
    assert_eq!(reach["byRelation"]["dependencies"], 6);
    assert_eq!(reach["layers"][0]["total"], 5);
    assert_eq!(rows(&reach["layers"][0]["nodes"]).len(), 2);
    assert_eq!(rows(&reach["terminalNodes"]).len(), 2);
    // Three edges join the hub and the two nodes shown; two are written and the page says so.
    assert_eq!(reach["edges"]["total"], 6);
    assert_eq!(rows(&reach["edges"]["rows"]).len(), 2);
    assert_eq!(reach["edges"]["limited"], true);

    for operation in ["subgraph", "builder_context"] {
        let slice = answer(
            &graph,
            &QueryRequest {
                depth: Some(2),
                ..from_hub(operation)
            },
        );
        assert_eq!(slice["totalNodes"], 6, "{operation}");
        assert_eq!(slice["totalEdges"], 6, "{operation}");
        assert_eq!(rows(&slice["nodes"]).len(), 2, "{operation}");
        assert_eq!(rows(&slice["edges"]).len(), 1, "{operation}");
        assert_eq!(slice["limited"], true, "{operation}");
    }
}
