use super::*;
use crate::git::test_support::Scratch;

fn request(path: &str, commit: &str) -> EvidenceTextRequest {
    EvidenceTextRequest {
        path: path.to_string(),
        commit: commit.to_string(),
    }
}

#[test]
fn reads_a_file_at_its_commit_and_in_the_working_tree() {
    let scratch = Scratch::new("evidence-text-read");
    std::fs::create_dir_all(scratch.work.join("src")).unwrap();
    scratch.commit("src/pay.ts", "// old\nconst pay = 1;\n");
    let commit = scratch.git(&["rev-parse", "HEAD"]);
    scratch.commit("src/pay.ts", "// new\nconst pay = 1;\n");

    let pairs = read_text_pairs(&scratch.work, &[request("src/pay.ts", &commit)]);
    assert_eq!(pairs.len(), 1);
    assert_eq!(pairs[0].before.as_deref(), Some("// old\nconst pay = 1;\n"));
    assert_eq!(pairs[0].after.as_deref(), Some("// new\nconst pay = 1;\n"));
}

#[test]
fn refuses_paths_that_leave_the_repository_and_malformed_commits() {
    let scratch = Scratch::new("evidence-text-escape");
    scratch.commit("pay.ts", "const pay = 1;\n");
    let commit = scratch.git(&["rev-parse", "HEAD"]);
    let outside = scratch.work.parent().unwrap().join("outside.ts");
    std::fs::write(&outside, "secret").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, scratch.work.join("link.ts")).unwrap();

    let asked = [
        request("../outside.ts", &commit),
        request("/etc/passwd", &commit),
        request("--output=x", &commit),
        request("src/../../outside.ts", &commit),
        request("link.ts", &commit),
        request("pay.ts", "HEAD"),
        request("pay.ts", "not-a-hash"),
        request("pay.ts\nHEAD:pay.ts", &commit),
    ];
    for pair in read_text_pairs(&scratch.work, &asked) {
        assert_eq!(pair.after, None, "{} must not be read", pair.path);
        assert_eq!(pair.before, None, "{} must not be read", pair.path);
    }
    // The same file, asked plainly, is read: the refusals above are about the request.
    let plain = read_text_pairs(&scratch.work, &[request("pay.ts", &commit)]);
    assert_eq!(plain[0].after.as_deref(), Some("const pay = 1;\n"));
}

#[test]
fn a_binary_oversized_or_missing_file_answers_none() {
    let scratch = Scratch::new("evidence-text-binary");
    std::fs::write(scratch.work.join("logo.bin"), b"PNG\0\x01\x02").unwrap();
    scratch.git(&["add", "logo.bin"]);
    let big = "a".repeat(1024 * 1024 + 1);
    std::fs::write(scratch.work.join("big.ts"), &big).unwrap();
    scratch.git(&["add", "big.ts"]);
    scratch.git(&["commit", "-qm", "binary and big"]);
    let commit = scratch.git(&["rev-parse", "HEAD"]);

    let pairs = read_text_pairs(
        &scratch.work,
        &[
            request("logo.bin", &commit),
            request("big.ts", &commit),
            request("never-committed.ts", &commit),
        ],
    );
    for pair in &pairs {
        assert_eq!(pair.before, None, "{}", pair.path);
        assert_eq!(pair.after, None, "{}", pair.path);
    }
}

