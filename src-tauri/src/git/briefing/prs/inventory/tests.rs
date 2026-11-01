use super::*;
use serde_json::json;

fn scan() -> Scan {
    Scan {
        owner: "test-window".into(),
        identity: Identity {
            scope: SourceScope::Picked,
            root: "/fixture".into(),
            head: "a".repeat(40),
            object: (1, 2),
        },
        snapshot: "snapshot".into(),
        repository: "owner/repo".into(),
        start: 1_000_000_000,
        end: 1_100_000_000,
        page: 1,
        size_index: 0,
        scanned: 0,
        versions: BTreeMap::new(),
        omitted: BTreeMap::new(),
        unlisted_omissions: 0,
        retained_records: 0,
        retained_bytes: 0,
        previous_timestamp: None,
        ordering_uncertain: false,
        restarted: false,
        repository_id: None,
        retry_smaller_only: false,
    }
}
fn record(number: u64, updated: &str, body: &str) -> Value {
    json!({ "number": number, "title": format!("PR {number}"), "body": body, "updated_at": updated,
        "state": "open", "draft": false, "merged_at": null, "base": { "repo": { "full_name": "owner/repo", "id": 123 } } })
}
fn page(value: Value, link: &str) -> Page {
    let bytes = value.to_string().len();
    Page {
        value,
        link: link.into(),
        bytes,
    }
}
fn metadata(id: u64) -> Page {
    page(
        json!({ "private": false, "full_name": "owner/repo", "id": id }),
        "",
    )
}
fn link(id: u64, page: usize, size: usize) -> String {
    format!("<https://api.github.com/repositories/{id}/pulls?state=all&sort=updated&direction=desc&per_page={size}&page={page}>; rel=\"next\"")
}

#[test]
fn validates_repository_id_in_provider_link_without_using_its_url() {
    let mut state = scan();
    let mut attempted_requests = Vec::new();
    let result = collect(
        &mut state,
        |path, _, _| {
            attempted_requests.push(path.to_string());
            if path == "owner/repo" {
                return Ok(metadata(123));
            }
            if path.ends_with("page=1") {
                return Ok(page(
                    json!([record(1, "2004-01-01T00:00:00Z", "first")]),
                    &link(123, 2, 20),
                ));
            }
            Ok(page(
                json!([record(2, "2003-12-01T00:00:00Z", "second")]),
                "",
            ))
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.status, "observed");
    assert_eq!(result.observed_distinct, 2);
    assert_eq!(
        attempted_requests,
        vec![
            "owner/repo",
            "owner/repo/pulls?state=all&sort=updated&direction=desc&per_page=20&page=1",
            "owner/repo/pulls?state=all&sort=updated&direction=desc&per_page=20&page=2"
        ]
    );
    let mut state = scan();
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Ok(page(json!([]), &link(456, 2, 20)))
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.reason, Some("invalid-link"));
    assert_eq!(result.scanned, 0);
}

