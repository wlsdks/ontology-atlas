//! The write checkpoint: before a write touches disk the server asks the client to put a question
//! to a person (`elicitation/create`), refuses when the client cannot, and answers a read call
//! while a question is open. It belongs to the safety family; the session already lets a call wait
//! off the queue (`Session::wait_off_queue`) and keeps the client's announced capabilities
//! (`Session::client_capabilities`).
