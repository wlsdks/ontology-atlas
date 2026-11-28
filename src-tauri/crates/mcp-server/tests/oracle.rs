//! The Rust server against the JavaScript one it replaces, on the `samples/storefront` vault.
//!
//! Both programs get the same input and the same environment; every answer line must be equal byte
//! for byte, matched by request id, and so must standard error and the exit status. The full
//! differential harness compares every family; this is the direct comparison the shell needs, and
//! leaves out what the specification lists as a declared change.
//! Without Node and the server's packages the tests print a line and pass, unless
//! `OATLAS_REQUIRE_ORACLE` is set, which makes a missing oracle a failure.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "these tests start the program and read and plant the files a write leaves"
)]

mod support;

use support::{
    by_id, call, initialize, javascript_oracle_available, ping, request, run_to_end, Program, Run,
    INITIALIZED,
};

/// The names that answer `tool_retired` and run nothing, wherever the call comes from.
const RETIRED_NAMES: [&str; 9] = [
    "git_status",
    "git_history",
    "git_snapshot",
    "list_constellations",
    "find_evidence",
    "find_orphans",
    "query_concepts",
    "replace_relation",
    "reclassify_concept",
];

fn oracle_ready() -> bool {
    if javascript_oracle_available() {
        return true;
    }
    assert!(
        std::env::var_os("OATLAS_REQUIRE_ORACLE").is_none(),
        "OATLAS_REQUIRE_ORACLE is set but Node or mcp/node_modules is missing"
    );
    eprintln!("skipped: the JavaScript oracle (node and mcp/node_modules) is not available here");
    false
}

fn both(environment: &[(&str, &str)], input: &str) -> (Run, Run) {
    (
        run_to_end(Program::JavaScript, environment, input.as_bytes()),
        run_to_end(Program::Rust, environment, input.as_bytes()),
    )
}

fn assert_equal(label: &str, environment: &[(&str, &str)], input: &str) {
    let (javascript, rust) = both(environment, input);
    assert_eq!(by_id(&rust), by_id(&javascript), "{label}: answers differ");
    assert_eq!(
        rust.stderr, javascript.stderr,
        "{label}: standard error differs"
    );
    assert_eq!(rust.code, javascript.code, "{label}: exit status differs");
}

#[test]
fn initialize_is_byte_equal_for_every_negotiated_version_a_newer_one_and_an_unknown_one() {
    if !oracle_ready() {
        return;
    }
    for version in [
        "2025-11-25",
        "2025-06-18",
        "2025-03-26",
        "2024-11-05",
        "2024-10-07",
        "2099-01-01",
        "1999-01-01",
        "",
    ] {
        assert_equal(
            &format!("initialize {version:?}"),
            &[],
            &initialize(version),
        );
    }
}

#[test]
fn initialize_and_tools_list_are_byte_equal_under_each_mode() {
    if !oracle_ready() {
        return;
    }
    let input = format!(
        "{}{INITIALIZED}{}",
        initialize("2025-11-25"),
        request(2, "tools/list", "{}")
    );
    for (label, environment) in [
        ("default", vec![]),
        ("read-only", vec![("OATLAS_READ_ONLY", "1")]),
        ("read-only spelled yes", vec![("OATLAS_READ_ONLY", " YES ")]),
        (
            "construction profile",
            vec![("OATLAS_TOOL_PROFILE", "construction")],
        ),
        (
            "construction and read-only",
            vec![
                ("OATLAS_TOOL_PROFILE", "construction"),
                ("OATLAS_READ_ONLY", "true"),
            ],
        ),
        (
            "full profile spelled out",
            vec![("OATLAS_TOOL_PROFILE", "full")],
        ),
        ("write consent on", vec![("OATLAS_WRITE_CONSENT", "1")]),
        ("read-only off spelled 0", vec![("OATLAS_READ_ONLY", "0")]),
    ] {
        assert_equal(label, &environment, &input);
    }
}

