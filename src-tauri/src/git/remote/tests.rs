use super::*;

#[test]
fn validate_remote_url_accepts_the_four_real_shapes() {
    for url in [
        "git@github.com:me/repo.git",
        "https://github.com/me/repo.git",
        "ssh://git@host/me/repo.git",
        "/Users/me/backup/repo.git",
        "D:\\backup\\repo.git",
        "D:/backup/repo.git",
    ] {
        assert_eq!(
            validate_remote_url(url).unwrap(),
            url,
            "should accept {url}"
        );
    }
    assert_eq!(
        validate_remote_url("  git@github.com:me/repo.git \n").unwrap(),
        "git@github.com:me/repo.git"
    );
}

#[test]
fn validate_remote_url_rejects_non_addresses() {
    for bad in [
        "",
        "   ",
        "--upload-pack=evil",
        "git@host:a b",
        "저장소주소",
        "D:",
        "1:\\backup",
    ] {
        assert!(validate_remote_url(bad).is_err(), "should reject {bad:?}");
    }
}
