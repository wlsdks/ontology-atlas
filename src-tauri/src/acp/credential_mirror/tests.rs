use super::*;

#[test]
fn claude_keychain_service_matches_the_two_measured_items() {
    // Measured values; a drift would target, and could delete, someone else's item.
    assert_eq!(
        claude_credentials_service(Path::new("/Users/stark/.claude")),
        "Claude Code-credentials-ce4c8c26"
    );
    assert_eq!(
        claude_credentials_service(Path::new(
            "/Users/stark/Library/Application Support/dev.jinan.ontology-atlas/agent-config/claude-acp"
        )),
        "Claude Code-credentials-85f2eaa5"
    );
}

#[test]
fn both_keychain_items_the_terminal_could_use_are_gathered_not_ranked() {
    let services = terminal_login_services(Path::new("/Users/probe"));
    // Listing order is not a ranking; `choose_terminal_credential` decides.
    assert!(services.contains(&"Claude Code-credentials".to_string()));
    assert!(services.contains(&claude_credentials_service(
        &Path::new("/Users/probe").join(".claude")
    )));
    assert_eq!(services.len(), 2);
}

fn carrier(label: &str, digest: &str, written: Option<&str>) -> CredentialCarrier {
    CredentialCarrier {
        label: label.to_string(),
        digest: digest.to_string(),
        written: written.map(str::to_string),
        account: None,
    }
}

#[test]
fn the_newest_carrier_wins_when_the_terminals_carriers_disagree() {
    // Disagreeing carriers: recency decides (all stamps on the keychain's UTC clock).
    let chosen = choose_terminal_credential(&[
        carrier("Claude Code-credentials", "369750", Some("20260907231347")),
        carrier(
            "/Users/probe/.claude/.credentials.json",
            "811a39",
            Some("20260907222150"),
        ),
    ])
    .expect("the newest carrier to be named");
    assert_eq!(
        chosen, 0,
        "the keychain was written last, so the keychain is it"
    );

    // A local-clock file stamp would flip the answer; `file_written` normalizes to UTC.
    let mixed_clock = choose_terminal_credential(&[
        carrier("Claude Code-credentials", "369750", Some("20260907231347")),
        carrier(
            "/Users/probe/.claude/.credentials.json",
            "811a39",
            Some("20260908072150"),
        ),
    ])
    .expect("a winner to be named");
    assert_eq!(
        mixed_clock, 1,
        "a local-time stamp inverts the answer — the comparison only means something \
         when every carrier is dated on one clock"
    );
}

#[test]
fn agreeing_carriers_need_no_tiebreak_at_all() {
    // Identical bytes need no stamps.
    let chosen = choose_terminal_credential(&[
        carrier("Claude Code-credentials", "811a39", None),
        carrier("/Users/probe/.claude/.credentials.json", "811a39", None),
    ]);
    assert_eq!(chosen, Some(0));
}

#[test]
fn an_undecidable_set_of_carriers_installs_nothing() {
    assert_eq!(choose_terminal_credential(&[]), None);
    // A carrier without a stamp leaves us guessing, so nothing is chosen.
    assert_eq!(
        choose_terminal_credential(&[
            carrier("Claude Code-credentials", "369750", Some("20260907223551")),
            carrier("/Users/probe/.claude/.credentials.json", "811a39", None),
        ]),
        None
    );
    assert_eq!(
        choose_terminal_credential(&[
            carrier("Claude Code-credentials", "369750", Some("20260908072150")),
            carrier(
                "/Users/probe/.claude/.credentials.json",
                "811a39",
                Some("20260908072150")
            ),
        ]),
        None
    );
    assert_eq!(
        choose_terminal_credential(&[carrier(
            "Claude Code-credentials",
            "369750",
            Some("20260907223551")
        )]),
        Some(0)
    );
}

#[test]
fn the_keychains_last_written_stamp_is_read_off_its_attributes() {
    // Verbatim `security find-generic-password` output.
    let attributes = concat!(
        "keychain: \"/Users/probe/Library/Keychains/login.keychain-db\"\n",
        "    \"cdat\"<timedate>=0x32303236303632393139313831305A00  \"20260629191810Z\\000\"\n",
        "    \"mdat\"<timedate>=0x32303236303930373232333535315A00  \"20260907223551Z\\000\"\n",
        "    \"svce\"<blob>=\"Claude Code-credentials\"\n",
    );
    assert_eq!(
        parse_keychain_written(attributes).as_deref(),
        Some("20260907223551")
    );
    // No such attribute: the chooser refuses to guess.
    assert_eq!(parse_keychain_written("keychain: \"login\"\n"), None);
}