#[test]
fn the_protocol_table_rows_are_byte_equal() {
    if !oracle_ready() {
        return;
    }
    let cancel = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":2}}\n";
    let scenarios: Vec<(&str, String)> = vec![
        ("before initialize", format!("{}{}", request(1, "tools/list", "{}"), ping(2))),
        ("not json", format!("{{not json\n{}", ping(9))),
        ("batch", format!("[{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}}]\n{}", ping(9))),
        ("id null", format!("{{\"jsonrpc\":\"2.0\",\"id\":null,\"method\":\"ping\"}}\n{}", ping(9))),
        ("id 1.5", format!("{{\"jsonrpc\":\"2.0\",\"id\":1.5,\"method\":\"ping\"}}\n{}", ping(9))),
        ("id true", format!("{{\"jsonrpc\":\"2.0\",\"id\":true,\"method\":\"ping\"}}\n{}", ping(9))),
        ("id object", format!("{{\"jsonrpc\":\"2.0\",\"id\":{{}},\"method\":\"ping\"}}\n{}", ping(9))),
        ("id above 2^53", format!("{{\"jsonrpc\":\"2.0\",\"id\":9007199254740992,\"method\":\"ping\"}}\n{}", ping(9))),
        ("id 2^53-1", "{\"jsonrpc\":\"2.0\",\"id\":9007199254740991,\"method\":\"ping\"}\n".to_string()),
        (
            "lone surrogate ids echoed as written",
            "{\"jsonrpc\":\"2.0\",\"id\":\"a\\ud800b\",\"method\":\"ping\"}\n{\"jsonrpc\":\"2.0\",\"id\":\"a\\uD801b\",\"method\":\"ping\"}\n{\"jsonrpc\":\"2.0\",\"id\":\"\\ude00\\ud83d\",\"method\":\"ping\"}\n{\"jsonrpc\":\"2.0\",\"id\":\"\\ud83d\\ude00\",\"method\":\"ping\"}\n".to_string(),
        ),
        (
            "cancel names a lone surrogate id",
            format!("{}{}{}{}", ping(2), "{\"jsonrpc\":\"2.0\",\"id\":\"a\\ud800b\",\"method\":\"ping\"}\n", "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":\"a\\ud800b\"}}\n", ping(9)),
        ),
        ("id 1e2 and -0 and a string","{\"jsonrpc\":\"2.0\",\"id\":1e2,\"method\":\"ping\"}\n{\"jsonrpc\":\"2.0\",\"id\":-0,\"method\":\"ping\"}\n{\"jsonrpc\":\"2.0\",\"id\":\"é😀\",\"method\":\"ping\"}\n".to_string()),
        ("no jsonrpc", format!("{{\"id\":1,\"method\":\"ping\"}}\n{}", ping(9))),
        ("jsonrpc 1.0", format!("{{\"jsonrpc\":\"1.0\",\"id\":1,\"method\":\"ping\"}}\n{}", ping(9))),
        ("extra top-level key", format!("{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"x\":1}}\n{}", ping(9))),
        ("params null", format!("{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":null}}\n{}", ping(9))),
        ("params array", format!("{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":[]}}\n{}", ping(9))),
        ("meta number", format!("{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":{{\"_meta\":5}}}}\n{}", ping(9))),
        ("ping with params", request(2, "ping", "{\"a\":1}")),
        ("method number", format!("{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":5}}\n{}", ping(9))),
        ("no method", format!("{{\"jsonrpc\":\"2.0\",\"id\":1}}\n{}", ping(9))),
        ("scalars", format!("5\nnull\n\"x\"\n{}", ping(9))),
        ("blank lines", format!("\n   \n{}", ping(9))),
        ("carriage return line ends", "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"ping\"}\r\n".to_string()),
        ("byte-order mark", format!("\u{feff}{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}}\n{}", ping(9))),
        ("last line without newline", "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}".to_string()),
        ("duplicate keys", "{\"jsonrpc\":\"2.0\",\"id\":1,\"id\":2,\"method\":\"ping\"}\n".to_string()),
        ("unknown method", request(2, "nope/x", "{}")),
        ("spec methods not offered", format!("{}{}{}{}{}", request(2, "resources/list", "{}"), request(3, "prompts/list", "{}"), request(4, "logging/setLevel", "{\"level\":\"info\"}"), request(5, "server/discover", "{}"), request(6, "tasks/list", "{}"))),
        ("notification of unknown method", format!("{{\"jsonrpc\":\"2.0\",\"method\":\"nope/x\"}}\n{}", ping(9))),
        ("response nobody asked for", format!("{{\"jsonrpc\":\"2.0\",\"id\":77,\"result\":{{}}}}\n{}", ping(9))),
        ("initialize twice", format!("{}{}", initialize("2025-11-25"), initialize("2024-11-05"))),
        ("initialize without params", "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n".to_string()),
        ("initialize with an empty object", request(1, "initialize", "{}")),
        ("initialize with a number version", request(1, "initialize", "{\"protocolVersion\":5,\"capabilities\":{},\"clientInfo\":{\"name\":\"t\",\"version\":\"1\"}}")),
        ("initialize without capabilities", request(1, "initialize", "{\"protocolVersion\":\"2025-11-25\"}")),
        ("initialize with a nameless client", request(1, "initialize", "{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{},\"clientInfo\":{}}")),
        ("initialize with params a string", "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":\"x\"}\n".to_string()),
        ("tools/list cursors", format!("{}{}{}{}", request(2, "tools/list", "{\"cursor\":5}"), request(3, "tools/list", "{\"cursor\":\"x\"}"), request(4, "tools/list", "{\"cursor\":null}"), request(5, "tools/list", "{}"))),
        ("tools/call bad params", format!("{}{}{}{}{}", request(2, "tools/call", "{\"name\":5}"), "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\"}\n", request(4, "tools/call", "{}"), request(5, "tools/call", "{\"name\":\"list_concepts\",\"arguments\":5}"), request(6, "tools/call", "{\"name\":\"list_concepts\",\"arguments\":null}"))),
        ("tools/call arguments an array", request(2, "tools/call", "{\"name\":\"list_concepts\",\"arguments\":[]}")),
        ("tools/call with progress meta", request(2, "tools/call", "{\"name\":\"nope\",\"_meta\":{\"progressToken\":5}}")),
        ("tools/call with a bad meta", format!("{}{}", request(2, "tools/call", "{\"name\":\"nope\",\"_meta\":5}"), ping(9))),
        ("cancel in the same chunk", format!("{}{cancel}{}", ping(2), ping(9))),
        ("cancel in the same chunk of a list", format!("{}{cancel}{}", request(2, "tools/list", "{}"), ping(9))),
        ("cancel of nothing", format!("{{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{{\"requestId\":99}}}}\n{}", ping(9))),
        ("unknown tool", call(2, "nope", "{}")),
        ("unknown tool near a real one", call(2, "list_concept", "{}")),
        ("unknown tool far from every one", call(2, "zzzzzzzzzzzz", "{}")),
        ("unknown argument", call(2, "list_concepts", "{\"limt\":1}")),
        ("unknown argument without a near one", call(2, "list_concepts", "{\"bogus\":1}")),
        ("two unknown arguments", call(2, "list_concepts", "{\"bogus\":1,\"limt\":2}")),
        ("unknown argument on a tool with none", call(2, "list_kinds", "{\"x\":1}")),
        ("unknown argument on a retired tool", call(2, "get_concept", "{\"slugg\":\"a\"}")),
        ("unknown argument with unicode keys", call(2, "list_concepts", "{\"한글\":1,\"é\":2,\"\u{1f600}\":3}")),
        ("blank domain", call(2, "list_concepts", "{\"domain\":\"  \"}")),
        ("padded domain", call(2, "list_concepts", "{\"domain\":\" x\"}")),
        ("padded domain with a no-break space", call(2, "list_concepts", "{\"domain\":\"x\u{a0}\"}")),
        ("domain with a byte-order mark", call(2, "list_concepts", "{\"domain\":\"\u{feff}x\"}")),
        ("title with a vertical tab padding", call(2, "list_concepts", "{\"mentions\":\"\u{b}x\"}")),
        ("domain with a null byte", call(2, "list_concepts", "{\"domain\":\"a\\u0000b\"}")),
        ("domain with a line break inside", call(2, "list_concepts", "{\"domain\":\"a\\nb\"}")),
        ("domain with a line separator inside", call(2, "list_concepts", "{\"domain\":\"a\u{2028}b\"}")),
        ("write under read-only mode", call(2, "add_concepts", "{}")),
        ("retired names answer with their replacement", RETIRED_NAMES.iter().enumerate().map(|(index, name)| call(u32::try_from(index).unwrap() + 2, name, "{\"anything\":1}")).collect::<String>()),
        ("retired writes under read-only mode", RETIRED_NAMES.iter().enumerate().map(|(index, name)| call(u32::try_from(index).unwrap() + 2, name, "{}")).collect::<String>()),
        ("deep arguments", format!("{}{}", request(2, "tools/call", &format!("{{\"name\":\"list_concepts\",\"arguments\":{}{}}}", "[".repeat(3000), "]".repeat(3000))), request(3, "tools/call", &format!("{{\"name\":\"list_concepts\",\"arguments\":{}1{}}}", "{\"a\":".repeat(3000), "}".repeat(3000))))),
        ("a large id and long text", request(2, "tools/call", &format!("{{\"name\":\"{}\"}}", "n".repeat(100_000)))),
    ];
    for (label, input) in &scenarios {
        let environment: &[(&str, &str)] = if label.ends_with("under read-only mode") {
            &[("OATLAS_READ_ONLY", "1")]
        } else {
            &[]
        };
        assert_equal(label, environment, input);
    }
}

#[test]
fn startup_failures_say_the_same_two_lines_and_exit_one() {
    if !oracle_ready() {
        return;
    }
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    for vault in [
        "/definitely/not/here",
        "/definitely/not/here/",
        manifest.to_str().expect("utf8"),
    ] {
        assert_equal(&format!("vault {vault}"), &[("OATLAS_VAULT", vault)], "");
    }
}

#[test]
fn an_unknown_tool_profile_stops_both_servers_with_status_one() {
    if !oracle_ready() {
        return;
    }
    let (javascript, rust) = both(&[("OATLAS_TOOL_PROFILE", "bogus")], "");
    assert_eq!(rust.code, Some(1));
    assert_eq!(rust.code, javascript.code);
    // The JavaScript server also prints the source line and a stack; the message line is the same.
    assert!(
        javascript
            .stderr
            .contains(rust.stderr.trim_end_matches('\n')),
        "{:?} does not contain {:?}",
        javascript.stderr,
        rust.stderr
    );
}

#[test]
fn a_relative_vault_root_is_resolved_the_same_way() {
    if !oracle_ready() {
        return;
    }
    // Both servers run from the repository root, so `samples/storefront` and a path with dots
    // reach the same folder and print the same normalised root.
    for vault in [
        "samples/storefront",
        "samples/./storefront/../storefront/",
        "./samples/storefront",
    ] {
        assert_equal(
            &format!("vault {vault}"),
            &[("OATLAS_VAULT", vault)],
            &ping(1),
        );
    }
}
