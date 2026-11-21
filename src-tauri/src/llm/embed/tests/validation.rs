//! Response validation.

use super::*;

#[test]
fn a_well_formed_answer_is_returned_in_index_order() {
    let text = r#"{"data":[{"index":1,"embedding":[0,1]},{"index":0,"embedding":[1,0]}]}"#;
    assert_eq!(
        parse_embeddings(text, 2, None).unwrap(),
        vec![vec![1.0, 0.0], vec![0.0, 1.0]]
    );
}

#[test]
fn every_malformed_answer_is_refused_whole() {
    let cases: [(&str, usize, Option<usize>, &str); 9] = [
        (r#"{"data":[{"embedding":[NaN,1]}]}"#, 1, None, "not-json"),
        (
            r#"{"data":[{"embedding":[1e39,1]}]}"#,
            1,
            None,
            "not-finite",
        ),
        (
            r#"{"data":[{"embedding":[-1e39,1]}]}"#,
            1,
            None,
            "not-finite",
        ),
        (
            r#"{"data":[{"embedding":[1,2]},{"embedding":[1,2,3]}]}"#,
            2,
            None,
            "dimension",
        ),
        (r#"{"data":[{"embedding":[1,2]}]}"#, 1, Some(3), "dimension"),
        (r#"{"data":[{"embedding":[]}]}"#, 1, None, "dimension"),
        (r#"{"data":[{"embedding":[1,2]}]}"#, 2, None, "count"),
        (
            r#"{"data":[{"index":0,"embedding":[1]},{"index":0,"embedding":[2]}]}"#,
            2,
            None,
            "index",
        ),
        (
            r#"{"data":[{"index":5,"embedding":[1]}]}"#,
            1,
            None,
            "index",
        ),
    ];
    for (text, count, dims, reason) in cases {
        assert_eq!(
            parse_embeddings(text, count, dims),
            Err(EmbedError::ResponseInvalid(reason)),
            "{text}"
        );
    }
}
