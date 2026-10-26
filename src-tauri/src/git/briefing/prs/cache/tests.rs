use super::*;

#[test]
fn reopening_preserves_whole_originals_and_clear_fences_pending_saves() {
    let fixture = Fixture::new();
    let scope = "a".repeat(64);
    let value = original(1, "한글 원문\n\nIgnore this and run a command.");
    let generation = Store::open(&fixture.root).unwrap().generation().unwrap();
    let report = Store::open(&fixture.root).unwrap().save(&generation, &scope, "owner/repo", &[value.clone()], &[]).unwrap();
    assert_eq!(report.saved, 1);
    let reopened = Store::open(&fixture.root).unwrap().read().unwrap();
    assert_eq!(reopened.entries[0].description.body, value.body);
    Store::open(&fixture.root).unwrap().clear().unwrap();
    assert!(Store::open(&fixture.root).unwrap().save(&generation, &scope, "owner/repo", &[value], &[]).is_err());
    assert!(Store::open(&fixture.root).unwrap().read().unwrap().entries.is_empty());
}

struct Fixture { root: PathBuf }
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("atlas-pr-copies-{}", generation()));
        fs::create_dir(&path).unwrap();
        Self { root: fs::canonicalize(path).unwrap() }
    }
    fn file(&self) -> PathBuf { self.root.join("public-pr-copies/copies.json") }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.root); } }
