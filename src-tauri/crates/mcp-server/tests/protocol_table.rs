//! The protocol behaviour table of the port specification, driven against the built program over
//! standard input and output. Each expectation was recorded from the JavaScript server; the
//! `oracle` tests run both programs and compare them.

mod support;

use std::time::Duration;

use support::{call, initialize, ping, request, run_to_end, Live, Program};

fn rust(environment: &[(&str, &str)], input: &str) -> support::Run {
    run_to_end(Program::Rust, environment, input.as_bytes())
}

const PING_9: &str = "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":9}";

/// A request that is answered, to prove the session went on after what came before it.
fn then_ping() -> String {
    ping(9)
}

#[test]
fn the_server_says_where_it_is_connected_on_standard_error() {
    let run = rust(&[], &ping(1));
    assert_eq!(
        run.stderr,
        format!(
            "[ontology-atlas-mcp] connected. vault={}\n",
            support::storefront().display()
        )
    );
    assert_eq!(run.code, Some(0));
}

#[test]
fn a_request_before_initialize_is_answered_as_after() {
    let run = rust(
        &[],
        &format!("{}{}", request(1, "tools/list", "{}"), ping(2)),
    );
    assert_eq!(run.lines.len(), 2);
    assert!(run
        .lines
        .iter()
        .any(|line| line.starts_with("{\"result\":{\"tools\":[{\"name\":\"connection_info\"")));
    assert!(run
        .lines
        .contains(&"{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":2}".to_string()));
}

#[test]
fn initialize_negotiates_each_supported_version_and_falls_back_to_the_latest() {
    for (asked, negotiated) in [
        ("2025-11-25", "2025-11-25"),
        ("2025-06-18", "2025-06-18"),
        ("2025-03-26", "2025-03-26"),
        ("2024-11-05", "2024-11-05"),
        ("2024-10-07", "2024-10-07"),
        ("2099-01-01", "2025-11-25"),
        ("1999-01-01", "2025-11-25"),
        ("", "2025-11-25"),
    ] {
        let run = rust(&[], &initialize(asked));
        let line = run.lines.first().expect("an answer");
        assert!(
            line.starts_with(&format!(
                "{{\"result\":{{\"protocolVersion\":\"{negotiated}\",\"capabilities\":{{\"tools\":{{}}}},\"serverInfo\":{{\"name\":\"ontology-atlas-mcp\",\"version\":\"0.13.0\"}},\"instructions\":\"ontology-atlas"
            )),
            "asked {asked:?}: {}",
            &line[..line.len().min(200)]
        );
        assert!(line.ends_with(",\"jsonrpc\":\"2.0\",\"id\":1}"));
    }
}

#[test]
fn initialize_is_answered_again_when_it_comes_twice() {
    let run = rust(
        &[],
        &format!("{}{}", initialize("2025-11-25"), initialize("2024-11-05")),
    );
    assert_eq!(run.lines.len(), 2);
}

#[test]
fn a_line_that_is_not_a_request_gets_no_answer_and_the_session_goes_on() {
    let oversized_id = "12345678901234567890";
    for hostile in [
        "{not json".to_string(),
        "[{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}]".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":null,\"method\":\"ping\"}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":1.5,\"method\":\"ping\"}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":true,\"method\":\"ping\"}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":{},\"method\":\"ping\"}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":9007199254740992,\"method\":\"ping\"}".to_string(),
        format!("{{\"jsonrpc\":\"2.0\",\"id\":{oversized_id},\"method\":\"ping\"}}"),
        "{\"id\":1,\"method\":\"ping\"}".to_string(),
        "{\"jsonrpc\":\"1.0\",\"id\":1,\"method\":\"ping\"}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":1}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":5}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"extra\":1}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":null}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":[]}".to_string(),
        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":{\"_meta\":5}}".to_string(),
        "\u{feff}{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}".to_string(),
        "5".to_string(),
        "null".to_string(),
        "\"x\"".to_string(),
        String::new(),
        "   ".to_string(),
    ] {
        let run = rust(&[], &format!("{hostile}\n{}", then_ping()));
        assert_eq!(run.lines, [PING_9], "after {hostile:?}");
    }
}

