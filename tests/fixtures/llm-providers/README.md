# Vendor Response Fixtures

Locks three types of real vendor responses (text-only, tool calls, errors). The contract
is whether the adapter folds these shapes into the same `NormalizedResponse`. If vendor
formats change, update both fixtures and adapters in the **same PR**.

Response bodies are not logged to audit logs (only lengths), so what is here are format
examples readable from public documentation, not user data.