#[test]
fn later_page_failure_returns_prior_originals_and_resumes_at_the_failed_page() {
    let mut state = scan();
    let first = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else if path.ends_with("page=1") {
                Ok(page(json!([record(1, "2004-01-01T00:00:00Z", "first")]), &link(123, 2, 20)))
            } else {
                Err(PageError::Unavailable)
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(first.status, "partial");
    assert_eq!(first.reason, Some("unavailable"));
    assert!(first.can_continue);
    assert_eq!(first.versions.iter().map(|v| v.number).collect::<Vec<_>>(), [1]);
    assert_eq!(state.page, 2);
    let next = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                assert!(path.ends_with("page=2"));
                Ok(page(json!([record(2, "2003-12-01T00:00:00Z", "second")]), ""))
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(next.status, "observed");
    assert_eq!(next.observed_distinct, 2);
    assert_eq!(next.versions.iter().map(|v| v.number).collect::<Vec<_>>(), [2]);
}

#[test]
fn changing_repository_identity_stops_continuation_without_reading_another_page() {
    let mut state = scan();
    let mut calls = 0;
    let first = collect(
        &mut state,
        |path, _, _| {
            calls += 1;
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Ok(page(json!([]), &link(123, calls, 20)))
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(first.reason, Some("page-limit"));
    let result = collect(
        &mut state,
        |path, _, _| {
            assert_eq!(path, "owner/repo");
            Ok(metadata(456))
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.reason, Some("repository-changed"));
    assert!(!result.can_continue);
}

#[test]
fn rejects_host_query_and_page_changes_in_next_links() {
    let valid = link(123, 2, 20);
    assert_eq!(next_page(&valid, "owner/repo", 123, 1, 20), Ok(true));
    for altered in [
        valid.replace("api.github.com", "evil.invalid"),
        valid.replace("repositories/123", "repositories/456"),
        valid.replace("state=all", "state=open"),
        valid.replace("page=2", "page=3"),
        valid.replace("per_page=20", "per_page=10"),
        valid.replace("page=2", "page=2&token=secret"),
    ] {
        assert!(
            next_page(&altered, "owner/repo", 123, 1, 20).is_err(),
            "{altered}"
        );
    }
}

#[test]
fn duplicate_prs_count_once_but_conflicting_versions_are_preserved() {
    let mut state = scan();
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                return Ok(metadata(123));
            }
            if path.ends_with("page=1") {
                return Ok(page(
                    json!([record(1, "2004-01-01T00:00:00Z", "first")]),
                    &link(123, 2, 20),
                ));
            }
            Ok(page(
                json!([
                    record(1, "2004-01-01T00:00:00Z", "changed"),
                    record(1, "2004-01-01T00:00:00Z", "changed")
                ]),
                "",
            ))
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.observed_distinct, 1);
    assert_eq!(result.versions.len(), 2);
    assert_eq!(result.conflicts, vec![1]);
    assert_eq!(result.scanned, 3);
}

#[test]
fn a_page_that_only_exceeds_the_remaining_budget_can_be_read_next_action() {
    let mut state = scan();
    state.size_index = PAGE_SIZES.len() - 1;
    let mut first = record(1, "2004-01-02T00:00:00Z", "first");
    let mut second = record(2, "2004-01-01T00:00:00Z", "second");
    first["padding"] = json!("a".repeat(1_400_000));
    second["padding"] = json!("b".repeat(800_000));
    let get = |path: &str, limit: usize, _: Instant| {
        let reply = if path == "owner/repo" {
            metadata(123)
        } else if path.ends_with("page=1") {
            page(
                json!([record(3, "2004-01-03T00:00:00Z", "retained")]),
                &link(123, 2, 1),
            )
        } else if path.ends_with("page=2") {
            page(json!([first.clone()]), &link(123, 3, 1))
        } else {
            page(json!([second.clone()]), "")
        };
        if reply.bytes > limit {
            Err(PageError::Oversized)
        } else {
            Ok(reply)
        }
    };
    let first_action = collect(&mut state, get, &AtomicBool::new(false));
    assert_eq!(first_action.reason, Some("byte-limit"));
    assert!(first_action.can_continue);
    assert!(!first_action.retry_smaller);
    assert_eq!(state.page, 3);
    assert_eq!(first_action.versions.len(), 1);
    assert_eq!(first_action.versions[0].number, 3);
    assert_eq!(first_action.omitted.len(), 1);
    let second_action = collect(&mut state, get, &AtomicBool::new(false));
    assert_eq!(second_action.reason, Some("end-of-list"));
    assert_eq!(second_action.omitted.len(), 2);
    assert_eq!(second_action.observed_distinct, 3);
}

#[test]
fn a_single_page_exceeding_a_fresh_action_budget_cannot_continue_at_size_one() {
    let mut state = scan();
    state.size_index = PAGE_SIZES.len() - 1;
    let mut item = record(1, "2004-01-01T00:00:00Z", "first");
    item["padding"] = json!("x".repeat(ACTION_BYTES));
    let result = collect(
        &mut state,
        |path, limit, _| {
            let reply = if path == "owner/repo" {
                metadata(123)
            } else {
                page(json!([item.clone()]), "")
            };
            if reply.bytes > limit {
                Err(PageError::Oversized)
            } else {
                Ok(reply)
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.reason, Some("scan-cannot-continue"));
    assert!(!result.can_continue);
    assert!(!result.retry_smaller);
    assert_eq!(state.page, 1);
    assert!(result.versions.is_empty());
}

#[test]
fn oversized_page_stops_and_only_offers_a_smaller_retry() {
    let mut state = scan();
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Err(PageError::Oversized)
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.reason, Some("page-oversized"));
    assert!(result.retry_smaller);
    assert!(!result.can_continue);
    state.size_index = PAGE_SIZES.len() - 1;
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Err(PageError::Oversized)
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.reason, Some("scan-cannot-continue"));
    assert!(!result.retry_smaller);
}

#[test]
fn unknown_records_and_failed_pages_remain_explicit_not_empty_success() {
    let mut state = scan();
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Ok(page(json!([{ "number": 1 }]), ""))
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.status, "partial");
    assert_eq!(result.reason, Some("invalid-response"));
    let mut state = scan();
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Err(PageError::Unavailable)
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.reason, Some("unavailable"));
    assert_ne!(result.status, "observed");
}