#[test]
fn a_secret_file_is_never_read_as_asked_or_through_a_link() {
    let scratch = Scratch::new("evidence-text-secret");
    std::fs::create_dir_all(scratch.work.join("config")).unwrap();
    std::fs::write(scratch.work.join(".env.local"), "TOKEN=planted\n").unwrap();
    std::fs::write(
        scratch.work.join("config/credentials.json"),
        "{\"key\":\"planted\"}\n",
    )
    .unwrap();
    std::fs::write(scratch.work.join("deploy.pem"), "planted\n").unwrap();
    scratch.git(&[
        "add",
        "-f",
        ".env.local",
        "config/credentials.json",
        "deploy.pem",
    ]);
    scratch.commit("notes.ts", "const a = 1;\n");
    let commit = scratch.git(&["rev-parse", "HEAD"]);
    #[cfg(unix)]
    {
        std::fs::remove_file(scratch.work.join("notes.ts")).unwrap();
        std::os::unix::fs::symlink(".env.local", scratch.work.join("notes.ts")).unwrap();
        std::os::unix::fs::symlink("config/credentials.json", scratch.work.join("creds.ts"))
            .unwrap();
        std::os::unix::fs::symlink(".git/config", scratch.work.join("git.ts")).unwrap();
    }

    let asked = [
        request(".env.local", &commit),
        request("config/credentials.json", &commit),
        request("deploy.pem", &commit),
        request(".git/config", &commit),
        request("notes.ts", &commit),
        request("creds.ts", &commit),
        request("git.ts", &commit),
    ];
    let pairs = read_text_pairs(&scratch.work, &asked);
    for pair in &pairs {
        assert_eq!(pair.after, None, "{} must not be read", pair.path);
        for side in [&pair.before, &pair.after].into_iter().flatten() {
            assert!(!side.contains("planted"), "{} leaked", pair.path);
        }
    }
    // The committed `notes.ts` is plain code: only its working side, a link to a secret, is refused.
    let notes = pairs.iter().find(|pair| pair.path == "notes.ts").unwrap();
    assert_eq!(notes.before.as_deref(), Some("const a = 1;\n"));
    for name in [
        ".env.local",
        "config/credentials.json",
        "deploy.pem",
        ".git/config",
    ] {
        let pair = pairs.iter().find(|pair| pair.path == name).unwrap();
        assert_eq!(pair.before, None, "{name} must not be read at its commit");
    }
}

#[test]
fn working_files_share_one_budget_and_each_is_read_once() {
    let scratch = Scratch::new("evidence-text-budget");
    scratch.commit("a.ts", "aaaaaaaa");
    scratch.commit("b.ts", "bbbbbbbb");
    let root = std::fs::canonicalize(&scratch.work).unwrap();
    let mut budget = 12;
    assert_eq!(
        read_working(&root, "a.ts", &mut budget).as_deref(),
        Some("aaaaaaaa")
    );
    assert_eq!(budget, 4);
    assert_eq!(
        read_working(&root, "b.ts", &mut budget),
        None,
        "over what is left"
    );
    assert_eq!(budget, 4);

    let first = scratch.git(&["rev-parse", "HEAD~1"]);
    let head = scratch.git(&["rev-parse", "HEAD"]);
    let pairs = read_text_pairs(
        &scratch.work,
        &[request("a.ts", &first), request("a.ts", &head)],
    );
    assert!(pairs
        .iter()
        .all(|pair| pair.after.as_deref() == Some("aaaaaaaa")));
}

#[test]
fn hidden_or_credential_names_match_the_mcp_rule() {
    for refused in [
        ".env",
        "credentials.json",
        "secrets",
        "private-key.txt",
        "id_rsa",
        "a.pem",
        "A.KEY",
        "store.keystore",
    ] {
        assert!(hidden_or_credential_segment(refused), "{refused}");
    }
    for read in [
        "pay.ts",
        "secrets.prod.json",
        "keys.ts",
        "credential_store.rs",
        "pem",
    ] {
        assert!(!hidden_or_credential_segment(read), "{read}");
    }
}

#[test]
fn blob_size_reads_only_a_blob_header() {
    assert_eq!(blob_size("0123abcd blob 12"), Some(12));
    assert_eq!(blob_size("0123abcd tree 12"), None);
    assert_eq!(blob_size("abc:x blob 5 missing"), None);
    assert_eq!(blob_size("HEAD:pay.ts missing"), None);
}
