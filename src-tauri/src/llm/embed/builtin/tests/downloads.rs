use super::super::download::{checked_url, part_path, OPEN_RUN};
use super::super::fetch::{ContentRange, Head};
use super::super::pins;
use super::fake::*;
use super::*;

#[test]
fn downloads_through_an_allowed_redirect_after_its_start_line() {
    let (vault, dir) = (temp_dir("dl-vault"), temp_dir("dl-model"));
    let f = files();
    let fake = FakeFetch::new(&vault)
        .hosting(&f.tokenizer.0, f.tokenizer.1.clone())
        .hosting(&f.weights.0, f.weights.1.clone());
    let (result, progress) = download(&fake, &f.pins(), &dir, &vault, &never());
    let report = result.unwrap();

    assert_eq!(report.hosts, vec!["huggingface.co", "cdn-lfs.hf.co"]);
    assert_eq!(report.bytes_received, 1_120);
    assert_eq!(fs::read(dir.join("tokenizer.json")).unwrap(), f.tokenizer.1);
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    assert!(!part_path(&dir, &f.weights.0).exists());
    assert!(!dir.join(OPEN_RUN).exists());
    assert!(fake
        .lines_at_request
        .lock()
        .unwrap()
        .iter()
        .all(|&n| n == 1));
    let last = progress.last().unwrap();
    assert_eq!(
        (last.stage, last.done, last.total),
        (Stage::Download, 1_120, 1_120)
    );
    assert!(progress.windows(2).all(|pair| pair[0].done <= pair[1].done));

    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    for line in &lines {
        assert_eq!(line["purpose"], "model-download");
        assert_eq!(line["provider"], "built-in");
        assert_eq!(line["host"], "huggingface.co");
        assert_eq!(line["question"], serde_json::Value::Null);
        assert_eq!(line["scope"]["vaultChars"], 0);
        assert_eq!(line["download"]["source"], "hugging-face");
        assert_eq!(line["download"]["revision"], pins::REVISION);
    }
    assert_eq!(lines[0]["download"]["phase"], "start");
    assert_eq!(lines[0]["download"]["hosts"], serde_json::Value::Null);
    assert_eq!(lines[1]["download"]["phase"], "close");
    assert_eq!(lines[1]["download"]["ended"], "complete");
    assert_eq!(lines[1]["download"]["bytes"], 1_120);
    assert_eq!(
        lines[1]["download"]["hosts"],
        serde_json::json!(["huggingface.co", "cdn-lfs.hf.co"])
    );
    assert_eq!(lines[1]["outcome"], "ok");
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn resumes_a_partial_file_from_where_it_stopped() {
    let (vault, dir) = (temp_dir("resume-vault"), temp_dir("resume-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    fs::write(
        part_path(&dir, &f.weights.0),
        f.weights.1.get(..400).unwrap(),
    )
    .unwrap();
    let fake = FakeFetch::new(&vault).hosting(&f.weights.0, f.weights.1.clone());
    let (result, _) = download(&fake, &f.pins(), &dir, &vault, &never());

    assert_eq!(result.unwrap().bytes_received, 600);
    assert!(fake.requests().iter().all(|(_, from)| *from == 400));
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn starts_over_when_the_server_ignores_the_range() {
    let (vault, dir) = (temp_dir("norange-vault"), temp_dir("norange-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    fs::write(
        part_path(&dir, &f.weights.0),
        f.weights.1.get(..400).unwrap(),
    )
    .unwrap();
    let data = f.weights.1.clone();
    let fake =
        FakeFetch::new(&vault).route(&pins::resolve_url(&f.weights.0), move |_| serve(&data, 0));
    let (result, _) = download(&fake, &f.pins(), &dir, &vault, &never());

    assert_eq!(result.unwrap().bytes_received, 1_000);
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_file_already_in_place_asks_nothing_and_writes_no_line() {
    let (vault, dir) = (temp_dir("present-vault"), temp_dir("present-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    fs::write(dir.join("pytorch_model.bin"), &f.weights.1).unwrap();
    let (result, progress) = download(&PanicFetch, &f.pins(), &dir, &vault, &never());

    assert_eq!(result.unwrap(), DownloadReport::default());
    assert!(!crate::llm_audit::audit_log_path(&vault).exists());
    assert!(progress.iter().all(|p| p.stage == Stage::Verify));
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_hash_mismatch_deletes_the_download_and_closes_as_failed() {
    let (vault, dir) = (temp_dir("hash-vault"), temp_dir("hash-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    let mut tampered = f.weights.1.clone();
    tampered[500] ^= 1;
    let fake = FakeFetch::new(&vault).hosting(&f.weights.0, tampered);
    let (result, _) = download(&fake, &f.pins(), &dir, &vault, &never());

    assert!(matches!(result, Err(EmbedError::HashMismatch(name)) if name == "pytorch_model.bin"));
    assert!(!dir.join("pytorch_model.bin").exists());
    assert!(!part_path(&dir, &f.weights.0).exists());
    let lines = audit_lines(&vault);
    assert_eq!(lines[1]["download"]["ended"], "failed");
    assert_eq!(lines[1]["outcome"], "error");
    assert_eq!(
        lines[1]["download"]["hosts"],
        serde_json::json!(["huggingface.co", "cdn-lfs.hf.co"])
    );
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_size_mismatch_is_refused_before_or_while_the_body_arrives() {
    let f = files();
    let url = pins::resolve_url(&f.weights.0);
    let data = f.weights.1.clone();
    let wrong_length: Route = Box::new(move |_| Response {
        head: Head {
            status: 200,
            content_length: Some(999),
            ..Head::default()
        },
        body: data.clone(),
    });
    let mut longer = f.weights.1.clone();
    longer.extend_from_slice(b"extra");
    let too_long: Route = Box::new(move |_| Response {
        head: Head {
            status: 200,
            ..Head::default()
        },
        body: longer.clone(),
    });
    let wrong_total: Route = Box::new(|from| Response {
        head: Head {
            status: 206,
            content_range: Some(ContentRange {
                start: from,
                end: 1_999,
                total: 2_000,
            }),
            ..Head::default()
        },
        body: Vec::new(),
    });
    for (tag, route, partial) in [
        ("length", wrong_length, 0),
        ("long", too_long, 0),
        ("total", wrong_total, 100),
    ] {
        let (vault, dir) = (temp_dir("size-vault"), temp_dir("size-model"));
        fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
        if partial > 0 {
            fs::write(
                part_path(&dir, &f.weights.0),
                f.weights.1.get(..partial).unwrap(),
            )
            .unwrap();
        }
        let mut fake = FakeFetch::new(&vault);
        fake.routes.insert(url.clone(), route);
        let (result, _) = download(&fake, &f.pins(), &dir, &vault, &never());
        assert!(
            matches!(result, Err(EmbedError::SizeMismatch(_))),
            "{tag}: {result:?}"
        );
        assert!(!part_path(&dir, &f.weights.0).exists(), "{tag}");
        assert!(!dir.join("pytorch_model.bin").exists(), "{tag}");
        fs::remove_dir_all(&vault).ok();
        fs::remove_dir_all(&dir).ok();
    }
}

#[test]
fn stop_keeps_the_partial_file_and_the_next_run_resumes_it() {
    let (vault, dir) = (temp_dir("stop-vault"), temp_dir("stop-model"));
    let f = files();
    fs::write(dir.join("tokenizer.json"), &f.tokenizer.1).unwrap();
    let mut fake = FakeFetch::new(&vault).hosting(&f.weights.0, f.weights.1.clone());
    fake.stop_after = Some(300);
    let cancel = never();
    let (result, _) = download(&fake, &f.pins(), &dir, &vault, &cancel);

    assert!(matches!(result, Err(EmbedError::Cancelled)));
    let kept = fs::metadata(part_path(&dir, &f.weights.0)).unwrap().len();
    assert!((300..1_000).contains(&kept), "{kept}");
    let lines = audit_lines(&vault);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[1]["download"]["ended"], "stopped");
    assert_eq!(lines[1]["download"]["bytes"], kept);

    let fake = FakeFetch::new(&vault).hosting(&f.weights.0, f.weights.1.clone());
    let (result, _) = download(&fake, &f.pins(), &dir, &vault, &never());
    assert_eq!(result.unwrap().bytes_received, 1_000 - kept);
    assert!(fake.requests().iter().all(|(_, from)| *from == kept));
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[cfg(any(unix, windows))]
#[test]
fn an_unwritable_audit_log_means_nothing_is_requested() {
    let (vault, dir) = (temp_dir("blocked-vault"), temp_dir("blocked-model"));
    block_audit_log(&vault);
    let f = files();
    let (result, _) = download(&PanicFetch, &f.pins(), &dir, &vault, &never());
    assert!(matches!(result, Err(EmbedError::AuditBlocked(_))));
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_run_left_without_its_close_line_is_closed_before_anything_is_asked() {
    let (vault, dir) = (temp_dir("orphan-vault"), temp_dir("orphan-model"));
    let f = files();
    fs::write(
        dir.join(OPEN_RUN),
        r#"{"run":"earlier","hosts":["huggingface.co","cdn-lfs.hf.co"]}"#,
    )
    .unwrap();

    block_audit_log(&vault);
    let (result, _) = download(&PanicFetch, &f.pins(), &dir, &vault, &never());
    assert!(matches!(result, Err(EmbedError::AuditBlocked(_))));
    assert!(dir.join(OPEN_RUN).exists(), "the run still needs its line");
    fs::remove_dir_all(crate::llm_audit::audit_log_path(&vault)).unwrap();

    let fake = FakeFetch::new(&vault)
        .hosting(&f.tokenizer.0, f.tokenizer.1.clone())
        .hosting(&f.weights.0, f.weights.1.clone());
    let (result, _) = download(&fake, &f.pins(), &dir, &vault, &never());
    result.unwrap();
    let lines = audit_lines(&vault);
    assert_eq!(lines[0]["download"]["run"], "earlier");
    assert_eq!(lines[0]["download"]["phase"], "close");
    assert_eq!(lines[0]["download"]["ended"], "failed");
    assert_eq!(
        lines[0]["download"]["hosts"],
        serde_json::json!(["huggingface.co", "cdn-lfs.hf.co"])
    );
    assert_eq!(fake.lines_at_request.lock().unwrap()[0], 2);
    assert!(!dir.join(OPEN_RUN).exists());
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[cfg(unix)]
#[test]
fn a_link_planted_as_the_partial_file_is_replaced_not_followed() {
    let (vault, dir) = (temp_dir("link-vault"), temp_dir("link-model"));
    let outside = temp_dir("link-outside").join("precious");
    fs::write(&outside, b"keep me").unwrap();
    let f = files();
    std::os::unix::fs::symlink(&outside, part_path(&dir, &f.weights.0)).unwrap();
    std::os::unix::fs::symlink(&outside, dir.join("tokenizer.json")).unwrap();
    let fake = FakeFetch::new(&vault)
        .hosting(&f.tokenizer.0, f.tokenizer.1.clone())
        .hosting(&f.weights.0, f.weights.1.clone());
    let (result, _) = download(&fake, &f.pins(), &dir, &vault, &never());

    result.unwrap();
    assert_eq!(fs::read(&outside).unwrap(), b"keep me");
    assert_eq!(
        fs::read(dir.join("pytorch_model.bin")).unwrap(),
        f.weights.1
    );
    assert!(!fs::symlink_metadata(dir.join("tokenizer.json"))
        .unwrap()
        .file_type()
        .is_symlink());
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
    fs::remove_dir_all(outside.parent().unwrap()).ok();
}

#[test]
fn a_redirect_outside_the_allowed_hosts_is_never_followed() {
    let (vault, dir) = (temp_dir("evil-vault"), temp_dir("evil-model"));
    let f = files();
    let fake = FakeFetch::new(&vault).route(&pins::resolve_url(&f.tokenizer.0), |_| {
        redirect("https://downloads.example.com/tokenizer.json")
    });
    let (result, _) = download(&fake, &f.pins(), &dir, &vault, &never());

    assert!(
        matches!(&result, Err(EmbedError::HostRefused(host)) if host == "https://downloads.example.com"),
        "{result:?}"
    );
    assert_eq!(fake.requests().len(), 1);
    let close = &audit_lines(&vault)[1];
    assert_eq!(close["download"]["ended"], "failed");
    assert_eq!(
        close["download"]["hosts"],
        serde_json::json!(["huggingface.co"])
    );
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn only_https_on_hugging_face_hosts_passes_the_redirect_check() {
    let base =
        url::Url::parse("https://huggingface.co/BAAI/bge-m3/resolve/x/tokenizer.json").unwrap();
    for allowed in [
        "https://cdn-lfs.hf.co/repos/a/b?X-Amz-Signature=1",
        "https://cas-bridge.xethub.hf.co/xet-bridge-us/abc",
        "https://cdn-lfs-us-1.huggingface.co/x",
        "/api/resolve-cache/models/BAAI/bge-m3/x/tokenizer.json",
        // Allowed here; `globoff` keeps curl from expanding it into many requests.
        "https://cdn-lfs.hf.co/x?part=[1-9999999]",
    ] {
        assert!(checked_url(allowed, Some(&base)).is_ok(), "{allowed}");
    }
    for refused in [
        "http://cdn-lfs.hf.co/x",
        "https://huggingface.co.evil.example.com/x",
        "https://evilhf.co/x",
        "https://user@cdn-lfs.hf.co/x",
        "https://huggingface.co@evil.example.com/x",
        "https://cdn-lfs.hf.co:8443/x",
        "https://127.0.0.1/x",
        "https://[::1]/x",
        "ftp://huggingface.co/x",
        "//evil.example.com/x",
    ] {
        assert!(
            matches!(
                checked_url(refused, Some(&base)),
                Err(EmbedError::HostRefused(_))
            ),
            "{refused}"
        );
    }
}

#[test]
fn a_relative_redirect_stays_on_huggingface() {
    let (vault, dir) = (temp_dir("rel-vault"), temp_dir("rel-model"));
    let f = files();
    let cache = "https://huggingface.co/api/resolve-cache/models/BAAI/bge-m3/x/tokenizer.json";
    let data = f.tokenizer.1.clone();
    let fake = FakeFetch::new(&vault)
        .route(&pins::resolve_url(&f.tokenizer.0), |_| {
            redirect("/api/resolve-cache/models/BAAI/bge-m3/x/tokenizer.json")
        })
        .route(cache, move |from| serve(&data, from));
    let (result, _) = download(&fake, &[f.tokenizer.0], &dir, &vault, &never());
    assert_eq!(result.unwrap().hosts, vec!["huggingface.co"]);
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_redirect_loop_ends() {
    let (vault, dir) = (temp_dir("loop-vault"), temp_dir("loop-model"));
    let f = files();
    let url = pins::resolve_url(&f.tokenizer.0);
    let again = url.clone();
    let fake = FakeFetch::new(&vault).route(&url, move |_| redirect(&again));
    let (result, _) = download(&fake, &[f.tokenizer.0], &dir, &vault, &never());
    assert!(matches!(result, Err(EmbedError::ResponseInvalid(_))));
    assert!(fake.requests().len() <= 9);
    fs::remove_dir_all(&vault).ok();
    fs::remove_dir_all(&dir).ok();
}
