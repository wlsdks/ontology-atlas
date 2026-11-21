//! A closing line waits out a query that holds the log.

use super::*;

#[cfg(any(unix, windows))]
fn hold_the_log(vault: &Path, for_how_long: Duration) -> JoinHandle<()> {
    let held = crate::llm_audit::reserve(
        vault,
        crate::llm_audit::AuditDraft {
            v: 1,
            at: crate::llm_audit::now_iso(),
            provider: "local".into(),
            host: "127.0.0.1:11434".into(),
            model: Some("bge-m3".into()),
            purpose: "embed-query".into(),
            question: Some("held".into()),
            scope: crate::llm_audit::AuditScope {
                nodes: vec![],
                prompt_chars: 4,
                vault_chars: 0,
            },
            tools: None,
            payload_sha256: crate::llm_audit::sha256_hex(""),
            embed: None,
            download: None,
        },
    )
    .unwrap();
    std::thread::spawn(move || {
        std::thread::sleep(for_how_long);
        crate::llm_audit::finalize(
            held,
            &crate::llm_audit::AuditOutcome {
                outcome: "ok".into(),
                http_status: Some(200),
                response_chars: 1,
                duration_ms: 1,
            },
        )
        .unwrap();
    })
}

#[cfg(any(unix, windows))]
#[test]
fn a_closing_line_waits_for_a_query_that_holds_the_log() {
    let vault = temp_vault("close-wait");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let mut run = runner.start_build(&vault, plan(1, 3)).unwrap();
    run.embed_batch(&["one"]).unwrap();
    let holder = hold_the_log(&vault, Duration::from_millis(400));
    run.finish(RunEnd::Complete).unwrap();
    holder.join().unwrap();
    let phases: Vec<_> = audit_lines(&vault)
        .iter()
        .map(|line| {
            line["embed"]["phase"]
                .as_str()
                .unwrap_or("query")
                .to_string()
        })
        .collect();
    assert_eq!(phases, ["start", "query", "close"]);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_closing_line_that_cannot_be_written_is_reported_not_dropped() {
    let vault = temp_vault("close-lost");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = LocalRunner::connect_with(
        "http://127.0.0.1:11434",
        "bge-m3",
        &loopback_resolver,
        fake.clone(),
        Timeouts {
            line_wait: Duration::from_millis(100),
            ..FAST
        },
    )
    .unwrap();
    let mut run = runner.start_build(&vault, plan(1, 3)).unwrap();
    run.embed_batch(&["one"]).unwrap();
    let holder = hold_the_log(&vault, Duration::from_millis(800));
    let closed = run.finish(RunEnd::Complete);
    holder.join().unwrap();
    assert!(
        matches!(&closed, Err(EmbedError::AuditBlocked(detail)) if detail == "audit-blocked:audit-log-busy"),
        "{closed:?}"
    );
    std::fs::remove_dir_all(&vault).ok();
}