#[test]
fn a_last_line_without_its_newline_is_never_answered() {
    let run = rust(&[], "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}");
    assert!(run.lines.is_empty());
    assert_eq!(run.code, Some(0));
}

#[test]
fn ids_are_written_back_as_javascript_writes_them() {
    let run = rust(
        &[],
        "{\"jsonrpc\":\"2.0\",\"id\":\"é😀\",\"method\":\"ping\"}\n{\"jsonrpc\":\"2.0\",\"id\":1e2,\"method\":\"ping\"}\n{\"jsonrpc\":\"2.0\",\"id\":-0,\"method\":\"ping\"}\n{\"jsonrpc\":\"2.0\",\"id\":9007199254740991,\"method\":\"ping\"}\n",
    );
    assert_eq!(
        run.lines,
        [
            "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":\"é😀\"}",
            "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":100}",
            "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":0}",
            "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":9007199254740991}",
        ]
    );
}

#[test]
fn a_carriage_return_before_the_newline_is_part_of_the_line_ending_and_never_written_back() {
    let run = rust(
        &[],
        "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"ping\"}\r\n{\"jsonrpc\":\"2.0\",\"id\":10,\"method\":\"tools/list\"}\r\n",
    );
    assert_eq!(run.lines.len(), 2);
    assert_eq!(run.lines.first().map(String::as_str), Some(PING_9));
    assert!(run.lines.iter().all(|line| !line.contains('\r')));
}

#[test]
fn an_unknown_method_is_not_found_whatever_the_spec_says_of_it() {
    for method in [
        "nope/x",
        "resources/list",
        "prompts/list",
        "logging/setLevel",
        "server/discover",
        "tasks/list",
        "completion/complete",
        "subscriptions/listen",
    ] {
        let run = rust(&[], &request(2, method, "{}"));
        assert_eq!(
            run.lines,
            ["{\"jsonrpc\":\"2.0\",\"id\":2,\"error\":{\"code\":-32601,\"message\":\"Method not found\"}}"],
            "{method}"
        );
    }
}

#[test]
fn a_tools_call_with_the_wrong_parameter_types_is_invalid_params_in_the_sdks_words() {
    let run = rust(
        &[],
        &format!(
            "{}{}{}",
            request(2, "tools/call", "{\"name\":5}"),
            "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\"}\n",
            request(
                5,
                "tools/call",
                "{\"name\":\"list_concepts\",\"arguments\":5}"
            )
        ),
    );
    let by_id = support::by_id(&run);
    assert_eq!(
        by_id,
        [
            ("2".to_string(), "{\"jsonrpc\":\"2.0\",\"id\":2,\"error\":{\"code\":-32602,\"message\":\"Invalid tools/call request: [\\n  {\\n    \\\"expected\\\": \\\"string\\\",\\n    \\\"code\\\": \\\"invalid_type\\\",\\n    \\\"path\\\": [\\n      \\\"params\\\",\\n      \\\"name\\\"\\n    ],\\n    \\\"message\\\": \\\"Invalid input: expected string, received number\\\"\\n  }\\n]\"}}".to_string()),
            ("3".to_string(), "{\"jsonrpc\":\"2.0\",\"id\":3,\"error\":{\"code\":-32602,\"message\":\"Invalid tools/call request: [\\n  {\\n    \\\"expected\\\": \\\"object\\\",\\n    \\\"code\\\": \\\"invalid_type\\\",\\n    \\\"path\\\": [\\n      \\\"params\\\"\\n    ],\\n    \\\"message\\\": \\\"Invalid input: expected object, received undefined\\\"\\n  }\\n]\"}}".to_string()),
            ("5".to_string(), "{\"jsonrpc\":\"2.0\",\"id\":5,\"error\":{\"code\":-32602,\"message\":\"Invalid tools/call request: [\\n  {\\n    \\\"expected\\\": \\\"record\\\",\\n    \\\"code\\\": \\\"invalid_type\\\",\\n    \\\"path\\\": [\\n      \\\"params\\\",\\n      \\\"arguments\\\"\\n    ],\\n    \\\"message\\\": \\\"Invalid input: expected record, received number\\\"\\n  }\\n]\"}}".to_string()),
        ]
    );
}