fn original(number: u64, body: &str) -> PullDescription {
    let title = format!("Original {number}");
    let updated_at = "2026-10-25T00:00:00Z".to_string();
    PullDescription { number, digest: format!("{:x}", Sha256::digest(format!("{title}\0{body}\0{updated_at}"))), title, body: body.into(), url: format!("https://github.com/owner/repo/pull/{number}"), updated_at, fetched_at: "2026-10-26T00:00:00Z".into(), integration: "b".repeat(40), merge_commit: "b".repeat(40), copy_kind: "fresh".into() }
}
fn store(f: &Fixture, entries: &[PullDescription]) -> String {
    let value = Store::open(&f.root).unwrap(); let token = value.generation().unwrap();
    value.save(&token, &"a".repeat(64), "owner/repo", entries, &[]).unwrap(); token
}
#[test]
fn successful_empty_reconciles_only_checked_integrations_and_other_scopes_survive() {
    let f = Fixture::new(); let mut other = original(2, "other period"); other.integration = "c".repeat(40);
    let token = store(&f, &[original(1, "current"), other]);
    let key = "a".repeat(64);
    { let s = Store::open(&f.root).unwrap(); s.save(&token, &"d".repeat(64), "owner/repo", &[original(3,"another folder")], &[]).unwrap(); }
    { let s = Store::open(&f.root).unwrap(); s.save(&token, &key, "owner/repo", &[], &["b".repeat(40)]).unwrap(); }
    let value = Store::open(&f.root).unwrap().read().unwrap();
    assert_eq!(value.entries.len(), 2);
    assert!(!value.entries.iter().any(|e| e.scope == key && e.description.number == 1));
    assert!(value.entries.iter().any(|e| e.description.number == 2));
    assert!(value.entries.iter().any(|e| e.scope == "d".repeat(64)));
}
#[test]
fn bounded_store_evicts_old_reads_keeps_whole_entries_and_rejects_excess_deserialization() {
    let f = Fixture::new();
    let entries: Vec<_> = (1..=401).map(|n| { let mut value = original(n,"원문"); value.fetched_at = chrono::DateTime::from_timestamp(1_790_000_000 + n as i64,0).unwrap().to_rfc3339(); value }).collect();
    let s = Store::open(&f.root).unwrap(); let token = s.generation().unwrap();
    let report = s.save(&token,&"a".repeat(64),"owner/repo",&entries,&[]).unwrap();
    assert_eq!(report.saved, 400); assert_eq!(report.unsaved,1); assert_eq!(report.evicted,1);
    let value = s.read().unwrap(); assert_eq!(value.entries.len(),400); assert!(!value.entries.iter().any(|e|e.description.number==1));
    assert!(fs::metadata(f.file()).unwrap().len() <= STORE_BYTES as u64);
    let entry = serde_json::to_string(&value.entries[0]).unwrap();
    let hostile = format!("{{\"version\":1,\"generation\":\"x\",\"entries\":[{}]}}",vec![entry;401].join(","));
    assert!(serde_json::from_str::<Envelope>(&hostile).is_err());
    drop(s);
    let s = Store::open(&f.root).unwrap();
    let large = original(900,&"x".repeat(ENTRY_BYTES));
    let report = s.save(&token,&"a".repeat(64),"owner/repo",&[large],&[]).unwrap(); assert_eq!(report.unsaved,1); assert_eq!(report.saved,0);
}
#[test]
fn byte_budget_and_entry_boundary_are_exact_without_truncation() {
    let f = Fixture::new(); let mut pr = original(1, "");
    let entry = |pr: PullDescription| Entry { scope:"a".repeat(64),repository:"owner/repo".into(),merge:pr.merge_commit.clone(),description:pr };
    let overhead = serde_json::to_vec(&entry(pr.clone())).unwrap().len();
    pr = original(1,&"x".repeat(ENTRY_BYTES-overhead));
    assert_eq!(serde_json::to_vec(&entry(pr.clone())).unwrap().len(),ENTRY_BYTES);
    assert!(valid(&entry(pr.clone())));
    let too_big = original(1,&format!("{}x",pr.body)); assert!(!valid(&entry(too_big)));
    let entries: Vec<_> = (1..=40).map(|n|original(n,&"x".repeat(500_000))).collect();
    let s = Store::open(&f.root).unwrap(); let token = s.generation().unwrap();
    let report = s.save(&token,&"a".repeat(64),"owner/repo",&entries,&[]).unwrap();
    assert!(report.evicted > 0); assert!(report.saved > 0);
    let bytes = fs::read(f.file()).unwrap(); assert!(bytes.len()<=STORE_BYTES);
    let value: Envelope = serde_json::from_slice(&bytes).unwrap(); assert!(value.entries.iter().all(|e|e.description.body.len()==500_000));
}
#[test]
fn links_special_files_corruption_and_nonprivate_files_fail_closed() {
    use std::os::unix::fs::{symlink,PermissionsExt};
    for kind in ["symlink","fifo","oversize","corrupt","permissions","hardlink"] {
        let f=Fixture::new(); store(&f,&[original(1,"safe")]);
        fs::remove_file(f.file()).unwrap();
        let outside=f.root.join("outside"); fs::write(&outside,"untouched").unwrap();
        match kind {
            "symlink"=>symlink(&outside,f.file()).unwrap(),
            "hardlink"=>fs::hard_link(&outside,f.file()).unwrap(),
            "fifo"=> { let path=std::ffi::CString::new(f.file().as_os_str().as_encoded_bytes()).unwrap(); assert_eq!(unsafe{libc::mkfifo(path.as_ptr(),0o600)},0); },
            "oversize"=>{let file=fs::File::create(f.file()).unwrap();file.set_permissions(fs::Permissions::from_mode(0o600)).unwrap();file.set_len((STORE_BYTES+1)as u64).unwrap();},
            _=>{fs::write(f.file(),"not JSON").unwrap();fs::set_permissions(f.file(),fs::Permissions::from_mode(if kind=="permissions"{0o644}else{0o600})).unwrap();}
        }
        let s=Store::open(&f.root).unwrap(); assert!(s.read().is_err(),"{kind}");
        if matches!(kind,"symlink"|"fifo"|"permissions"|"hardlink"){assert!(s.clear().is_err(),"{kind}");}else{s.clear().unwrap();assert!(s.read().unwrap().entries.is_empty());}
        assert_eq!(fs::read_to_string(outside).unwrap(),"untouched");
    }
    let f=Fixture::new();let outside=f.root.join("other");fs::create_dir(&outside).unwrap();symlink(outside,f.root.join("public-pr-copies")).unwrap();assert!(Store::open(&f.root).is_err());
}
#[test]
fn clear_generation_survives_reopen_and_serializes_an_independent_process() {
    use std::os::unix::fs::PermissionsExt;
    let f=Fixture::new();let token=store(&f,&[original(1,"before")]);
    let lock=Store::open(&f.root).unwrap();
    let mut child=std::process::Command::new("/usr/bin/python3").args(["-c","import fcntl,sys; f=open(sys.argv[1],'r+');\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB); sys.exit(7)\nexcept BlockingIOError: sys.exit(0)"]).arg(f.root.join("public-pr-copies/lock")).spawn().unwrap();
    assert!(child.wait().unwrap().success());drop(lock);
    Store::open(&f.root).unwrap().clear().unwrap();
    let next=Store::open(&f.root).unwrap();assert_ne!(next.generation().unwrap(),token);assert!(next.save(&token,&"a".repeat(64),"owner/repo",&[original(2,"late")],&[]).is_err());
    assert_eq!(fs::metadata(f.file()).unwrap().permissions().mode()&0o777,0o600);
    let unrelated=f.root.join("transfer-record");fs::write(&unrelated,"keep").unwrap();next.clear().unwrap();assert_eq!(fs::read_to_string(unrelated).unwrap(),"keep");
}
#[test]
fn restore_rechecks_current_local_introduction_and_does_not_key_on_head() {
    let f=Fixture::new();let root=f.root.join("source");fs::create_dir(&root).unwrap();
    let git=|args:&[&str]|{let out=std::process::Command::new("git").args(args).current_dir(&root).output().unwrap();assert!(out.status.success(),"{:?}",args);String::from_utf8_lossy(&out.stdout).trim().to_string()};
    git(&["init","-q"]);git(&["-c","user.name=fixture","-c","user.email=fixture@example.invalid","-c","commit.gpgsign=false","commit","--allow-empty","-qm","first"]);let first=git(&["rev-parse","HEAD"]);
    git(&["-c","user.name=fixture","-c","user.email=fixture@example.invalid","-c","commit.gpgsign=false","commit","--allow-empty","-qm","second"]);let second=git(&["rev-parse","HEAD"]);
    let identity=Identity{scope:SourceScope::Picked,root:root.clone(),head:second.clone(),object:(1,2)};
    let mut pr=original(1,"author original");pr.integration=first.clone();pr.merge_commit=first.clone();let key=scope(&identity,"owner/repo");
    let s=Store::open(&f.root).unwrap();let token=s.generation().unwrap();s.save(&token,&key,"owner/repo",&[pr],&[]).unwrap();
    let commits=vec![BriefingCommit{hash:first.clone(),subject:"first".into(),message:"first".into(),message_complete:true,committed_at:"2026-10-25T00:00:00Z".into(),paths:vec![]}];
    let restored=restore(s.read().unwrap(),&identity,"owner/repo",&commits);let pulls=restored.pulls.unwrap();assert_eq!(pulls.descriptions.len(),1);assert_eq!(pulls.unchecked,1);assert_eq!(pulls.descriptions[0].copy_kind,"saved");
    let mut changed=identity.clone();changed.head=first;assert_eq!(key,scope(&changed,"owner/repo"));changed.object=(1,3);assert_ne!(key,scope(&changed,"owner/repo"));changed.root=f.root.clone();assert_ne!(key,scope(&changed,"owner/repo"));assert_ne!(key,scope(&identity,"other/repo"));
    let mut forged=s.read().unwrap();forged.entries[0].merge=second;assert_eq!(restore(forged,&identity,"owner/repo",&commits).ignored,1);
    let mut corrupt=s.read().unwrap();corrupt.entries[0].description.body="modified".into();assert_eq!(restore(corrupt,&identity,"owner/repo",&commits).ignored,1);
    assert!(restore(s.read().unwrap(),&identity,"owner/repo",&[]).pulls.unwrap().descriptions.is_empty());
}

