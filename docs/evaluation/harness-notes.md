# Evaluation harness diagnoses

The acceptance artifacts include only runs that completed the ten cases. During preparation, these execution issues were encountered and corrected; none is disguised as a product pass:

- The first TypeScript runner used top-level await under the repository's CommonJS `tsx` mode. It was wrapped in an async main function.
- A synchronous child `git` invocation was denied in this environment. Revision metadata is now read from the repository ref file, with an explicit unavailable fallback. No acceptance result was saved from the aborted attempts.
- The initial remote-verifier import assumed a CommonJS package had a native ESM named export. It now uses the package's default export. The corrected verifier records missing deployment configuration, not a successful remote call.
- Chromium's policy blocked a local `file://` slide URL. The renderer now serves only the assignment HTML/image directory on loopback HTTP and shuts the server down afterward. The successful render produced a verified two-page PDF.

Ignored `work/` logs retain the preparation traces. The committed regression and browser logs identify the final successful checks; the preserved acceptance before-run intentionally contains the actual case-5 product failure.

Committed text logs normalize terminal carriage returns and trailing whitespace for review; raw terminal files remain under ignored `work/`. This normalization does not alter test counts, statuses, diagnoses or the preserved before/after JSON.