#[test]
fn initialize_and_tools_list_with_the_wrong_parameter_types_are_internal_errors_in_the_sdks_words()
{
    let run = rust(
        &[],
        &format!(
            "{}{}",
            request(1, "initialize", "{\"protocolVersion\":5,\"capabilities\":{},\"clientInfo\":{\"name\":\"t\",\"version\":\"1\"}}"),
            request(2, "tools/list", "{\"cursor\":5}")
        ),
    );
    assert_eq!(
        support::by_id(&run),
        [
            ("1".to_string(), "{\"jsonrpc\":\"2.0\",\"id\":1,\"error\":{\"code\":-32603,\"message\":\"[\\n  {\\n    \\\"expected\\\": \\\"string\\\",\\n    \\\"code\\\": \\\"invalid_type\\\",\\n    \\\"path\\\": [\\n      \\\"params\\\",\\n      \\\"protocolVersion\\\"\\n    ],\\n    \\\"message\\\": \\\"Invalid input: expected string, received number\\\"\\n  }\\n]\"}}".to_string()),
            ("2".to_string(), "{\"jsonrpc\":\"2.0\",\"id\":2,\"error\":{\"code\":-32603,\"message\":\"[\\n  {\\n    \\\"expected\\\": \\\"string\\\",\\n    \\\"code\\\": \\\"invalid_type\\\",\\n    \\\"path\\\": [\\n      \\\"params\\\",\\n      \\\"cursor\\\"\\n    ],\\n    \\\"message\\\": \\\"Invalid input: expected string, received number\\\"\\n  }\\n]\"}}".to_string()),
        ]
    );
}

#[test]
fn a_cancellation_in_the_same_chunk_as_its_request_leaves_the_request_unanswered() {
    let cancel = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":2}}\n";
    let run = rust(&[], &format!("{}{cancel}{}", ping(2), then_ping()));
    assert_eq!(run.lines, [PING_9]);
}

#[test]
fn a_cancelled_request_still_runs_its_handler_and_only_its_answer_is_dropped() {
    let marker = std::env::temp_dir().join(format!("mcp-cancel-marker-{}", std::process::id()));
    let _ = std::fs::remove_file(&marker);
    let cancel = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":2}}\n";
    let path = answer_format::json::quote(&marker.to_string_lossy());
    let run = rust(
        &[],
        &format!(
            "{}{cancel}{}",
            call(2, "__test_write_marker", &format!("{{\"path\":{path}}}")),
            then_ping()
        ),
    );
    assert_eq!(run.lines, [PING_9]);
    assert!(
        marker.exists(),
        "the handler ran although its request was cancelled"
    );
    let _ = std::fs::remove_file(&marker);
}

#[test]
fn a_cancellation_naming_no_request_in_flight_changes_nothing() {
    let cancel = "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":99}}\n";
    let run = rust(&[], &format!("{cancel}{}", then_ping()));
    assert_eq!(run.lines, [PING_9]);
}

#[test]
fn a_tool_that_fails_unexpectedly_is_one_tool_error_and_the_session_continues() {
    let run = rust(
        &[],
        &format!("{}{}", call(2, "__test_panic", "{}"), then_ping()),
    );
    let by_id = support::by_id(&run);
    assert_eq!(by_id.len(), 2);
    let failure = by_id
        .iter()
        .find(|(id, _)| id == "2")
        .expect("the failed call is answered")
        .1
        .clone();
    assert_eq!(
        failure,
        concat!(
            r#"{"result":{"content":[{"type":"text","text":"Error: Tool \"__test_panic\" stopped unexpectedly: planted handler failure"}],"#,
            r#""structuredContent":{"ok":false,"errorCode":"tool_error","#,
            r#""error":"Tool \"__test_panic\" stopped unexpectedly: planted handler failure"},"isError":true},"jsonrpc":"2.0","id":2}"#
        )
    );
    assert!(by_id.iter().any(|(id, line)| id == "9" && line == PING_9));
    assert!(
        run.stderr.contains("a handler stopped unexpectedly"),
        "{}",
        run.stderr
    );
}