#[test]
fn the_mirror_is_filed_under_the_account_claude_code_itself_reads() {
    // Verbatim output; the account is the macOS login name Claude Code reads.
    let attributes = concat!(
        "keychain: \"/Users/probe/Library/Keychains/login.keychain-db\"\n",
        "    \"acct\"<blob>=\"probe\"\n",
        "    \"mdat\"<timedate>=0x32303236303931393136353335395A00  \"20260919165359Z\\000\"\n",
        "    \"svce\"<blob>=\"Claude Code-credentials\"\n",
    );
    assert_eq!(parse_keychain_account(attributes).as_deref(), Some("probe"));
    assert_eq!(parse_keychain_account("keychain: \"login\"\n"), None);

    // The legacy literal `claude` account was never read by Claude Code.
    let keychain = CredentialCarrier {
        label: "Claude Code-credentials".to_string(),
        digest: "369750".to_string(),
        written: Some("20260919165359".to_string()),
        account: Some("probe".to_string()),
    };
    let file = CredentialCarrier {
        label: "/Users/probe/.claude/.credentials.json".to_string(),
        digest: "811a39".to_string(),
        written: Some("20260919091918".to_string()),
        account: None,
    };
    let home = Path::new("/Users/probe");
    assert_eq!(
        mirror_account(&[keychain.clone(), file.clone()], home),
        "probe",
        "the account comes from the evidence, not from a literal"
    );
    assert_eq!(
        mirror_account(&[file], home),
        "probe",
        "a file carrier has no account, so the home folder's own name stands in"
    );
    assert_ne!(mirror_account(&[keychain], home), LEGACY_MIRROR_ACCOUNT);
}

#[test]
fn a_credential_is_only_ever_compared_as_a_digest() {
    let digest = credential_digest("a-token-shaped-string");
    assert_eq!(digest.len(), 64, "sha256 in lowercase hex");
    assert!(!digest.contains("a-token-shaped-string"));
    assert_eq!(digest, credential_digest("a-token-shaped-string"));
    assert_ne!(digest, credential_digest("a-different-token"));
}

#[test]
fn the_terminal_account_is_carried_into_the_app_folder_without_losing_its_other_keys() {
    let terminal = serde_json::json!({ "oauthAccount": { "emailAddress": "new@example.com" }, "other": 1 });
    let app = serde_json::json!({ "oauthAccount": { "emailAddress": "old@example.com" }, "projects": {} });
    let merged = merge_oauth_account(Some(app), &terminal).expect("an account to carry");
    assert_eq!(merged["oauthAccount"]["emailAddress"], "new@example.com");
    assert!(merged.get("projects").is_some(), "the app's own keys stay");
    assert!(merged.get("other").is_none(), "only the account travels");
    let fresh = merge_oauth_account(None, &terminal).expect("an account to carry");
    assert_eq!(fresh["oauthAccount"]["emailAddress"], "new@example.com");
    assert!(merge_oauth_account(None, &serde_json::json!({})).is_none());
}

#[test]
fn a_staler_terminal_account_does_not_overwrite_a_fresher_app_one() {
    // The staler terminal name must not overwrite the fresher app copy.
    let terminal = serde_json::json!({
        "oauthAccount": { "emailAddress": "old@example.com", "profileFetchedAt": 1785310202478i64 }
    });
    let app = serde_json::json!({
        "oauthAccount": { "emailAddress": "current@example.com", "profileFetchedAt": 1788821746365i64 }
    });
    assert!(
        merge_oauth_account(Some(app), &terminal).is_none(),
        "the fresher name stays and nothing is written"
    );

    let terminal = serde_json::json!({
        "oauthAccount": { "emailAddress": "switched@example.com", "profileFetchedAt": 1788821746365i64 }
    });
    let app = serde_json::json!({
        "oauthAccount": { "emailAddress": "left@example.com", "profileFetchedAt": 1785310202478i64 }
    });
    let merged = merge_oauth_account(Some(app), &terminal).expect("an account to carry");
    assert_eq!(
        merged["oauthAccount"]["emailAddress"],
        "switched@example.com"
    );

    let terminal = serde_json::json!({
        "oauthAccount": { "emailAddress": "same@example.com", "profileFetchedAt": 1788821746365i64 }
    });
    let app = serde_json::json!({
        "oauthAccount": { "emailAddress": "other@example.com", "profileFetchedAt": 1788821746365i64 }
    });
    let merged = merge_oauth_account(Some(app), &terminal).expect("an account to carry");
    assert_eq!(merged["oauthAccount"]["emailAddress"], "same@example.com");
}

#[test]
fn claude_keychain_service_is_stable_and_path_sensitive() {
    let a = claude_credentials_service(Path::new("/tmp/a"));
    let b = claude_credentials_service(Path::new("/tmp/b"));
    assert_ne!(a, b, "different paths must yield different entry names");
    assert_eq!(a, claude_credentials_service(Path::new("/tmp/a")));
    assert!(a.starts_with("Claude Code-credentials-"));
    assert_eq!(a.len(), "Claude Code-credentials-".len() + 8);
}
