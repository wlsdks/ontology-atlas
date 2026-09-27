---
id: 09f0e1ac-4908-47d9-a9be-4f8615fcb048
date: 2026-09-27
category: Fixed
---
Reading a DOCX or XLSX source in the browser stops at the size each entry of its archive declares, and at 256 MiB when an entry declares none, so a crafted file can no longer exhaust the page's memory.