#[test]
fn a_read_is_answered_while_another_call_waits_and_a_cancelled_wait_is_never_answered() {
    let mut live = Live::start(&[]);
    live.send(&call(2, "__test_hold", "{}"));
    live.send(&ping(3));
    let first = live
        .next_line(Duration::from_secs(10))
        .expect("the read is answered while the other call waits");
    assert_eq!(first, "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":3}");
    assert_eq!(
        live.next_line(Duration::from_millis(300)),
        None,
        "the waiting call has not answered"
    );
    live.send("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":2}}\n");
    assert_eq!(
        live.next_line(Duration::from_millis(500)),
        None,
        "a cancelled call is never answered"
    );
    live.send(&ping(4));
    assert_eq!(
        live.next_line(Duration::from_secs(10))
            .expect("the session goes on"),
        "{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":4}"
    );
    assert_eq!(live.finish(), Some(0));
}

#[test]
fn standard_input_closing_ends_a_waiting_call_and_the_server() {
    let mut live = Live::start(&[]);
    live.send(&call(2, "__test_hold", "{}"));
    assert_eq!(live.next_line(Duration::from_millis(300)), None);
    let started = std::time::Instant::now();
    assert_eq!(live.finish(), Some(0));
    assert!(
        started.elapsed() < Duration::from_secs(10),
        "the wait ended with the session"
    );
}

