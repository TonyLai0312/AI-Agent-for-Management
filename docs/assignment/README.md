# Assignment evidence pack

Prepared from actual execution on 23 October 2026. These files are supporting evidence, not a claim of completed cloud deployment or successful live providers.

| Deliverable | Files |
| --- | --- |
| Updated system diagram | [`system-diagram.mmd`](system-diagram.mmd), [`system-diagram.svg`](system-diagram.svg), [`system-diagram.png`](system-diagram.png) |
| Actual prototype screenshots | [`screenshots/`](screenshots/): labelled fixture cases, responsive mobile view and local account-mode login/BDR UI |
| Measured results with inputs/expected/actual outputs | [`../evaluation/README.md`](../evaluation/README.md), machine-readable records in [`../evaluation/evidence/`](../evaluation/evidence/) |
| Factual source review | [`../evaluation/factual-review.md`](../evaluation/factual-review.md) |
| Actual improvement cycle | [`../evaluation/improvement-cycle.md`](../evaluation/improvement-cycle.md), preserved case-5 before/after JSON |
| Two-minute demo script | [`demo-script.md`](demo-script.md) |
| Exactly two submission slides | [`submission-slides.md`](submission-slides.md) content, [`submission-slides.pdf`](submission-slides.pdf) (verified two pages), [`submission-slides.html`](submission-slides.html) editable layout, `slide-1.png` / `slide-2.png` previews |
| Compatible hosting setup and verification | [`../deploy-render.md`](../deploy-render.md), root `render.yaml` |

## Screenshot provenance

- `case-01-confirmed-fixture.png`: actual live-workflow panel exercised with the explicitly synthetic seeded company/contact and BDR confirmations. This does not establish a real prospect/contact.
- `case-02-industry-conflict.png`: fixture industry approval blocked until a reasoned resolution.
- `case-03-no-contact.png`: unresolved manual-search task, before manual contact entry.
- `case-04-logo-only.png`: logo-only evidence with claim approval blocked.
- `case-07-late-accepted.png`: actual fixture follow-up screen after late acceptance; no duplicate invitation.
- `market-overview.png`: actual market/fixture interface; no successful live research is implied.
- `mobile-contact.png`: actual 390px responsive fixture view.
- `hosted-login.png`, `hosted-bdr.png`: actual loopback hosted-account-mode preflight. These are not images of a deployed Render service.

Browser captures come from the application, not a generated design. The screen labels and captions intentionally distinguish fixture/demo data and locally tested hosted mode. The slides were rendered with Chromium and checked as exactly two PDF pages.

## What remains open

OpenAI: two real requests failed with HTTP 401. Gmail: configuration missing; no email sent. Render: no account/service yet; remote verification not run. The evidence package reports these limits explicitly. No real-prospect accuracy, delivered email, business saving or conversion percentage is invented. Qualitative source inspection does not replace final human BDR approval.