#[test]
fn interrupted_replacement_preserves_last_complete_copy_and_reclaims_owned_temporary_only() {
    use std::os::unix::fs::{PermissionsExt,symlink};
    let f=Fixture::new();store(&f,&[original(1,"last complete")]);
    let directory=crate::agent_setup::open_absolute_directory_no_follow(&f.root.join("public-pr-copies")).unwrap();
    let failed=crate::agent_setup::write_entry_atomically_with(&directory,c"copies.json",0o600,|file|{use std::io::Write;file.write_all(b"incomplete")?;Err::<(),_>(std::io::Error::other("planted disk failure"))});
    assert!(failed.is_err());
    let orphan=f.root.join("public-pr-copies/.copies.json.oatlas-tmp-interrupted");fs::write(&orphan,"incomplete").unwrap();fs::set_permissions(&orphan,fs::Permissions::from_mode(0o600)).unwrap();
    let unrelated=f.root.join("public-pr-copies/user-note");fs::write(&unrelated,"keep").unwrap();
    let s=Store::open(&f.root).unwrap();assert!(!orphan.exists());assert_eq!(s.read().unwrap().entries[0].description.body,"last complete");assert_eq!(fs::read_to_string(&unrelated).unwrap(),"keep");drop(s);
    symlink(&unrelated,&orphan).unwrap();assert!(Store::open(&f.root).is_err());assert_eq!(fs::read_to_string(unrelated).unwrap(),"keep");
}

