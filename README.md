# BEAR: Biostatistical Education Assistant and Resource

BEAR is an AI teaching assistant for biostatistics. It guides students with Socratic questions instead of handing out answers. It grounds its hints in the course readings, and can draw simple illustrative plots.

<img src="public/bear-128.png" alt="BEAR" width="40" align="absmiddle"> **Try it:** https://bear.yaolab.workers.dev

It runs entirely on free services:

| Piece | Service |
|---|---|
| Chat page and backend | Cloudflare Workers (free plan) |
| Course-materials search | Cloudflare Vectorize + Workers AI embeddings |
| AI models | A pool of free models behind a router: Google Gemini (with code execution for plots), Groq, and Workers AI as a last resort |
| Code, setup and automation | This GitHub repo + GitHub Actions |

## How it works

1. A student opens the link and asks a question. No sign-in or code is needed.
2. The Worker searches the course materials for the most relevant passages.
3. The router picks the model with the most spare free-tier capacity right now and sends it the BEAR instructions, the passages and the conversation. If that model is rate-limited, failing or too slow, it moves on to the next one.
4. The student sees the reply, any plot, and links to the readings. Generated code is never shown.

## Repository layout

| Path | What it is |
|---|---|
| `instructions/bear_instructions.md` | BEAR's rules (the system prompt). Edit this to change its behavior. |
| `public/` | The chat page |
| `worker/src/index.js` | The backend |
| `worker/src/models.js` | The pool of models, with their free-tier limits. Edit this to add, remove or reweight models. |
| `worker/src/router.js`, `usage.js`, `providers.js` | The model router, its usage and health tracking, and the calls to each provider |
| `wrangler.toml` | Cloudflare settings |
| `corpus/` | Textbook passages and the list of web readings ([sources and licenses](corpus/SOURCES.md)) |
| `scripts/` | Textbook extraction and index building |
| `tests/` | Guardrail test prompts and the latest results (`tests/results.md`) |
| `ops/` | Deploy script and the logs of the latest runs |

## Setup (one time)

Add these under **Settings → Secrets and variables → Actions → Repository secrets**:

| Secret | Value |
|---|---|
| `GEMINI_API_KEY` | API key from https://aistudio.google.com |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token ("Edit Cloudflare Workers" template plus Vectorize: Edit and Workers AI: Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `GROQ_API_KEY` (optional) | API key from https://console.groq.com/keys. Adds two Groq models to the pool. |

Then run these from the **Actions** tab (**Run workflow**):

1. **Build course index**: loads the readings into the search index (about 5–10 minutes).
2. **Deploy BEAR**: publishes the site. The address is shown in the run summary, e.g. `https://bear.<your-subdomain>.workers.dev`.
3. **Guardrail tests** (optional): asks BEAR 25 tricky questions and saves the answers to `tests/results.md`.

## Everyday changes

- **Change BEAR's behavior:** edit `instructions/bear_instructions.md`. The site redeploys automatically.
- **Add a web reading:** add it to `corpus/web_sources.json`. The index rebuilds automatically.
- **Change the models:** edit `worker/src/models.js`. Models whose API key isn't set are left out automatically.
- **See how the models are doing:** open `/api/router-status` on the site. It shows each model's use this minute and today, its spare capacity, any cooldown, and its last error.