#[test]
fn bounds_each_action_to_five_pages_and_counts_metadata() {
    let mut state = scan();
    let mut pages = 0;
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                return Ok(metadata(123));
            }
            pages += 1;
            Ok(page(
                json!([record(pages as u64, "2004-01-01T00:00:00Z", "body")]),
                &link(123, pages + 1, 20),
            ))
        },
        &AtomicBool::new(false),
    );
    assert_eq!(pages, 5);
    assert_eq!(result.attempted_requests, 6);
    assert_eq!(result.scanned, 5);
    assert_eq!(result.reason, Some("page-limit"));
    assert!(result.can_continue);
    assert_eq!(state.page, 6);
    assert!(result.parsed_json_body_bytes > 0);
}

#[test]
fn interruption_preserves_completed_pages_and_never_fetches_the_next() {
    let mut state = scan();
    let cancelled = AtomicBool::new(false);
    let mut pages = 0;
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                return Ok(metadata(123));
            }
            pages += 1;
            cancelled.store(true, Ordering::Release);
            Ok(page(
                json!([record(7, "2004-01-01T00:00:00Z", "retained")]),
                &link(123, 2, 20),
            ))
        },
        &cancelled,
    );
    assert_eq!(result.status, "cancelled");
    assert_eq!(result.versions[0].body, "retained");
    assert_eq!(pages, 1);
    assert!(result.can_continue);
    assert_eq!(state.page, 2);
}

#[test]
fn reports_an_oversized_original_by_identity_without_a_truncated_body() {
    let mut state = scan();
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Ok(page(
                    json!([record(7, "2004-01-01T00:00:00Z", &"x".repeat(RECORD_BYTES))]),
                    "",
                ))
            }
        },
        &AtomicBool::new(false),
    );
    assert!(result.versions.is_empty());
    assert_eq!(result.omitted[0].number, 7);
    assert_eq!(result.omitted[0].reason, "record-oversized");
    assert_eq!(result.observed_distinct, 1);
}

#[test]
fn disordered_timestamps_do_not_claim_the_old_record_is_a_safe_cutoff() {
    let mut state = scan();
    let mut pages = 0;
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                return Ok(metadata(123));
            }
            pages += 1;
            if pages == 1 {
                return Ok(page(
                    json!([
                        record(1, "2000-01-01T00:00:00Z", "old"),
                        record(2, "2004-01-01T00:00:00Z", "in period")
                    ]),
                    &link(123, 2, 20),
                ));
            }
            Ok(page(json!([record(3, "2003-01-01T00:00:00Z", "next")]), ""))
        },
        &AtomicBool::new(false),
    );
    assert_eq!(pages, 2);
    assert!(result.ordering_uncertain);
    assert_eq!(result.observed_distinct, 2);
    assert_eq!(result.reason, Some("end-of-list"));
}

#[test]
fn cursor_cannot_cross_window_or_scope_and_cannot_retry_an_oversized_page_unchanged() {
    let mut state = scan();
    state.retry_smaller_only = true;
    let id = save_scan(state.clone()).unwrap();
    assert!(take_scan(
        &id,
        "other-window",
        &state.identity,
        &state.snapshot,
        &state.repository,
        state.start,
        state.end,
        true
    )
    .is_err());
    assert!(take_scan(
        &id,
        &state.owner,
        &state.identity,
        &state.snapshot,
        &state.repository,
        state.start,
        state.end,
        false
    )
    .is_err());
    assert!(take_scan(
        &id,
        &state.owner,
        &state.identity,
        &state.snapshot,
        &state.repository,
        state.start,
        state.end,
        true
    )
    .is_ok());
    assert!(take_scan(
        &id,
        &state.owner,
        &state.identity,
        &state.snapshot,
        &state.repository,
        state.start,
        state.end,
        true
    )
    .is_err());
}

#[test]
fn expired_or_cancelled_action_sends_no_request() {
    let mut state = scan();
    let cancelled = AtomicBool::new(true);
    let mut calls = 0;
    let result = collect_until(
        &mut state,
        |_, _, _| {
            calls += 1;
            Err(PageError::Unavailable)
        },
        &cancelled,
        Instant::now() + Duration::from_secs(1),
    );
    assert_eq!(result.status, "cancelled");
    assert_eq!(calls, 0);
    cancelled.store(false, Ordering::Release);
    let result = collect_until(
        &mut state,
        |_, _, _| {
            calls += 1;
            Err(PageError::Unavailable)
        },
        &cancelled,
        Instant::now(),
    );
    assert_eq!(result.reason, Some("time-limit"));
    assert_eq!(calls, 0);
}