#[test]
fn failed_refresh_preserves_prior_copies_but_a_first_partial_read_can_save_accepted_positives() {
    let f=Fixture::new();let identity=Identity{scope:SourceScope::Picked,root:f.root.clone(),head:"c".repeat(40),object:(1,2)};
    let scope=scope(&identity,"owner/repo");let generation={let s=Store::open(&f.root).unwrap();let token=s.generation().unwrap();s.save(&token,&scope,"owner/repo",&[original(1,"prior")],&[]).unwrap();token};
    let ticket=Ok((f.root.clone(),generation));
    let result=PullDescriptions{status:"partial".into(),repository:"owner/repo".into(),descriptions:vec![original(2,"accepted before failure")],unchecked:1,unchecked_commits:vec!["b".repeat(40)],unlinked:0,failure:Some(PullLookupFailure{kind:"unavailable",retry_at:None}),saved:None};
    assert_eq!(save(&ticket,&identity,&result,&[],&AtomicBool::new(false),true).saved,0);
    assert_eq!(Store::open(&f.root).unwrap().read().unwrap().entries.len(),1);
    assert_eq!(save(&ticket,&identity,&result,&[],&AtomicBool::new(false),false).saved,1);
    assert_eq!(Store::open(&f.root).unwrap().read().unwrap().entries.len(),2);
    assert_eq!(save(&ticket,&identity,&result,&[],&AtomicBool::new(true),false).saved,0);
    assert_eq!(Store::open(&f.root).unwrap().read().unwrap().entries.len(),2);
}

