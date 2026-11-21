use super::*;

#[test]
fn batches_stay_within_thirty_two_passages_and_sixty_four_kib() {
    let short = "a".repeat(100);
    let long = "가".repeat(1_900); // 5,700 bytes
    let shorts: Vec<&str> = vec![short.as_str(); 70];
    assert_eq!(plan_batches(&shorts), vec![0..32, 32..64, 64..70]);
    let longs: Vec<&str> = vec![long.as_str(); 30];
    let batches = plan_batches(&longs);
    assert!(batches
        .iter()
        .all(|b| b.len() * long.len() <= MAX_BATCH_BYTES));
    assert_eq!(batches.iter().map(|b| b.len()).sum::<usize>(), 30);
    assert!(plan_batches(&[]).is_empty());
}

#[test]
fn pull_progress_is_summed_over_layers_and_never_goes_back() {
    let mut tracker = PullTracker::default();
    let lines = [
        r#"{"status":"pulling manifest"}"#,
        r#"{"status":"pulling a","digest":"sha256:a","total":1000,"completed":500}"#,
        r#"{"status":"pulling b","digest":"sha256:b","total":1000,"completed":0}"#,
        r#"{"status":"pulling a","digest":"sha256:a","total":1000,"completed":1000}"#,
        r#"{"status":"pulling b","digest":"sha256:b","total":1000,"completed":1000}"#,
        r#"{"status":"verifying sha256 digest"}"#,
        r#"{"status":"success"}"#,
    ];
    let percents: Vec<u8> = lines
        .iter()
        .filter_map(|line| tracker.read(line))
        .map(|p| p.percent)
        .collect();
    assert_eq!(percents, vec![0, 50, 50, 50, 100, 100, 100]);
    assert!(tracker.succeeded);
    let mut failing = PullTracker::default();
    assert!(failing
        .read(r#"{"error":"pull model manifest: file does not exist"}"#)
        .is_none());
    assert_eq!(
        failing.error.as_deref(),
        Some("pull model manifest: file does not exist")
    );
    assert!(failing.read("not json").is_none());
}

#[test]
fn only_allow_listed_models_may_be_pulled() {
    let fake = Fake::new(|_| Ok((200, String::new())));
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    let vault = temp_vault("pull-allow");
    let cancel = AtomicBool::new(false);
    for model in [
        "embeddinggemma",
        "bge-m3:latest",
        "qwen3-embedding:8b",
        "llama3",
        "",
    ] {
        assert!(matches!(
            runner.pull(&vault, model, &cancel, &mut |_| {}),
            Err(EmbedError::ModelNotAllowed(_))
        ));
    }
    assert_eq!(fake.calls(), 0);
    assert!(!crate::llm_audit::audit_log_path(&vault).exists());
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_pull_streams_progress_between_its_two_download_lines() {
    let vault = temp_vault("pull-ok");
    let vault_in = vault.clone();
    let lines_at_request = Arc::new(Mutex::new(None));
    let seen_lines = lines_at_request.clone();
    let stub = Stub::start(move || {
        *seen_lines.lock().unwrap() = Some(audit_lines(&vault_in));
        progress_lines(&[
            r#"{"status":"pulling manifest"}"#,
            r#"{"status":"pulling x","digest":"sha256:x","total":200,"completed":100}"#,
            r#"{"status":"pulling x","digest":"sha256:x","total":200,"completed":200}"#,
            r#"{"status":"success"}"#,
        ])
    });
    let mut seen = Vec::new();
    curl_runner(&stub.base())
        .pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |p| {
            seen.push(p.percent)
        })
        .unwrap();
    assert_eq!(seen, vec![0, 50, 100, 100]);
    assert!(stub.heads.lock().unwrap()[0].starts_with("POST /api/pull "));

    let before = lines_at_request.lock().unwrap().clone().unwrap();
    assert_eq!(
        before.len(),
        1,
        "the start line is on disk before the request"
    );
    assert_eq!(before[0]["purpose"], "model-download");
    assert_eq!(before[0]["download"]["phase"], "start");
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    let close = &lines[1];
    assert_eq!(close["download"]["run"], lines[0]["download"]["run"]);
    assert_eq!(close["download"]["source"], "ollama-pull");
    assert_eq!(close["download"]["revision"], "sha256:x");
    assert_eq!(close["download"]["bytes"], 200);
    assert_eq!(close["download"]["ended"], "complete");
    assert_eq!(close["model"], "bge-m3");
    assert_eq!(close["scope"]["vaultChars"], 0);
    assert_eq!(close["outcome"], "ok");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_pull_error_line_is_reported_and_closed_as_failed() {
    let vault = temp_vault("pull-error");
    let stub = Stub::start(|| {
        progress_lines(&[
            r#"{"status":"pulling manifest"}"#,
            r#"{"error":"no space left on device"}"#,
        ])
    });
    let outcome =
        curl_runner(&stub.base()).pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |_| {});
    assert_eq!(
        outcome,
        Err(EmbedError::PullFailed("no space left on device".into()))
    );
    let lines = audit_lines(&vault);
    assert_eq!(lines[1]["download"]["ended"], "failed");
    assert_eq!(lines[1]["outcome"], "error");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_pull_stops_when_cancelled() {
    let vault = temp_vault("pull-cancel");
    let stub = Stub::start(|| {
        Reply::Trickle(vec![
            r#"{"status":"pulling x","digest":"sha256:x","total":100,"completed":1}"#.into(),
            r#"{"status":"pulling x","digest":"sha256:x","total":100,"completed":2}"#.into(),
        ])
    });
    let cancel = AtomicBool::new(false);
    let started = Instant::now();
    let outcome = curl_runner(&stub.base()).pull(&vault, "bge-m3", &cancel, &mut |_| {
        cancel.store(true, Ordering::Relaxed)
    });
    assert_eq!(outcome, Err(EmbedError::Cancelled));
    assert!(started.elapsed() < Duration::from_secs(3));
    assert_eq!(audit_lines(&vault)[1]["download"]["ended"], "stopped");
    std::fs::remove_dir_all(&vault).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn a_pull_stream_is_cut_at_its_byte_and_silence_limits() {
    let vault = temp_vault("pull-limits");
    let line = r#"{"status":"pulling x","digest":"sha256:x","total":100,"completed":1}"#;
    let flood = Stub::start(move || progress_lines(&vec![line; 2_000]));
    assert_eq!(
        curl_runner(&flood.base()).pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |_| {}),
        Err(EmbedError::ResponseTooLarge)
    );
    let silent = Stub::start(|| Reply::Trickle(vec![line.into()]));
    let started = Instant::now();
    assert_eq!(
        curl_runner(&silent.base()).pull(&vault, "bge-m3", &AtomicBool::new(false), &mut |_| {}),
        Err(EmbedError::TimedOut)
    );
    assert!(started.elapsed() < Duration::from_secs(4));
    std::fs::remove_dir_all(&vault).ok();
}

#[test]
fn pull_progress_stays_linear_and_bounded_over_eighty_thousand_digests() {
    let lines: Vec<String> = (0..80_000)
        .map(|i| {
            format!(r#"{{"status":"pulling","digest":"sha256:{i}","total":10,"completed":5}}"#)
        })
        .collect();
    let mut tracker = PullTracker::default();
    let started = Instant::now();
    for line in &lines {
        tracker.read(line);
    }
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_millis(100), "{elapsed:?}");
    assert_eq!(tracker.error.as_deref(), Some("too-many-layers"));

    // Updates to the same layers replace their share of the running sums.
    let mut repeated = PullTracker::default();
    let mut last = None;
    for i in 0..80_000u64 {
        last = repeated.read(&format!(
            r#"{{"status":"pulling","digest":"sha256:{}","total":80000,"completed":{i}}}"#,
            i % 3
        ));
    }
    let last = last.unwrap();
    assert_eq!(
        (last.completed, last.total),
        (79_997 + 79_998 + 79_999, 240_000)
    );
    assert!(repeated.error.is_none());
}

#[test]
fn embedding_models_are_found_by_capability_then_by_name() {
    let fake = Fake::new(|_| {
        Ok((
            200,
            r#"{"models":[
                {"name":"qwen3.8:27b","capabilities":["completion","tools"]},
                {"name":"qwen3-embedding:0.6b","capabilities":["embedding"]},
                {"name":"bge-m3:latest","capabilities":["embedding"]},
                {"name":"nomic-embed-text:latest"},
                {"name":"llama3:8b"}
            ]}"#
            .into(),
        ))
    });
    let runner = fake_runner("http://127.0.0.1:11434", &fake).unwrap();
    assert_eq!(
        runner.embedding_models().unwrap(),
        vec![
            "bge-m3:latest",
            "nomic-embed-text:latest",
            "qwen3-embedding:0.6b"
        ]
    );
    assert!(is_embedding_only_name("BGE-M3:latest"));
    assert!(!is_embedding_only_name("bgem3"));
}