#[test]
#[ignore = "explicit live check against the public Atlas repository"]
fn live_public_atlas_metadata_and_pr_page_use_fixed_get_transport() {
    let repository = "wlsdks/ontology-atlas";
    let cancelled = AtomicBool::new(false);
    let deadline = Instant::now() + Duration::from_secs(30);
    let meta = fetch(repository, ACTION_BYTES, deadline, &cancelled).unwrap();
    assert_eq!(meta.value["private"], false);
    assert_eq!(meta.value["full_name"], repository);
    let id = meta.value["id"].as_u64().unwrap();
    let path = page_path(repository, 20, 1);
    let fetched = fetch(&path, ACTION_BYTES - meta.bytes, deadline, &cancelled).unwrap();
    let entries = fetched.value.as_array().unwrap();
    assert!(!entries.is_empty());
    assert!(pull(&entries[0], repository, id).is_ok());
    assert_eq!(next_page(&fetched.link, repository, id, 1, 20), Ok(true));
}

#[test]
fn rejects_nonpublic_or_unidentified_repository_before_any_page_request() {
    for value in [
        json!({"private":true,"full_name":"owner/repo","id":123}),
        json!({"private":false,"full_name":"other/repo","id":123}),
        json!({"private":false,"full_name":"owner/repo"}),
    ] {
        let mut state = scan();
        let mut calls = 0;
        let result = collect(
            &mut state,
            |_, _, _| {
                calls += 1;
                Ok(page(value.clone(), ""))
            },
            &AtomicBool::new(false),
        );
        assert_eq!(calls, 1);
        assert_ne!(result.status, "observed");
        assert!(result.versions.is_empty());
    }
}

#[test]
fn transport_uses_an_explicit_anonymous_get_without_redirects_or_proxy() {
    let command = public_curl(
        "https://api.github.com/repos/owner/repo",
        "15",
        "2097152",
        "trailer",
    );
    assert_eq!(command.get_program(), "/usr/bin/curl");
    let args: Vec<_> = command
        .get_args()
        .map(|arg| arg.to_str().unwrap())
        .collect();
    assert!(args.windows(2).any(|pair| pair == ["--request", "GET"]));
    assert!(args.windows(2).any(|pair| pair == ["--noproxy", "*"]));
    assert!(args.windows(2).any(|pair| pair == ["--proto", "=https"]));
    assert!(!args.iter().any(|arg| matches!(
        *arg,
        "--location" | "-L" | "--insecure" | "-k" | "--user" | "-u"
    )));
    assert!(!args
        .iter()
        .any(|arg| arg.to_ascii_lowercase().contains("authorization:")));
    assert_eq!(
        command
            .get_envs()
            .map(|(key, value)| (key.to_str().unwrap(), value.unwrap().to_str().unwrap()))
            .collect::<Vec<_>>(),
        vec![("LC_ALL", "C")]
    );
}

#[test]
fn observed_end_with_an_unavailable_original_is_partial_and_remains_visible() {
    let mut state = scan();
    let first = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Ok(page(
                    json!([record(7, "2004-01-01T00:00:00Z", &"x".repeat(RECORD_BYTES))]),
                    "",
                ))
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(first.status, "partial");
    assert_eq!(first.omitted.len(), 1);
    let later = result(&state);
    assert_eq!(later.omitted.len(), 1);
    assert_eq!(later.omitted[0].number, 7);
}

#[test]
fn multiple_unavailable_versions_remain_visible_and_conflict_with_retained_original() {
    let mut state = scan();
    let original = record(7, "2004-01-01T00:00:00Z", "original");
    let (version, bytes, _) = pull(&original, "owner/repo", 123).unwrap();
    state.versions.entry(7).or_default().insert(version.digest);
    state.retained_records = 1;
    state.retained_bytes = bytes;
    let missing_a = record(7, "2004-01-02T00:00:00Z", &"a".repeat(RECORD_BYTES));
    let missing_b = record(7, "2004-01-03T00:00:00Z", &"b".repeat(RECORD_BYTES));
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Ok(page(json!([missing_b.clone(), missing_a.clone()]), ""))
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.status, "partial");
    assert_eq!(result.observed_distinct, 1);
    assert_eq!(result.omitted.len(), 2);
    assert_ne!(result.omitted[0].digest, result.omitted[1].digest);
    assert_eq!(result.conflicts, vec![7]);
    assert_eq!(super::result(&state).omitted.len(), 2);
}

