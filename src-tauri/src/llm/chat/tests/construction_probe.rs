use super::*;

#[test]
#[ignore = "requires explicit scratch paths and a running local model"]
fn background_production_path() {
    let input = std::env::var("ATLAS_CONSTRUCTION_PROBE_INPUT").expect("scratch input required");
    let output = std::env::var("ATLAS_CONSTRUCTION_PROBE_OUTPUT").expect("scratch output required");
    let args: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(input).unwrap()).unwrap();
    let string = |key: &str| args[key].as_str().expect(key).to_string();
    let result: Result<serde_json::Value, String> = (|| match string("action").as_str() {
        "preview" | "read" => {
            let source = PathBuf::from(string("sourcePath"));
            let destination = PathBuf::from(string("destinationPath"));
            let _grants =
                crate::vault_grants::EnforcedScope::granting(std::slice::from_ref(&destination));
            crate::vault_grants::grant_source_root(&source);
            if args["action"] == "preview" {
                serde_json::to_value(
                    crate::local_construction::preview_local_construction_source(
                        string("sourcePath"),
                        string("destinationPath"),
                    )?,
                )
                .map_err(|e| e.to_string())
            } else {
                serde_json::to_value(crate::local_construction::read_local_construction_source(
                    string("sourcePath"),
                    string("destinationPath"),
                    string("fingerprint"),
                    string("path"),
                    args["startLine"].as_u64().unwrap() as usize,
                )?)
                .map_err(|e| e.to_string())
            }
        }
        "chat" => {
            let (_sender, mut receiver) = tokio::sync::oneshot::channel();
            let scope: AuditScopeInput =
                serde_json::from_value(args["scope"].clone()).map_err(|e| e.to_string())?;
            let echo = chat_with(
                LOCAL_PROVIDER,
                Path::new(&string("destinationPath")),
                &string("model"),
                Some(&string("question")),
                &Target::Address {
                    base_url: &string("baseUrl"),
                },
                &string("body"),
                scope,
                |request| {
                    send_chat_with_policy(request, local_chat_timeout(true), &mut receiver, true)
                },
            )?;
            serde_json::to_value(echo).map_err(|e| e.to_string())
        }
        _ => Err("unknown probe action".into()),
    })();
    fs::write(output, serde_json::to_vec(&result).unwrap()).unwrap();
}
