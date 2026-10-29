// BEAR backend: a Cloudflare Worker that
//  1. finds relevant passages in the course materials (Vectorize),
//  2. asks the free AI model with the most spare capacity (router.js), and
//  3. returns text + plot images (never the code) to the page.

import INSTRUCTIONS from "../../instructions/bear_instructions.md";
import { route, routerStatus } from "./router.js";

export { ModelUsage } from "./usage-do.js";

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const MAX_HISTORY = 12; // previous messages sent back to the model
const MAX_CHARS = 4000; // per message
const TOP_K = 6;
const MIN_SCORE = 0.55;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        return await chat(request, env);
      } catch (err) {
        console.error(err);
        return json({ error: "Something went wrong on BEAR's side. Please try again in a minute." }, 500);
      }
    }
    if (url.pathname === "/api/router-status" && request.method === "GET") {
      return json(await routerStatus(env));
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function chat(request, env) {
  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return json({ error: "Please type a question." }, 400);
  }

  // 1. Retrieve course excerpts for the latest question (with the previous question as context).
  const userTurns = clean.filter((m) => m.role === "user").map((m) => m.text);
  const query = userTurns.slice(-2).join("\n");
  const excerpts = await retrieve(env, query);

  // 2. Build the model request. Excerpts are attached to the latest user turn only.
  const excerptText = excerpts.length
    ? excerpts
        .map((e, i) => `[${i + 1}] ${e.source} | ${e.section}${e.page ? ` | PDF p. ${e.page}` : ""}\n${e.text}`)
        .join("\n\n")
    : "(No closely matching excerpts were found.)";
  const contents = clean.map((m, i) => {
    const isLast = i === clean.length - 1;
    const text = isLast
      ? `COURSE EXCERPTS (for your reference, not written by the student):\n${excerptText}\n\nSTUDENT QUESTION:\n${m.text}`
      : m.text;
    return { role: m.role, parts: [{ text }] };
  });

  const reply = await route(env, { system: INSTRUCTIONS, contents });
  if (!reply.ok) {
    if (reply.reason === "rate") {
      return json({ error: "BEAR has reached its free usage limit for now. Please try again later (limits reset daily)." }, 429);
    }
    if (reply.reason === "timeout") {
      return json({ error: "BEAR is taking too long right now (the free AI service is busy). Please try again in a minute." }, 504);
    }
    return json({ error: "BEAR couldn't reach its AI model. Please try again in a minute." }, 502);
  }

  const images = reply.images;
  let text = stripCodeBlocks(reply.text).trim();
  if (!text && !images.length) {
    text = "I wasn't able to answer that one. Could you rephrase your question?";
  }

  const sources = dedupeSources(excerpts);
  return json({ text, images, sources, model: reply.model });
}

async function retrieve(env, query) {
  try {
    const emb = await env.AI.run(EMBED_MODEL, { text: [QUERY_PREFIX + query.slice(0, 2000)] });
    const vector = emb.data[0];
    const result = await env.VECTORIZE.query(vector, { topK: TOP_K, returnMetadata: "all" });
    return (result.matches || [])
      .filter((m) => m.score >= MIN_SCORE && m.metadata?.text)
      .map((m) => ({ ...m.metadata, score: m.score }));
  } catch (err) {
    console.error("Retrieval failed", err);
    return [];
  }
}

// Course rule: no explicit code. Remove fenced code blocks (R, Python, etc.) if the model includes any.
function stripCodeBlocks(text) {
  return text.replace(/```[a-zA-Z]*\n[\s\S]*?```/g, (block) => {
    const lang = (block.match(/^```([a-zA-Z]*)/) || [])[1]?.toLowerCase() || "";
    if (["", "text", "markdown", "md", "math", "latex"].includes(lang) && !/<-|library\(|import |print\(|def |\blm\(|glm\(/.test(block)) {
      return block;
    }
    return "_(Code omitted: BEAR helps you reason through the method; check your lecture notes for the code.)_";
  });
}

function dedupeSources(excerpts) {
  const seen = new Map();
  for (const e of excerpts) {
    const key = `${e.source}|${e.section}`;
    if (!seen.has(key)) seen.set(key, { source: e.source, section: e.section, url: e.url, page: e.page || null });
  }
  return [...seen.values()];
}
