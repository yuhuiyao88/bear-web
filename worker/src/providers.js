// One function per kind of AI service. Each takes the same request (BEAR's
// instructions plus the conversation in Gemini's format) and returns either
//   { ok: true, text, images, tokens, remainingDay }
// or
//   { ok: false, status, error, retryAfterMs, dailyExhausted }
// where status is the HTTP status, 504 for a timeout, or 0 for a network error.

export async function callModel(m, env, req, timeoutMs) {
  try {
    if (m.provider === "gemini") return await callGemini(m, env, req, timeoutMs);
    if (m.provider === "openai") return await callOpenAI(m, env, req, timeoutMs);
    if (m.provider === "workers-ai") return await callWorkersAI(m, env, req, timeoutMs);
    return { ok: false, status: 400, error: `unknown provider ${m.provider}` };
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, status: 504, error: `timed out after ${Math.round(timeoutMs / 1000)} s` };
    }
    return { ok: false, status: 0, error: String(err?.message || err).slice(0, 200) };
  }
}

async function callGemini(m, env, { system, contents }, timeoutMs) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env[m.key] },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: m.plots ? [{ codeExecution: {} }] : undefined,
      generationConfig: { temperature: 0.5, maxOutputTokens: m.maxTokens || 8192 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text();
    // Gemini says which quota ran out (e.g. "...PerDay...") and when to retry.
    const delay = detail.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
    return {
      ok: false,
      status: res.status,
      error: `HTTP ${res.status}: ${detail.replace(/\s+/g, " ").slice(0, 200)}`,
      retryAfterMs: delay ? Math.ceil(parseFloat(delay[1]) * 1000) : retryAfter(res),
      dailyExhausted: res.status === 429 && /PerDay/i.test(detail),
    };
  }

  const data = await res.json();
  const cand = data.candidates?.[0];
  let text = "";
  const images = [];
  // Keep text and images; drop the generated code and raw code output.
  for (const p of cand?.content?.parts || []) {
    if (p.thought) continue;
    if (typeof p.text === "string") text += (text ? "\n\n" : "") + p.text;
    else if (p.inlineData?.data && p.inlineData.mimeType?.startsWith("image/")) {
      images.push(`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`);
    }
  }
  if (!text && !images.length) {
    console.error("Empty reply", m.id, cand?.finishReason || data.promptFeedback?.blockReason || "unknown");
  }
  return { ok: true, text, images, tokens: data.usageMetadata?.totalTokenCount };
}

async function callOpenAI(m, env, req, timeoutMs) {
  const res = await fetch(`${m.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env[m.key]}` },
    body: JSON.stringify({
      model: m.model,
      messages: toChatMessages(req),
      temperature: 0.5,
      max_tokens: m.maxTokens || 2048,
      ...m.extra,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text();
    return {
      ok: false,
      status: res.status,
      error: `HTTP ${res.status}: ${detail.replace(/\s+/g, " ").slice(0, 200)}`,
      retryAfterMs: retryAfter(res),
      // Groq names the exhausted limit, e.g. "Limit 1000, Used 1000 ... requests per day (RPD)".
      dailyExhausted: res.status === 429 && /per day|RPD|TPD/i.test(detail),
    };
  }
  const data = await res.json();
  const remaining = parseInt(res.headers.get("x-ratelimit-remaining-requests"), 10);
  return {
    ok: true,
    text: stripThinking(data.choices?.[0]?.message?.content || ""),
    images: [],
    tokens: data.usage?.total_tokens,
    // Groq's request counter is per day, so it keeps our count in step with theirs.
    remainingDay: m.baseUrl.includes("groq.com") && Number.isFinite(remaining) ? remaining : undefined,
  };
}

async function callWorkersAI(m, env, req, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), timeoutMs);
  });
  try {
    const out = await Promise.race([
      env.AI.run(m.model, { messages: toChatMessages(req), max_tokens: m.maxTokens || 2048, temperature: 0.5 }),
      timeout,
    ]);
    const text = typeof out?.response === "string" ? out.response : out?.choices?.[0]?.message?.content || "";
    return { ok: true, text: stripThinking(text), images: [], tokens: out?.usage?.total_tokens };
  } catch (err) {
    if (err?.name === "TimeoutError") throw err;
    const msg = String(err?.message || err);
    // 4006: the account's free daily neurons are used up.
    const daily = /4006|neuron|daily/i.test(msg);
    return { ok: false, status: daily || /429|rate/i.test(msg) ? 429 : 502, error: msg.slice(0, 200), dailyExhausted: daily };
  } finally {
    clearTimeout(timer);
  }
}

function toChatMessages({ system, contents }) {
  return [
    { role: "system", content: system },
    ...contents.map((c) => ({
      role: c.role === "model" ? "assistant" : "user",
      content: c.parts.map((p) => p.text || "").join("\n"),
    })),
  ];
}

function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "");
}

function retryAfter(res) {
  const s = parseFloat(res.headers.get("retry-after"));
  return Number.isFinite(s) ? Math.ceil(s * 1000) : undefined;
}
