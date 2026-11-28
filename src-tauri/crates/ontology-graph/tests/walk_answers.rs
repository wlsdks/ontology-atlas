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

fn rows(value: &serde_json::Value) -> &[serde_json::Value] {
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

    let slice = answer(
        &graph,
        &QueryRequest {
            depth: Some(2),
            ..from_hub("subgraph")
        },
    );
    assert_eq!(slice["totalNodes"], 6);
    assert_eq!(slice["totalEdges"], 6);
    assert_eq!(rows(&slice["nodes"]).len(), 2);
    assert_eq!(rows(&slice["edges"]).len(), 1);
    assert_eq!(slice["limited"], true);
}

/// A capability file whose uid is `number`, holding the capabilities `holds`.
fn holder(name: &str, number: usize, holds: &[&str]) -> (String, String) {
    let lines: String = holds
        .iter()
        .map(|held| format!("  - capabilities/{held}\n"))
        .collect();
    let extra = if holds.is_empty() {
        String::new()
    } else {
        format!("contains:\n{lines}")
    };
    (
        format!("capabilities/{name}.md"),
        node(number, "capability", &extra),
    )
}

#[test]
fn lineage_writes_the_edges_it_may_and_counts_all_of_them() {
    let graph = compiled(&[
        holder("p1", 1, &["c"]),
        holder("p2", 2, &["c"]),
        holder("p3", 3, &["c"]),
        holder("c", 4, &[]),
    ]);
    let lineage = |limit| {
        answer(
            &graph,
            &QueryRequest {
                slug: Some("capabilities/c".to_string()),
                limit: Some(limit),
                ..call("lineage")
            },
        )
    };
    let cut = lineage(2);
    assert_eq!(cut["ancestors"]["total"], 3);
    assert_eq!(rows(&cut["ancestors"]["nodes"]).len(), 2);
    assert_eq!(cut["edges"]["total"], 3);
    assert_eq!(rows(&cut["edges"]["rows"]).len(), 2);
    assert_eq!(cut["edges"]["limited"], true);

    let whole = lineage(3);
    assert_eq!(rows(&whole["edges"]["rows"]).len(), 3);
    assert_eq!(whole["edges"]["limited"], false);
}

#[test]
fn a_containment_tree_cuts_the_cycles_it_lists_at_limit_and_says_so() {
    // Each of b, c and d holds every capability above it: six cycles in a tree of four nodes.
    let graph = compiled(&[
        holder("a", 1, &["b"]),
        holder("b", 2, &["a", "c"]),
        holder("c", 3, &["a", "b", "d"]),
        holder("d", 4, &["a", "b", "c"]),
    ]);
    let tree = |limit| {
        answer(
            &graph,
            &QueryRequest {
                slug: Some("capabilities/a".to_string()),
                limit: Some(limit),
                ..call("containment_tree")
            },
        )
    };
    let cut = tree(4);
    assert_eq!(cut["emittedNodes"], 4);
    assert_eq!(rows(&cut["cycles"]).len(), 4);
    assert_eq!(cut["limited"], true);

    let whole = tree(6);
    assert_eq!(rows(&whole["cycles"]).len(), 6);
    assert_eq!(whole["limited"], false);
}

#[test]
fn blast_radius_names_the_nearest_domain_and_a_named_one_before_any() {
    let lean = "dependencies:\n  - capabilities/hub\n";
    let domain = |name: &str, number, holds: &[&str]| {
        let lines: String = holds
            .iter()
            .map(|held| format!("  - capabilities/{held}\n"))
            .collect();
        (
            format!("domains/{name}.md"),
            node(number, "domain", &format!("capabilities:\n{lines}")),
        )
    };
    let graph = compiled(&[
        domain("d1", 1, &["p1", "q", "r"]),
        domain("d2", 2, &["p2"]),
        holder("p1", 3, &["n"]),
        holder("p2", 4, &["n", "q"]),
        capability("hub", 5, &[]),
        // Held by p1 and p2, each one step below a domain: the holder first in the order wins.
        ("capabilities/n.md".to_string(), node(6, "capability", lean)),
        // Held by d1 itself and, further down, by d2 through p2: the nearer wins.
        ("capabilities/q.md".to_string(), node(7, "capability", lean)),
        // Held by d1 but naming d2 as its domain: the name wins.
        (
            "capabilities/r.md".to_string(),
            node(8, "capability", &format!("domain: domains/d2\n{lean}")),
        ),
    ]);
    let blast = answer(
        &graph,
        &QueryRequest {
            slug: Some("capabilities/hub".to_string()),
            ..call("blast_radius")
        },
    );
    let domain_of = |slug: &str| {
        rows(&blast["nodes"]["rows"])
            .iter()
            .find(|row| row["slug"] == slug)
            .map(|row| row["domain"].clone())
    };
    assert_eq!(domain_of("capabilities/n"), Some("domains/d1".into()));
    assert_eq!(domain_of("capabilities/q"), Some("domains/d1".into()));
    assert_eq!(domain_of("capabilities/r"), Some("domains/d2".into()));
}

#[test]
fn of_two_equally_short_ways_a_walk_takes_the_one_whose_node_comes_first_in_the_graph() {
    // `capabilities/build` comes before `capabilities/build-index` in the order of the graph, so
    // a walk that goes through one of them goes through it, though `-` sorts before `:` in the
    // text `slug:edge` that the script server ordered by.
    let graph = compiled(&[
        capability("start", 1, &["build", "build-index"]),
        capability("build", 2, &["target"]),
        capability("build-index", 3, &["target"]),
        capability("target", 4, &[]),
    ]);
    let between = |operation: &str| QueryRequest {
        from: Some("capabilities/start".to_string()),
        to: Some("capabilities/target".to_string()),
        ..call(operation)
    };
    let through_build = serde_json::json!([
        "capabilities/start",
        "capabilities/build",
        "capabilities/target"
    ]);

    assert_eq!(answer(&graph, &between("path"))["hops"], through_build);
    let explained = answer(&graph, &between("explain_relation"));
    assert_eq!(explained["shortestPath"]["hops"], through_build);

    let reach = answer(
        &graph,
        &QueryRequest {
            slug: Some("capabilities/start".to_string()),
            ..call("reachability")
        },
    );
    let to_target = rows(&reach["paths"]["rows"])
        .iter()
        .find(|row| row["slug"] == "capabilities/target")
        .map(|row| row["path"].clone());
    assert_eq!(to_target, Some(through_build));
}
