use super::*;
use crate::library::fixture_folder::discovery_cases;

#[test]
fn discovery_refuses_the_files_local_first_forbids_reading() {
    for name in [
        ".env",
        ".env.local",
        "id_rsa",
        "credentials.json",
        "credentials.csv",
        "server.pem",
        "api_key.txt",
        "secrets.xlsx",
        ".hidden.pdf",
    ] {
        assert!(
            !discovery_accepts_file(name),
            "{name} must never be proposed as a candidate"
        );
    }
}

#[test]
fn discovery_accepts_ordinary_project_documents() {
    for name in [
        "Requirements.pdf",
        "quarter plan.docx",
        "numbers.xlsx",
        "notes.txt",
        "deck.pptx",
    ] {
        assert!(discovery_accepts_file(name), "{name} should be a candidate");
    }
}

#[test]
fn discovery_refuses_code_and_markdown() {
    for name in ["index.ts", "README.md", "Cargo.toml", "data.json"] {
        assert!(!discovery_accepts_file(name), "{name} is not a document");
    }
}

#[test]
fn the_shared_directory_table_holds_with_either_separator() {
    let cases = discovery_cases();
    for row in cases["directories"].as_array().unwrap() {
        let path = row["path"].as_str().unwrap();
        assert_eq!(
            discovery_accepts_directory(path),
            row["descends"].as_bool().unwrap(),
            "{path:?}"
        );
    }
}
