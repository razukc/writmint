# No manifest by design

This pass (06b) deliberately wrote a manifest violating 5 hardening rules to measure the deny payload. The gate did its job — the file was refused at the hook and never landed on disk. See `../multi-fail-test/FINDINGS.md` for the full pass 06 + 06b writeup.

The empty directory is preserved as evidence that the harness gate refused the write. If a manifest existed here, the gate would have failed.
