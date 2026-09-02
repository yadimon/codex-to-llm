# Vision release verification

Verified against the repository on 2026-08-28.

- Image support spans core normalization, CLI `--image`, nested Responses `input_image`, and both core/server smoke scripts. Test local paths, HTTPS URLs, and data URLs without weakening MIME/signature, size/count, temporary-file, or SSRF protections.
- Preserve Windows command resolution order. Prefer the first usable candidate in PATH order; do not blindly replace a working shim with a WindowsApps executable.
- Use an embedded, visually unambiguous image for deterministic smoke tests. External image hosts are useful only as an additional network-path check.
- A release is not proven by local tests alone. Run the repository's `check`, `release:check`, and vision smoke lanes, then verify clean-installed published core and server artifacts with the current `smoke:published-vision:*` scripts.
- Audit executable mode bits on shebang fixtures before a Linux CI/tag release.
- CLI versions, npm versions, tags, CI runs, and published package versions are volatile; obtain them from the current CLI, registry, Git, and workflow rather than this document.