#[test]
fn later_refresh_fences_older_versions_and_prevents_resurrection_after_measured_empty() {
    let f=Fixture::new();let key="a".repeat(64);
    let a=Store::open(&f.root).unwrap().begin_read().unwrap();
    let b=Store::open(&f.root).unwrap().begin_read().unwrap();
    Store::open(&f.root).unwrap().save(&b,&key,"owner/repo",&[original(1,"newer")],&[]).unwrap();
    assert!(Store::open(&f.root).unwrap().save(&a,&key,"owner/repo",&[original(1,"older")],&[]).is_err());
    assert_eq!(Store::open(&f.root).unwrap().read().unwrap().entries[0].description.body,"newer");
    let c=Store::open(&f.root).unwrap().begin_read().unwrap();
    Store::open(&f.root).unwrap().save(&c,&key,"owner/repo",&[],&["b".repeat(40)]).unwrap();
    assert!(Store::open(&f.root).unwrap().save(&b,&key,"owner/repo",&[original(1,"late positive")],&[]).is_err());
    assert!(Store::open(&f.root).unwrap().read().unwrap().entries.is_empty());
}
#[test]
fn cancellation_during_lock_wait_and_at_atomic_publication_keeps_prior_originals() {
    use std::sync::atomic::AtomicBool;
    let f=Fixture::new();let token=store(&f,&[original(1,"prior")]);
    let held=Store::open(&f.root).unwrap();let cancelled=Arc::new(AtomicBool::new(false));let worker_cancelled=cancelled.clone();let root=f.root.clone();
    let (send,receive)=std::sync::mpsc::channel();
    let worker=std::thread::spawn(move||{confined::WAIT_NOTICE.with(|notice|*notice.borrow_mut()=Some(send));Store::open(&root).unwrap().save_cancellable(&token,&"a".repeat(64),"owner/repo",&[],&["b".repeat(40)],&worker_cancelled)});
    receive.recv().unwrap();cancelled.store(true,Ordering::Release);drop(held);assert!(worker.join().unwrap().is_err());
    assert_eq!(Store::open(&f.root).unwrap().read().unwrap().entries[0].description.body,"prior");
    let directory=crate::agent_setup::open_absolute_directory_no_follow(&f.root.join("public-pr-copies")).unwrap();
    let failed=crate::agent_setup::write_entry_atomically_with_guard(&directory,c"copies.json",0o600,|file|{use std::io::Write;file.write_all(b"new but cancelled")},||Err(std::io::Error::new(std::io::ErrorKind::Interrupted,"cancelled before publication")));
    assert!(failed.is_err());assert_eq!(Store::open(&f.root).unwrap().read().unwrap().entries[0].description.body,"prior");
}
#[test]
fn restore_limits_count_and_the_whole_serialized_reply_at_the_exact_byte_boundary() {
    let f=Fixture::new();let root=f.root.join("source");fs::create_dir(&root).unwrap();
    let git=|args:&[&str]|{let out=std::process::Command::new("git").args(args).current_dir(&root).output().unwrap();assert!(out.status.success());String::from_utf8_lossy(&out.stdout).trim().to_string()};
    git(&["init","-q"]);git(&["-c","user.name=fixture","-c","user.email=fixture@example.invalid","-c","commit.gpgsign=false","commit","--allow-empty","-qm","first"]);let first=git(&["rev-parse","HEAD"]);
    let identity=Identity{scope:SourceScope::Picked,root,head:first.clone(),object:(1,2)};
    let commits=vec![BriefingCommit{hash:first.clone(),subject:"first".into(),message:"first".into(),message_complete:true,committed_at:"2026-10-25T00:00:00Z".into(),paths:vec![]}];
    let entry=|number,body:&str|{let mut pr=original(number,body);pr.merge_commit=first.clone();pr.integration=first.clone();Entry{scope:scope(&identity,"owner/repo"),repository:"owner/repo".into(),merge:first.clone(),description:pr}};
    let envelope=|entries|Envelope{version:1,generation:"test".into(),entries};
    let forty=restore(envelope((1..=41).map(|n|entry(n,"complete")).collect()),&identity,"owner/repo",&commits);
    assert_eq!(forty.pulls.as_ref().unwrap().descriptions.len(),40);assert_eq!(forty.omitted,1);assert_eq!(forty.pulls.unwrap().unchecked,1);
    let bytes_for=|last:usize|{let entries=(1..=5).map(|n|entry(n,&"x".repeat(if n==5{last}else{400_000}))).collect();restore(envelope(entries),&identity,"owner/repo",&commits)};
    let base=serde_json::to_vec(&bytes_for(0)).unwrap().len();let last=PR_BYTES-base;assert!(last<500_000);
    let exact=bytes_for(last);assert_eq!(exact.pulls.as_ref().unwrap().descriptions.len(),5);assert_eq!(exact.omitted,0);assert_eq!(serde_json::to_vec(&exact).unwrap().len(),PR_BYTES);
    let over=bytes_for(last+1);assert_eq!(over.pulls.as_ref().unwrap().descriptions.len(),4);assert_eq!(over.omitted,1);assert!(serde_json::to_vec(&over).unwrap().len()<PR_BYTES);
}
