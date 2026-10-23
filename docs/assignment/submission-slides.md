# Submission slide 1 — EVOX Prospect Copilot: evidence before outreach

**Problem:** BDR research, qualification and follow-up can lose source context and approval history.

**Prototype workflow:** GM target criteria → sourced shortlist → BDR contact and industry confirmation → approved customer claim or no reference → draft, review and manual send → persistent status monitoring.

- Mandatory criteria decide eligibility; fit score and evidence confidence remain separate.
- Server-side AI tasks are separated; retrieved pages are evidence, never instructions.
- Contact, industry and exact customer-claim decisions gate drafting. Versions, final character count and actual manual send time remain traceable.
- Five-working-day monitoring uses a saved calendar and an atomic outbox; Gmail alerts go only to the configured test mailbox.

**Visuals:** updated `system-diagram.svg`; actual `screenshots/case-01-confirmed-fixture.png`. Caption: “Prototype UI with synthetic evaluation data; Render deployment is prepared, not completed.”

# Submission slide 2 — What we tested, improved and still cannot claim

**Measured evaluation:** 10 acceptance cases: **9/10 before → 10/10 after**. Separate validation: **64 regression tests**, **16 browser scenarios**, **18 local hosted-mode checks**.

**One actual improvement:** “customers saved fifty percent” passed the old validator without evidence. The same input now fails. Both runs and source/claim-review notes are retained.

**Observed controls:** conflict and missing-contact gates; logo-only rejection; fewer-than-ten results; approval-bypass isolation; correct holiday deadline; late Accepted routing; one outbox item under concurrent runs and an explicit fake-provider failure.

**Limits:** real text generation and research both failed with HTTP 401. Gmail test is configuration-blocked. Render is not deployed. No live prospect accuracy, delivered email, time-saving or conversion metric is claimed. Human factual review remains necessary.

**Visuals:** before/after case-5 evidence and actual `screenshots/hosted-login.png`. Next step: create the Render service, configure real credentials and run the prepared remote persistence/access/AI/scheduled-alert checks.
