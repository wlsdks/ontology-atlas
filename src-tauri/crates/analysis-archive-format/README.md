# analysis-archive-format

What the app that writes the analysis records and the server that reads them must agree on, written
once: the folder the records are kept in, the most bytes a record file may hold, and the name of a
record file. It opens no file. The app (`src-tauri/src/analysis_archive.rs`) and `mcp-server`
(`src/analysis_records/`) both link it; the TypeScript twin in `mcp/src/analysis-history/` cannot,
so a test here holds its folder and byte limit equal to these.

| File | What it gives |
|---|---|
| `src/archive_place.rs` | `ARCHIVE_DIRECTORY` (from the vault), `ARCHIVE_FOLDER` (below `.ontology-atlas`), `MAX_RECORD_BYTES` |
| `src/record_file_name.rs` | `record_file_name`, `is_record_file_name`, `is_record_of`, `is_uuid_v4`: the moment-and-id name a record is kept under, and what finds one by its id |