#[test]
fn standard_output_closed_by_the_client_ends_the_server_quietly() {
    let mut command = std::process::Command::new(env!("CARGO_BIN_EXE_ontology-atlas-mcp-rust"));
    command
        .env("OATLAS_VAULT", support::storefront())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = command.spawn().expect("spawn");
    let mut stdin = child.stdin.take().expect("stdin");
    drop(child.stdout.take());
    let writer = std::thread::spawn(move || {
        use std::io::Write;
        for index in 0..200 {
            if stdin.write_all(ping(index + 1).as_bytes()).is_err() {
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    });
    let output = child.wait_with_output().expect("the server exits");
    let _ = writer.join();
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(0), "{stderr}");
    assert!(!stderr.contains("panicked"), "{stderr}");
    assert_eq!(
        stderr.trim_end(),
        format!(
            "[ontology-atlas-mcp] connected. vault={}",
            support::storefront().display()
        )
    );
}

#[test]
fn a_line_longer_than_the_buffer_ends_the_session_without_a_panic() {
    let long = format!(
        "{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\",\"params\":{{\"pad\":\"{}\"}}}}\n",
        "x".repeat(11 * 1024 * 1024)
    );
    let run = rust(&[], &format!("{}{long}{}", ping(5), ping(6)));
    assert!(run
        .lines
        .contains(&"{\"result\":{},\"jsonrpc\":\"2.0\",\"id\":5}".to_string()));
    assert!(
        !run.lines.iter().any(|line| line.ends_with("\"id\":6}")),
        "nothing is read after the cut"
    );
    assert!(!run.stderr.contains("panicked"));
    assert_eq!(run.code, Some(0));
}

/// The JavaScript server answers at any depth (it was probed to a million levels); so does this one,
/// because what an agent nests inside `arguments` stays unread text.
#[test]
fn a_request_nested_a_hundred_and_fifty_thousand_deep_is_answered_and_the_session_goes_on() {
    let depth = 150_000;
    let nested = format!("{}{}", "[".repeat(depth), "]".repeat(depth));
    let run = rust(
        &[],
        &format!(
            "{}{}",
            request(
                2,
                "tools/call",
                &format!("{{\"name\":\"git_status\",\"arguments\":{{\"a\":{nested}}}}}")
            ),
            then_ping()
        ),
    );
    let by_id = support::by_id(&run);
    assert_eq!(by_id.len(), 2);
    assert!(
        by_id
            .iter()
            .any(|(id, line)| id == "2"
                && line.contains("Unknown argument \\\"a\\\" for git_status."))
    );
    assert!(by_id.iter().any(|(id, line)| id == "9" && line == PING_9));
    assert_eq!(run.code, Some(0));
    assert!(!run.stderr.contains("overflow"), "{}", run.stderr);
}

#[test]
fn an_unknown_tool_is_named_with_its_nearest_and_the_allowed_list() {
    let run = rust(&[], &call(2, "list_concept", "{}"));
    let line = run.lines.first().expect("answered");
    assert!(line.starts_with(
        r#"{"result":{"content":[{"type":"text","text":"Error: Unknown tool: list_concept. Did you mean \"list_concepts\"? Allowed tools: absorb_document, add_concepts,"#
    ), "{line}");
    assert!(line.contains(r#""structuredContent":{"ok":false,"errorCode":"unknown_tool","error":"Unknown tool: list_concept."#));
    assert!(line.ends_with(r#"]},"isError":true},"jsonrpc":"2.0","id":2}"#));
    assert!(line.contains(r#""receivedTool":"list_concept","suggestion":"list_concepts","allowedTools":["absorb_document","add_concepts""#));
}

#[test]
fn an_unknown_argument_is_refused_by_name_before_the_handler_runs() {
    let run = rust(&[], &call(2, "list_concepts", "{\"limt\":1}"));
    assert_eq!(
        run.lines,
        [concat!(
            r#"{"result":{"content":[{"type":"text","text":"Error: Unknown argument \"limt\" for list_concepts. Did you mean \"limit\"? Allowed arguments: domain, kind, limit, offset, since, summary. Received arguments: limt."}],"#,
            r#""structuredContent":{"ok":false,"errorCode":"unknown_argument","#,
            r#""error":"Unknown argument \"limt\" for list_concepts. Did you mean \"limit\"? Allowed arguments: domain, kind, limit, offset, since, summary. Received arguments: limt.","#,
            r#""toolName":"list_concepts","receivedArgument":"limt","suggestion":"limit","#,
            r#""unknownArguments":[{"name":"limt","suggestion":"limit"}],"#,
            r#""allowedArguments":["domain","kind","limit","offset","since","summary"],"receivedArguments":["limt"]},"isError":true},"jsonrpc":"2.0","id":2}"#
        )]
    );
}

#[test]
fn a_known_tool_this_build_has_not_ported_answers_not_ported_only_in_a_test_build() {
    let run = rust(&[], &call(2, "git_status", "{}"));
    assert_eq!(
        run.lines,
        [concat!(
            r#"{"result":{"content":[{"type":"text","text":"Error: Tool \"git_status\" is not ported to the Rust server yet."}],"#,
            r#""structuredContent":{"ok":false,"errorCode":"not_ported","#,
            r#""error":"Tool \"git_status\" is not ported to the Rust server yet."},"isError":true},"jsonrpc":"2.0","id":2}"#
        )]
    );
}

#[test]
fn a_write_under_read_only_mode_is_refused_before_its_arguments_are_read() {
    let run = rust(
        &[("OATLAS_READ_ONLY", "1")],
        &call(2, "add_concepts", "{\"bogus\":1}"),
    );
    assert_eq!(
        run.lines,
        [concat!(
            r#"{"result":{"content":[{"type":"text","text":"Error: Tool \"add_concepts\" is unavailable: server is in read-only mode (OATLAS_READ_ONLY). Only read tools are exposed."}],"#,
            r#""structuredContent":{"ok":false,"errorCode":"tool_error","#,
            r#""error":"Tool \"add_concepts\" is unavailable: server is in read-only mode (OATLAS_READ_ONLY). Only read tools are exposed."},"isError":true},"jsonrpc":"2.0","id":2}"#
        )]
    );
}

#[test]
fn a_retired_tool_is_still_known_and_a_blank_argument_is_refused_before_the_handler() {
    let run = rust(&[], &call(2, "list_concepts", "{\"domain\":\" x\"}"));
    assert!(
        run.lines.first().expect("answered").contains(
            "domain must not have leading or trailing whitespace. Example domain: \\\"x\\\"."
        ),
        "{:?}",
        run.lines
    );
}

/// The expected text names a Unix path; on Windows the oracle test compares the same words with
/// the JavaScript server's.
#[cfg(unix)]
#[test]
fn a_missing_vault_root_prints_two_lines_and_exits_one() {
    let run = rust(&[("OATLAS_VAULT", "/definitely/not/here/")], "");
    assert_eq!(
        run.stderr,
        concat!(
            "[ontology-atlas-mcp] vault root validation failed: Vault root not found: /definitely/not/here\n",
            "[ontology-atlas-mcp] Point the OATLAS_VAULT environment variable at a markdown vault directory. (currently: /definitely/not/here)\n"
        )
    );
    assert!(run.lines.is_empty());
    assert_eq!(run.code, Some(1));
}

#[test]
fn a_vault_root_that_is_a_file_prints_its_own_reason() {
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    let run = rust(&[("OATLAS_VAULT", manifest.to_str().expect("utf8"))], "");
    assert!(run.stderr.starts_with(&format!("[ontology-atlas-mcp] vault root validation failed: Vault root is not a directory: {}\n", manifest.display())), "{}", run.stderr);
    assert_eq!(run.code, Some(1));
}

#[test]
fn an_unknown_tool_profile_stops_the_start_even_when_the_vault_is_missing_too() {
    let run = rust(
        &[
            ("OATLAS_TOOL_PROFILE", "bogus"),
            ("OATLAS_VAULT", "/definitely/not/here"),
        ],
        "",
    );
    assert_eq!(
        run.stderr,
        "Error: Invalid OATLAS_TOOL_PROFILE \"bogus\"; use full or construction, or unset it, then restart the server.\n"
    );
    assert_eq!(run.code, Some(1));
}

/// Declared change 3: half of a surrogate pair is not text. A tool name with one is read with
/// U+FFFD in its place, an argument that holds one is refused by name before any handler sees it,
/// and a request id is the exception: it is written back exactly as sent.
#[test]
fn half_a_surrogate_pair_is_replaced_in_a_name_refused_in_an_argument_and_kept_in_an_id() {
    let escape = "\\ud800";
    let id = format!("\"i{escape}\"");
    let run = rust(
        &[],
        &format!(
            "{{\"jsonrpc\":\"2.0\",\"id\":{id},\"method\":\"tools/call\",\"params\":{{\"name\":\"a{escape}b\",\"arguments\":{{}}}}}}\n{}",
            call(3, "list_concepts", &format!("{{\"domain\":\"x{escape}\"}}"))
        ),
    );
    let by_id = support::by_id(&run);
    let first = by_id
        .first()
        .map(|(_, line)| line.as_str())
        .unwrap_or_default();
    assert!(first.contains("Unknown tool: a\u{fffd}b."), "{first}");
    assert!(
        first.ends_with(&format!(",\"jsonrpc\":\"2.0\",\"id\":{id}}}")),
        "{first}"
    );
    let refused = by_id
        .get(1)
        .map(|(_, line)| line.as_str())
        .unwrap_or_default();
    assert!(
        refused.contains("\"errorCode\":\"invalid_arguments\"")
            && refused.contains("Argument \\\"domain\\\" holds half of a surrogate pair"),
        "{refused}"
    );
}

/// A tool name of nine million characters is answered at once: nothing measures it against every
/// allowed name.
#[test]
fn a_tool_name_of_millions_of_characters_is_answered_at_once() {
    let name = "n".repeat(9_000_000);
    let line = format!(
        "{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{{\"name\":\"{name}\"}}}}\n{}",
        ping(9)
    );
    let started = std::time::Instant::now();
    let run = rust(&[], &line);
    assert_eq!(run.lines.len(), 2);
    assert!(
        started.elapsed() < std::time::Duration::from_secs(5),
        "{:?}",
        started.elapsed()
    );
}

/// Declared change 4: the fields of an unknown-argument answer are the names as sent. The JavaScript
/// server reads them back out of its own message, so a comma splits a name, edge spaces are trimmed
/// and a quote drops the fields altogether.
#[test]
fn unknown_argument_names_are_reported_as_sent_whatever_punctuation_they_hold() {
    let run = rust(
        &[],
        &format!(
            "{}{}",
            call(2, "list_concepts", "{\"a,b\":1,\" c \":2}"),
            call(3, "list_concepts", "{\"a\\\"b\":1}")
        ),
    );
    let by_id = support::by_id(&run);
    let answer = |id: &str| {
        by_id
            .iter()
            .find(|(key, _)| key == id)
            .map(|(_, line)| line.clone())
            .expect("answered")
    };
    assert!(
        answer("2").contains("\"receivedArguments\":[\" c \",\"a,b\"]"),
        "{}",
        answer("2")
    );
    assert!(
        answer("3").contains("\"receivedArgument\":\"a\\\"b\""),
        "{}",
        answer("3")
    );
}
