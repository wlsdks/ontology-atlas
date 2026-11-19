// An answer is accepted whole or not at all: one finite vector per input, all of
// one length, matched by `index` when the runner sends it.

use super::{EmbedError, MAX_DIMENSIONS};
use serde::Deserialize;

#[derive(Deserialize)]
struct Body {
    data: Vec<Row>,
}

#[derive(Deserialize)]
struct Row {
    #[serde(default)]
    index: Option<usize>,
    embedding: Vec<f32>,
}

pub(super) fn parse_embeddings(
    text: &str,
    count: usize,
    expected_dimensions: Option<usize>,
) -> Result<Vec<Vec<f32>>, EmbedError> {
    // serde_json refuses `NaN` and `Infinity` tokens; a number beyond f32 becomes
    // infinite and is caught below.
    let body: Body =
        serde_json::from_str(text).map_err(|_| EmbedError::ResponseInvalid("not-json"))?;
    if body.data.len() != count {
        return Err(EmbedError::ResponseInvalid("count"));
    }
    let mut slots: Vec<Option<Vec<f32>>> = vec![None; count];
    for (position, row) in body.data.into_iter().enumerate() {
        let index = row.index.unwrap_or(position);
        let slot = slots
            .get_mut(index)
            .ok_or(EmbedError::ResponseInvalid("index"))?;
        if slot.is_some() {
            return Err(EmbedError::ResponseInvalid("index"));
        }
        *slot = Some(row.embedding);
    }
    let vectors: Vec<Vec<f32>> = slots.into_iter().flatten().collect();
    let dimensions = vectors
        .first()
        .map(Vec::len)
        .ok_or(EmbedError::ResponseInvalid("count"))?;
    if dimensions == 0
        || dimensions > MAX_DIMENSIONS
        || expected_dimensions.is_some_and(|expected| expected != dimensions)
        || vectors.iter().any(|vector| vector.len() != dimensions)
    {
        return Err(EmbedError::ResponseInvalid("dimension"));
    }
    if vectors.iter().flatten().any(|value| !value.is_finite()) {
        return Err(EmbedError::ResponseInvalid("not-finite"));
    }
    Ok(vectors)
}
