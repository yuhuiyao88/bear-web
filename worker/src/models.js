// The pool of free AI models BEAR can use. The router (router.js) sends each
// question to the model with the most spare capacity right now, and moves on
// to the next one if a model is rate-limited, down, or too slow.
//
// Each entry:
//   id        short name, shown in logs and at /api/router-status
//   provider  "gemini", "openai" (any OpenAI-compatible API) or "workers-ai"
//   model     the provider's model name
//   key       the Worker secret holding the API key. The model is skipped
//             when the secret isn't set, so you can add providers one by one.
//   plots     true if the model can run code to draw plots (only Gemini can)
//   weight    preference, 0 to 1. The router scores each model as
//             weight x (share of its tightest limit still unused).
//   limits    free-tier limits: rpm/rpd = requests per minute/day,
//             tpm/tpd = tokens per minute/day. Leave one out if there is none.
//   dayReset  time zone in which the daily limit resets
//
// The limits below are the free-tier figures we could confirm on
// 29 Oct 2026. Google no longer publishes Gemini's, so check
// https://aistudio.google.com/rate-limit and correct them here. If a number is
// too high, nothing breaks: the router learns from the 429 and backs off.

export const POOL = [
  {
    id: "gemini-flash-lite",
    provider: "gemini",
    model: "gemini-flash-lite-latest",
    key: "GEMINI_API_KEY",
    plots: true,
    weight: 1,
    limits: { rpm: 15, rpd: 1000 },
    dayReset: "America/Los_Angeles",
  },
  {
    // A separate model version, so Google counts it against its own quota.
    // (gemini-2.5-flash-lite is closed to new API keys.)
    id: "gemini-3.1-flash-lite",
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
    key: "GEMINI_API_KEY",
    plots: true,
    weight: 0.95,
    limits: { rpm: 10, rpd: 500 },
    dayReset: "America/Los_Angeles",
  },
  {
    // Bigger and slower (23-38 s per reply), with a tiny free daily quota.
    id: "gemini-flash",
    provider: "gemini",
    model: "gemini-flash-latest",
    key: "GEMINI_API_KEY",
    plots: true,
    weight: 0.9,
    limits: { rpm: 5, rpd: 20 },
    dayReset: "America/Los_Angeles",
  },
  {
    // Groq: https://console.groq.com/docs/rate-limits. 8,000 tokens per minute
    // is the real limit here: one BEAR request is about 5,000 tokens.
    id: "groq-gpt-oss-120b",
    provider: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    key: "GROQ_API_KEY",
    weight: 0.8,
    limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
    dayReset: "UTC",
    maxTokens: 2048,
    extra: { reasoning_effort: "low" },
  },
  {
    id: "groq-gpt-oss-20b",
    provider: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-20b",
    key: "GROQ_API_KEY",
    weight: 0.7,
    limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
    dayReset: "UTC",
    maxTokens: 2048,
    extra: { reasoning_effort: "low" },
  },
  {
    // Last resort. Needs no key, but it shares Cloudflare's 10,000 free
    // "neurons" a day with the course-materials search, and each BEAR reply
    // costs about 200 of them, so it's capped at 20 replies a day.
    id: "workers-ai-llama-4-scout",
    provider: "workers-ai",
    model: "@cf/meta/llama-4-scout-17b-16e-instruct",
    weight: 0.5,
    limits: { rpm: 10, rpd: 20 },
    dayReset: "UTC",
    maxTokens: 2048,
  },

  // Other free providers that work with provider "openai". They are left out
  // by default because their free tiers may use prompts for training:
  // {
  //   id: "mistral-small",  // turn off training in Mistral's admin console first
  //   provider: "openai",
  //   baseUrl: "https://api.mistral.ai/v1",
  //   model: "mistral-small-latest",
  //   key: "MISTRAL_API_KEY",
  //   weight: 0.7,
  //   limits: { rpm: 60 },  // see the Limits page in Mistral's admin console
  //   dayReset: "UTC",
  // },
];

// Added to BEAR's instructions for models that can't run code.
export const TEXT_ONLY_NOTE = `

IMPORTANT FOR THIS REPLY: the code execution tool is not available right now, so you cannot draw plots or run calculations. If a plot would help, describe in words what it would show and what the student should notice, and suggest they sketch it or make it in their course software. Never write code.`;
