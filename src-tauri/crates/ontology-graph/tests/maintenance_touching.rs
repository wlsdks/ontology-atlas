//! `maintenance_plan` with `touching`: a write asks only about the nodes it just changed, so the
//! steps it names are about those nodes and no others, whatever the rest of the vault needs.

mod support;

use ontology_graph::{run_query, Operation, QueryRequest};
use serde_json::Value;
use support::{compiled, node};

fn files(count: usize) -> Vec<(String, String)> {
    (0..count)
        .map(|number| {
            (
                format!("capabilities/n{number:03}.md"),
                node(number, "capability", ""),
            )
        })
        .collect()
}

fn plan(touching: Option<Vec<&str>>) -> Vec<Value> {
    let graph = compiled(&files(30));
    let mut request = QueryRequest::new(Operation::parse("maintenance_plan").expect("an operation"));
    request.limit = Some(100);
    request.selection.arguments.touching =
        touching.map(|slugs| slugs.into_iter().map(str::to_string).collect());
    let answer = run_query(&graph, &request).expect("answers");
    let text = answer_format::json::to_string(&answer).expect("writes");
    let parsed: Value = serde_json::from_str(&text).expect("json");
    parsed
        .get("actions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

#[test]
fn only_steps_about_the_touched_nodes_are_planned() {
    let whole = plan(None);
    let touched = plan(Some(vec!["capabilities/n007"]));
    assert!(whole.len() > touched.len(), "the vault needs work beyond one node");
    assert!(!touched.is_empty(), "the touched node has a step of its own");
    for action in &touched {
        assert!(
            action.to_string().contains("capabilities/n007"),
            "a step about another node: {action}"
        );
    }
}

fn answer_for(touching: &str, limit: usize) -> Value {
    let graph = compiled(&files(30));
    let mut request =
        QueryRequest::new(Operation::parse("maintenance_plan").expect("an operation"));
    request.limit = Some(limit);
    request.selection.arguments.touching = Some(vec![touching.to_string()]);
    let answer = run_query(&graph, &request).expect("answers");
    let text = answer_format::json::to_string(&answer).expect("writes");
    serde_json::from_str(&text).expect("json")
}

#[test]
fn a_page_of_one_still_counts_every_step_about_a_node_the_scan_reaches_late() {
    let whole = answer_for("capabilities/n029", 100);
    let counted = whole["summary"]["filteredActions"]
        .as_u64()
        .expect("a count");
    assert!(counted >= 1, "the touched node has a step of its own");
    let page = answer_for("capabilities/n029", 1);
    assert_eq!(page["actions"].as_array().map(Vec::len), Some(1));
    assert_eq!(
        page["summary"]["filteredActions"].as_u64(),
        Some(counted),
        "a page of one must not shorten the count of steps about the node"
    );
}