#[test]
fn rejects_unparseable_or_redirect_http_without_following_it() {
    let framed = b"\nATLAS_LINK\t\nATLAS_HTTP\t302\t\t\t";
    assert!(matches!(
        parse_response(b"{}", framed, ACTION_BYTES, true),
        Err(PageError::Unavailable)
    ));
    let framed = b"\nATLAS_LINK\t\nATLAS_HTTP\t429\t\t\t";
    assert!(matches!(
        parse_response(b"{}", framed, ACTION_BYTES, false),
        Err(PageError::RateLimited(None))
    ));
    let framed = b"\nATLAS_LINK\t\nATLAS_HTTP\t200\t\t\t";
    assert!(matches!(
        parse_response(b"not-json", framed, ACTION_BYTES, true),
        Err(PageError::Unavailable)
    ));
}

#[test]
fn refuses_a_page_from_a_replaced_repository_even_without_a_next_link() {
    let mut state = scan();
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                return Ok(metadata(123));
            }
            let mut item = record(7, "2004-01-01T00:00:00Z", "wrong repository");
            item["base"]["repo"]["id"] = json!(456);
            Ok(page(json!([item]), ""))
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.status, "partial");
    assert_eq!(result.reason, Some("invalid-response"));
    assert!(result.versions.is_empty());
    assert_eq!(result.scanned, 0);
}

#[test]
fn distinguishes_null_description_from_an_empty_description() {
    let mut missing = record(7, "2004-01-01T00:00:00Z", "");
    missing["body"] = Value::Null;
    let (missing, _, _) = pull(&missing, "owner/repo", 123).unwrap();
    let (empty, _, _) = pull(&record(7, "2004-01-01T00:00:00Z", ""), "owner/repo", 123).unwrap();
    assert!(!missing.body_present);
    assert!(empty.body_present);
    assert_ne!(missing.digest, empty.digest);
}

#[test]
fn already_retained_version_is_not_reported_missing_at_the_session_limit() {
    let mut state = scan();
    let item = record(7, "2004-01-01T00:00:00Z", "existing");
    let (version, _, _) = pull(&item, "owner/repo", 123).unwrap();
    state.versions.entry(7).or_default().insert(version.digest);
    state.retained_records = RECORD_LIMIT;
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Ok(page(json!([item.clone()]), ""))
            }
        },
        &AtomicBool::new(false),
    );
    assert!(result.omitted.is_empty());
    assert_eq!(result.status, "observed");
    assert_eq!(result.observed_distinct, 1);
}

#[test]
fn a_smaller_page_restart_retains_partial_coverage_after_reaching_the_end() {
    let mut state = scan();
    state.restarted = true;
    state.size_index = 1;
    let result = collect(
        &mut state,
        |path, _, _| {
            if path == "owner/repo" {
                Ok(metadata(123))
            } else {
                Ok(page(json!([]), ""))
            }
        },
        &AtomicBool::new(false),
    );
    assert_eq!(result.status, "partial");
    assert_eq!(result.reason, Some("end-of-list"));
    assert!(result.restarted);
}

#[test]
#[ignore = "explicit live check against the public Atlas repository"]
fn live_public_atlas_period_scan_reports_first_hand_coverage() {
    let mut state = scan();
    state.repository = "wlsdks/ontology-atlas".into();
    state.start = chrono::DateTime::parse_from_rfc3339("2026-10-26T00:00:00+09:00")
        .unwrap()
        .timestamp();
    state.end = chrono::DateTime::parse_from_rfc3339("2026-11-02T00:00:00+09:00")
        .unwrap()
        .timestamp();
    let cancelled = AtomicBool::new(false);
    let out = collect(
        &mut state,
        |path, limit, deadline| fetch(path, limit, deadline, &cancelled),
        &cancelled,
    );
    println!("status={} reason={:?} attempted_requests={} body_bytes={} scanned={} distinct={} returned={} omissions={} moving_list_uncertain={}", out.status, out.reason, out.attempted_requests, out.parsed_json_body_bytes, out.scanned, out.observed_distinct, out.versions.len(), out.omitted.len(), out.moving_list_uncertain);
    assert_ne!(out.status, "unavailable");
    assert!(!out.versions.is_empty());
    assert!(out.attempted_requests <= PAGES_PER_ACTION + 1);
    assert!(out.parsed_json_body_bytes <= ACTION_BYTES);
    assert!(out.moving_list_uncertain);
}
