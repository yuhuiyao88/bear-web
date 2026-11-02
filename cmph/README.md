# SPARK

**Smart Platform for Academic Research and Knowledge-sharing** is a CMPH faculty and invited-collaborator prototype. It uses Cloudflare Workers, SQLite-backed Durable Objects, Vectorize, Workers AI embeddings, and Gemini. All runtime services and scheduled research run remotely. Nothing needs to run on a faculty member’s computer beyond their browser.

## What is implemented

- An adaptive research interview and editable brief, followed by NIH and collaborator recommendations.
- NIH-wide Grants.gov collection with institute participation/mention fields and per-institute coverage. Selected institutes narrow stored candidates; unknown participation remains discoverable. Bounded live searches and official record retrieval supplement monthly snapshots.
- An independent monthly faculty update from the official CMPH roster/bios, departmental resources and recent PubMed publication leads. Names alone are not treated as confirmed authorship.
- **Knowledge & needs**: members explicitly publish offers, resources or requests. Search, edit, close, expiry and delete are supported. Only open, unexpired, explicitly opted-in posts enter recommendation requests. Changes are available immediately.
- Member-supplied Google Scholar profile links and CSV exports (up to 50 titles/authors/years per post). Imported publication topics participate in matching when that post opts in. No Scholar scraping or automatic Scholar refresh is claimed. Automated PubMed discovery is separate.
- Recommendations combine biographies, publication leads, and shared needs/offers, with source types distinguished. Shared matches link to member-provided resources; faculty matches link to supplied evidence. IDs outside retrieved evidence are discarded.
- Atomic public-corpus publication. Failed collection does not replace the active snapshot. Vector errors are reported and keyword retrieval remains usable. Community posts use live keyword retrieval separately from public vectors.

## Access and privacy

The pilot uses a shared invitation code, not university SSO or verified individual accounts. Names on the board are explicitly **self-reported**. Publishing returns a random per-post edit key; only its SHA-256 hash is stored remotely. Save the key to manage the post in a later session. Other invited members cannot edit it with the shared login alone. The curator can remove a post through the administrator endpoint. A key is a bearer credential: do not share it with other members.

Conversations and briefs stay in tab memory and are not persisted on the server. Gemini receives interview/recommendation requests. Cloudflare embeds retrieval queries. Posts persist in the private application store and are visible to every invited member. Relevant opted-in post excerpts and imported publication metadata are sent to Gemini during matching. Opting out excludes future matching requests; it cannot recall information already displayed or processed. Research briefs are never automatically posted. Use nonconfidential material during this pilot.

No emails, notifications, grant applications or outreach messages are sent. Publication metadata cannot prove a person’s contribution to a paper, resource ownership or availability. Collaboration commitments and resource access need confirmation.

## Fully remote deployment

The two templates under `deploy/` belong in the existing repository’s `.github/workflows/`. They add a separate Worker **cmph-spark**, separate catalog, separate vector index **cmph-spark-public** and separate workflow concurrency groups. They do not modify BEAR’s Worker or its deployment paths.

Existing repository secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `GEMINI_API_KEY`. SPARK-only secrets: `CMPH_ACCESS_CODE`, `CMPH_ADMIN_TOKEN`. The Cloudflare token needs permissions for the separate Worker, Durable Objects, Workers AI and Vectorize. Secrets are piped directly from the hosted runner into Worker secrets; do not run `scripts/secrets.mjs` to a terminal or artifact.

The deployment workflow compiles and tests, deploys, configures secrets and checks the hosted page, invitation gate and a real Gemini interview. The research workflow is dispatched once for initialization. Subsequently NIH research is scheduled on the first day of each month at 08:00 UTC and faculty research on the second day at 08:00 UTC. GitHub can delay scheduled execution. Both jobs may also be run manually and fail independently.

No local web server, tunnel, connector or desktop automation is used. `npm test`, `npm run check` and `npm run build` are offline unit/syntax/build checks; the last command is a deploy dry run. Browser visual inspection is not included in validation unless the owner separately authorizes it.

## Evidence limitations and operational boundaries

The current directory is seeded from 12 official faculty entries and checked against the live roster. New hires require curator addition to `data/faculty.json`; unverified author identifiers are not fabricated. Bios are a starting point, not validated CVs. OpenAlex identifiers/API integration and verified Scholar identity mapping are not configured.

Funding recommendations are candidates, **not certified eligibility decisions**. Full announcement retrieval may fail or be truncated, and the interface shows this. The on-demand Worker does not parse PDFs; it may rely on the dated document from the remote collector. Next application deadlines are not inferred from Grants.gov closing dates. Official full announcements, linked notices and institute-specific conditions still need review. Institute counts separate participation-section extraction from synopsis mentions; they are not complete issuing-versus-participating classifications. Monthly NIH notices are contextual feed/page snapshots, not an exhaustive linked-notice interpretation engine.

The live check is bounded: question keywords plus at most three selected institute codes, up to twelve search hits and three new details per query, plus five stored candidates rechecked. NIH failures stay visible. A newly published call can still be missed. No numeric funding-success probabilities are generated.

The small pilot board holds up to 100 posts. Rate limits are per session and invitation-IP for login, not per verified person. The prototype does not provide named-account revocation, institutional SSO, confidential multiuser workspaces, backups/retention administration, full audit history, or notifications. Old public snapshots are retained; a production cleanup policy is future work.

## Curator removal

`POST /api/admin/board-delete` accepts `{ "id": "post-…" }` with `Authorization: Bearer <CMPH_ADMIN_TOKEN>`. Keep that token out of browser code and public logs. Routine authors manage their own posts through the board using their private edit key.
