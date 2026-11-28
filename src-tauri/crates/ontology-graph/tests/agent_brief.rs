//! `agent_brief`: the project an agent is about to work in, the nodes to start from and the calls
//! to make first, with arguments written in the order an agent reads them.

mod support;

use ontology_graph::{project_holdings, run_query, Operation, QueryError, QueryRequest};
use serde_json::Value;
use support::{compiled, node};

fn vault_of_two_projects() -> Vec<(String, String)> {
    let linked = |number: usize, kind: &str, holds: &str| {
        let folder = if kind == "capability" {
            "capabilities".to_string()
        } else {
            format!("{kind}s")
        };
        (format!("{folder}/n{number}.md"), node(number, kind, holds))
    };
    vec![
        linked(1, "project", "domains:\n  - domains/n2\n"),
        linked(
            2,
            "domain",
            "capabilities:\n  - capabilities/n3\n  - capabilities/n4\n",
        ),
        linked(3, "capability", "dependencies:\n  - capabilities/n4\n"),
        linked(4, "capability", ""),
        linked(5, "project", ""),
    ]
}

fn brief(files: &[(String, String)], project: Option<&str>) -> Value {
    let graph = compiled(files);
    let mut request = QueryRequest::new(Operation::parse("agent_brief").expect("an operation"));
    request.project = project.map(str::to_string);
    let answer = run_query(&graph, &request).expect("answers");
    let text = answer_format::json::to_string(&answer).expect("writes");
    serde_json::from_str(&text).expect("json")
}

#[test]
fn a_project_holds_what_its_containment_reaches_and_nothing_of_another_project() {
    let graph = compiled(&vault_of_two_projects());
    let held = project_holdings(&graph, Some("projects/n1"))
        .expect("a project")
        .expect("one is named");
    assert_eq!(held.project, "projects/n1");
    assert_eq!(held.node_count(), 4);
    assert!(held.holds("capabilities/n4"));
    assert!(!held.holds("projects/n5"));
}

#[test]
fn a_vault_of_several_projects_asks_which_one_the_brief_is_about() {
    let graph = compiled(&vault_of_two_projects());
    let Err(QueryError::Invalid(message)) = project_holdings(&graph, None) else {
        panic!("two projects and none named is a call to correct");
    };
    assert_eq!(
        message,
        "project is required when the vault contains multiple project nodes. Choose one of: projects/n1, projects/n5."
    );
}

#[test]
fn the_first_calls_start_from_the_most_connected_node_and_name_a_neighbour_to_check() {
    let answer = brief(&vault_of_two_projects()[..4], Some("projects/n1"));
    let calls = &answer["firstCalls"];
    let relation_check = &calls[4]["arguments"];
    assert_eq!(relation_check["operation"], "relation_check");
    assert_eq!(relation_check["type"], "depends_on");
    let start = relation_check["from"].as_str().expect("a slug");
    assert_eq!(answer["entrypoints"][0]["slug"], start);
    assert_ne!(
        relation_check["to"], start,
        "a node is not its own neighbour"
    );
    let line = answer["handoffPrompt"].as_str().expect("text");
    assert!(
        line.contains(&format!(
            "3. query_ontology {{\"operation\":\"query_plan\",\"targetOperation\":\"blast_radius\",\"slug\":\"{start}\",\"depth\":2}}"
        )),
        "the prompt prints each call with its arguments in the order they were written: {line}"
    );
}
