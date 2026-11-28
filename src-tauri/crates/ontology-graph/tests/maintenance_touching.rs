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
