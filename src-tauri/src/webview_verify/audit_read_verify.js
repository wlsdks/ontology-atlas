(() => {
  const rootPath = __ROOT_PATH__;
  window.__ontologyAtlasAuditReadVerify = { state: 'running' };
  void (async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const rows = [];
    for (const mode of ['whole', 'bounded']) {
      const start = performance.now();
      if (mode === 'whole') {
        let data = await invoke('read_vault_binary_file', { rootPath, relativePath: '.ontology-atlas/llm-audit.jsonl' });
        const bytes = new Uint8Array(data, 8);
        let lines = 0;
        for (const byte of bytes) if (byte === 10) lines++;
        rows.push({ mode, lines, bytes: data.byteLength - 8, maxResponse: data.byteLength, calls: 1, elapsedMs: performance.now() - start, raw: data instanceof ArrayBuffer });
        data = null;
      } else {
        const readerId = await invoke('audit_read_prepare');
        try {
          const begin = await invoke('audit_read_begin', { readerId, rootPath });
          let cursor = 0, maxResponse = 0, calls = 0, lines = 0;
          while (cursor < begin.size) {
            const data = await invoke('audit_read_pull', { readerId, cursor });
            if (!(data instanceof ArrayBuffer)) throw new Error('IPC did not return ArrayBuffer');
            const bytes = new Uint8Array(data);
            if (!bytes.length || bytes.length > 1048576) throw new Error('unbounded or empty response');
            for (const byte of bytes) if (byte === 10) lines++;
            cursor += bytes.length; maxResponse = Math.max(maxResponse, bytes.length); calls++;
          }
          await invoke('audit_read_finish', { readerId });
          rows.push({ mode, bytes: cursor, maxResponse, calls, lines, elapsedMs: performance.now() - start, raw: true });
        } finally { await invoke('audit_read_cancel', { readerId }); }
      }
    }
    window.__ontologyAtlasAuditReadVerify = { state: 'done', rows };
  })().catch(error => { window.__ontologyAtlasAuditReadVerify = { state: 'failed', reason: String(error) }; });
})()
