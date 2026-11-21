//! Audit before send. On other platforms the log refuses, so nothing is sent.

use super::*;

#[cfg(not(any(unix, windows)))]
#[test]
fn without_a_supported_audit_log_nothing_is_sent() {
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let vault = temp_vault("unsupported");
    assert!(matches!(
        runner.start_build(&vault, plan(1, 5)),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert!(matches!(
        runner.embed_query(&vault, "question"),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert_eq!(fake.calls(), 0);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_run_writes_its_start_line_before_the_first_request_and_closes_after() {
    let vault = temp_vault("run");
    let lines_at_send = Arc::new(Mutex::new(Vec::new()));
    let (vault_in, seen) = (vault.clone(), lines_at_send.clone());
    let fake = Fake::new(move |request| {
        seen.lock().unwrap().push(audit_lines(&vault_in));
        Ok((200, embeddings_json(request_input_count(request), 4)))
    });
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let mut run = runner
        .start_build(
            &vault,
            BuildPlan {
                files: 2,
                passages: 3,
                chars: 15,
            },
        )
        .unwrap();
    assert_eq!(run.embed_batch(&["alpha", "bravo"]).unwrap().len(), 2);
    assert_eq!(run.embed_batch(&["gamma"]).unwrap(), vec![vec![0.25; 4]]);
    assert_eq!(run.passages_sent(), 3);
    run.finish(RunEnd::Complete).unwrap();

    let at_send = lines_at_send.lock().unwrap();
    assert_eq!(at_send.len(), 2);
    for lines in at_send.iter() {
        assert_eq!(lines.len(), 1, "only the start line exists while sending");
        assert_eq!(lines[0]["purpose"], "embed-build");
        assert_eq!(lines[0]["embed"]["phase"], "start");
    }
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    let (start, close) = (&lines[0], &lines[1]);
    assert_eq!(start["host"], "127.0.0.1:11434");
    assert_eq!(start["model"], "bge-m3");
    assert_eq!(start["embed"]["filesPlanned"], 2);
    assert_eq!(start["embed"]["passagesPlanned"], 3);
    assert_eq!(start["embed"]["charsPlanned"], 15);
    assert!(start.get("outcome").is_none());
    assert_eq!(close["embed"]["phase"], "close");
    assert_eq!(close["embed"]["run"], start["embed"]["run"]);
    assert_eq!(close["embed"]["passagesSent"], 3);
    assert_eq!(close["embed"]["charsSent"], 15);
    assert_eq!(close["embed"]["ended"], "complete");
    assert_eq!(close["outcome"], "ok");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn the_runner_serves_through_the_embedder_trait() {
    let vault = temp_vault("trait");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let embedder: &dyn Embedder = &runner;
    assert_eq!(embedder.model(), "bge-m3");
    let mut session = embedder.start_build(&vault, plan(1, 3)).unwrap();
    assert_eq!(session.embed_batch(&["one"]).unwrap().len(), 1);
    session.finish(RunEnd::Complete).unwrap();
    assert_eq!(embedder.embed_query(&vault, "q").unwrap().len(), 4);
    let purposes: Vec<_> = audit_lines(&vault)
        .iter()
        .map(|line| line["purpose"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(purposes, ["embed-build", "embed-build", "embed-query"]);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_dropped_run_closes_as_stopped() {
    let vault = temp_vault("drop");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    {
        let mut run = runner.start_build(&vault, plan(4, 100)).unwrap();
        run.embed_batch(&["one"]).unwrap();
    }
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[1]["embed"]["ended"], "stopped");
    assert_eq!(lines[1]["embed"]["passagesSent"], 1);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_bad_answer_inside_a_run_returns_no_vectors() {
    let vault = temp_vault("bad");
    for (answer, expected) in [
        (
            r#"{"data":[{"embedding":[1,2]},{"embedding":[1,2,3]}]}"#.to_string(),
            EmbedError::ResponseInvalid("dimension"),
        ),
        (
            r#"{"data":[{"embedding":[1e39,2]},{"embedding":[1,2]}]}"#.to_string(),
            EmbedError::ResponseInvalid("not-finite"),
        ),
        (embeddings_json(1, 4), EmbedError::ResponseInvalid("count")),
    ] {
        let fake = Fake::new(move |_| Ok((200, answer.clone())));
        let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
        let mut run = runner.start_build(&vault, plan(2, 10)).unwrap();
        assert_eq!(run.embed_batch(&["one", "two"]), Err(expected));
        run.finish(RunEnd::Failed).unwrap();
    }
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 6);
    assert_eq!(lines[5]["embed"]["ended"], "failed");
    assert_eq!(lines[5]["outcome"], "error");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_run_refuses_to_send_more_than_it_announced_or_an_oversized_batch() {
    let vault = temp_vault("plan");
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let mut run = runner.start_build(&vault, plan(1, 3)).unwrap();
    assert_eq!(run.embed_batch(&["four"]), Err(EmbedError::OverPlan));
    assert_eq!(run.embed_batch(&["a", "b"]), Err(EmbedError::OverPlan));
    let many = vec!["x"; MAX_BATCH_PASSAGES + 1];
    assert_eq!(run.embed_batch(&many), Err(EmbedError::BatchTooLarge));
    let long = "x".repeat(MAX_PASSAGE_CHARS + 1);
    assert_eq!(
        run.embed_batch(&["ok", &long]),
        Err(EmbedError::PassageTooLong(1))
    );
    assert_eq!(run.embed_batch(&[]), Err(EmbedError::BatchEmpty));
    drop(run);
    assert_eq!(fake.calls(), 0);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn each_query_writes_one_line_holding_the_question_before_it_sends() {
    let vault = temp_vault("query");
    let (vault_in, counts) = (vault.clone(), Arc::new(Mutex::new(Vec::new())));
    let counts_in = counts.clone();
    let fake = Fake::new(move |request| {
        assert_eq!(request.timeout, FAST.query);
        counts_in.lock().unwrap().push(audit_lines(&vault_in).len());
        Ok((200, embeddings_json(1, 4)))
    });
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    for question in [
        "결제 실패는 어디서 다시 시도하나요?",
        "where is retry decided",
    ] {
        assert_eq!(runner.embed_query(&vault, question).unwrap().len(), 4);
    }
    assert_eq!(*counts.lock().unwrap(), vec![1, 2]);
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["purpose"], "embed-query");
    assert_eq!(lines[0]["question"], "결제 실패는 어디서 다시 시도하나요?");
    assert_eq!(lines[0]["outcome"], "ok");
    assert_eq!(lines[1]["question"], "where is retry decided");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_failed_query_is_still_one_closed_line() {
    let vault = temp_vault("query-down");
    let fake = Fake::new(|_| Err(EmbedError::TimedOut));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    assert_eq!(
        runner.embed_query(&vault, "anything"),
        Err(EmbedError::TimedOut)
    );
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0]["outcome"], "error");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(unix)]
#[test]
fn a_symlinked_audit_log_means_nothing_is_sent() {
    let vault = temp_vault("symlink");
    let elsewhere = temp_vault("symlink-target").join("captured.jsonl");
    std::fs::write(&elsewhere, "").unwrap();
    std::fs::create_dir_all(vault.join(".ontology-atlas")).unwrap();
    std::os::unix::fs::symlink(&elsewhere, crate::llm_audit::audit_log_path(&vault)).unwrap();
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    assert!(matches!(
        runner.start_build(&vault, plan(1, 5)),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert!(matches!(
        runner.embed_query(&vault, "question"),
        Err(EmbedError::AuditBlocked(_))
    ));
    assert_eq!(fake.calls(), 0);
    assert_eq!(std::fs::read_to_string(&elsewhere).unwrap(), "");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(unix)]
#[test]
fn an_unwritable_audit_folder_means_nothing_is_sent() {
    use std::os::unix::fs::PermissionsExt;
    let vault = temp_vault("readonly");
    let sidecar = vault.join(".ontology-atlas");
    std::fs::create_dir_all(&sidecar).unwrap();
    std::fs::set_permissions(&sidecar, std::fs::Permissions::from_mode(0o500)).unwrap();
    let fake = Fake::new(|request| Ok((200, embeddings_json(request_input_count(request), 4))));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let build = runner.start_build(&vault, plan(1, 5));
    let query = runner.embed_query(&vault, "question");
    std::fs::set_permissions(&sidecar, std::fs::Permissions::from_mode(0o700)).unwrap();
    assert!(matches!(build, Err(EmbedError::AuditBlocked(_))));
    assert!(matches!(query, Err(EmbedError::AuditBlocked(_))));
    assert_eq!(fake.calls(), 0);
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_batch_reaches_a_real_runner_over_curl() {
    let stub = Stub::start(|| http("200 OK", "", embeddings_json(2, 3).as_bytes()));
    let vault = temp_vault("curl");
    let runner = curl_runner(&stub.base()).with_dimensions(3);
    let mut run = runner.start_build(&vault, plan(2, 6)).unwrap();
    assert_eq!(run.embed_batch(&["one", "two"]).unwrap().len(), 2);
    run.finish(RunEnd::Complete).unwrap();
    let heads = stub.heads.lock().unwrap();
    assert!(heads[0].starts_with("POST /api/show "));
    assert!(heads[1].starts_with("POST /v1/embeddings "));
    std::fs::remove_dir_all(&vault).ok();
}

#[test]
fn every_error_code_is_kebab_case() {
    for error in [
        EmbedError::Endpoint("x".into()),
        EmbedError::NotLocal,
        EmbedError::ResolvesElsewhere,
        EmbedError::AuditBlocked("x".into()),
        EmbedError::ModelInvalid,
        EmbedError::ModelNotAllowed("x".into()),
        EmbedError::BatchEmpty,
        EmbedError::BatchTooLarge,
        EmbedError::PassageTooLong(0),
        EmbedError::OverPlan,
        EmbedError::Request("x".into()),
        EmbedError::TimedOut,
        EmbedError::Redirected(302),
        EmbedError::ModelMissing,
        EmbedError::Http(500),
        EmbedError::ResponseTooLarge,
        EmbedError::ResponseInvalid("x"),
        EmbedError::Cancelled,
        EmbedError::PullFailed("x".into()),
    ] {
        let code = error.code();
        assert!(code.chars().all(|ch| ch.is_ascii_lowercase() || ch == '-'));
        assert!(error.to_string().starts_with(code));
    }
}
