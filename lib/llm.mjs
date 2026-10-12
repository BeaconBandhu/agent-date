/* Optional Claude upgrade. When ANTHROPIC_API_KEY is set, the date dialogue is
 * written by Claude (one agent per person, grounded in the same analysis +
 * evidence). Without a key everything still works via the rule engine. */
const MODEL = process.env.AGENT_MODEL || "claude-sonnet-5-5";
export const llmEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

async function claude(system, user, maxTokens = 2500) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
  const j = await r.json();
  return j.content?.map((c) => c.text || "").join("") || "";
}

const brief = (p) => ({
  name: p.name, headline: p.linkedin?.headline, location: p.analysis.location,
  interests: p.analysis.interests.map((i) => i.label), hobbies: p.analysis.hobbies.map((i) => i.label),
  values: p.analysis.values.map((i) => i.label), needs: p.analysis.needs.map((n) => n.label),
  personality: p.analysis.personality, style: p.analysis.style.label,
  linkedin_about: (p.linkedin?.about || "").slice(0, 500), instagram_bio: p.instagram?.bio || "",
  recent_posts: (p.linkedin?.posts || []).slice(0, 4).map((x) => x.text.slice(0, 140)),
});

/* Rewrites the rule-engine transcript's turn texts in natural language while
 * keeping stage/speaker/scores. Returns the same transcript on any failure. */
export async function llmDate(a, b, base) {
  if (!llmEnabled()) return base;
  try {
    const system =
      "You are two dating agents on a first date, each speaking ONLY on behalf of one real public figure. " +
      "Use only the facts given (derived from their public LinkedIn and Instagram). Never invent biography. " +
      "Be warm, specific and a little witty; each turn 1-3 sentences. Return ONLY a JSON array of strings, " +
      `one rewritten string per input turn, same order and same count.`;
    const user = JSON.stringify({ person_A: brief(a), person_B: brief(b), scores: base.scores,
      turns: base.turns.map((t) => ({ stage: t.stage, speaker: t.speaker === "A" ? a.name : b.name, draft: t.text })) });
    const raw = await claude(system, user);
    const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
    if (!Array.isArray(arr) || arr.length !== base.turns.length) return base;
    return { ...base, engine: `Claude (${MODEL}) over evidence-grounded analysis`, turns: base.turns.map((t, i) => ({ ...t, text: String(arr[i]) })) };
  } catch (e) {
    return { ...base, engine_note: "LLM rewrite failed (" + e.message + "); showing rule-engine dialogue." };
  }
}
