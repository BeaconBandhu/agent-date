/* Agentic dating — zero-dependency Node server.  `node server.mjs` */
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLinkedIn, fetchInstagram, linkedinSlug, instagramHandle } from "./sources.mjs";
import { analyze } from "./analyze.mjs";
import { runDate, rankFor, leaderboard, verdictOf, setPopulation } from "./dating.mjs";
import { llmDate, llmEnabled } from "./llm.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(ROOT, "public");
const SEED = join(ROOT, "data", "people.json");
const USER = process.env.VERCEL ? "/tmp/user-people.json" : join(ROOT, "data", "user-people.json");
const PORT = +process.env.PORT || 3000;

/* ------------------------------------------------------------ store */
const people = new Map();
const seedRaw = new Map();
const dateCache = new Map();

const build = (id, li, ig, extra = {}) => {
  const a = analyze(li, ig);
  return { id, name: a.name, gender: extra.gender || null, linkedin: li?.ok ? li : null, instagram: ig?.ok ? ig : null, analysis: a, ...extra };
};
async function load() {
  for (const f of [SEED, USER]) {
    try {
      for (const r of JSON.parse(await readFile(f, "utf8"))) {
        if (f === SEED) seedRaw.set(r.id, r);
        people.set(r.id, build(r.id, r.linkedin, r.instagram, { gender: r.gender || null, origin: f === SEED ? "seed" : "added", addedAt: r.addedAt || null, warnings: r.warnings || [] }));
      }
    } catch { /* file may not exist yet */ }
  }
}
async function persistUser() {
  const rows = [...people.values()].filter((p) => p.origin === "added")
    .map((p) => ({ id: p.id, gender: p.gender, linkedin: p.linkedin, instagram: p.instagram, addedAt: p.addedAt, warnings: p.warnings }));
  await mkdir(join(USER, ".."), { recursive: true });
  await writeFile(USER, JSON.stringify(rows, null, 1));
}

const IMG_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net|licdn\.com)$/i;
const viaProxy = (u) => (!u || u.startsWith("data:") ? u : `/api/img?u=${encodeURIComponent(u)}`);
async function fetchImage(u) {
  const x = new URL(u);
  if (x.protocol !== "https:" || !IMG_HOST.test(x.hostname)) throw new Error("host not allowed");
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "image/jpeg" };
}
const inlineImage = async (u) => {
  if (!u || u.startsWith("data:")) return u;
  try { const { buf, type } = await fetchImage(u); return buf.length < 250000 ? `data:${type};base64,${buf.toString("base64")}` : u; } catch { return u; }
};

const card = (p) => ({
  id: p.id, name: p.name, gender: p.gender, headline: p.linkedin?.headline || p.instagram?.bio?.split("\n")[0] || null,
  location: p.analysis.location, image: viaProxy(p.instagram?.image || p.linkedin?.image || null),
  topInterests: p.analysis.interests.slice(0, 3).map((i) => i.label), qualities: p.analysis.qualities.slice(0, 3),
  confidence: p.analysis.confidence, origin: p.origin,
  linkedinUrl: p.linkedin?.url || null, instagramUrl: p.instagram?.url || null,
});

/* ---------------------------------------------------------- ingest */
async function ingest({ linkedinUrl, instagramUrl, gender }) {
  const slug = linkedinSlug(linkedinUrl);
  const handle = instagramHandle(instagramUrl);
  const bad = [];
  if (!slug) bad.push("LinkedIn link must look like https://www.linkedin.com/in/<name>");
  if (!handle) bad.push("Instagram link must look like https://www.instagram.com/<handle>/");
  const known = people.get(slug)?.gender;
  gender = ["male", "female"].includes(gender) ? gender : known;
  if (!gender) bad.push("Choose male or female so the agent only dates the opposite gender");
  if (bad.length) return { status: 400, body: { error: bad.join(" · ") } };

  const trace = [{ step: "Received links", detail: `LinkedIn /in/${slug} · Instagram @${handle}` }];
  const t0 = Date.now();
  let [li, ig] = await Promise.all([fetchLinkedIn(linkedinUrl), fetchInstagram(instagramUrl)]);
  trace.push({ step: "Fetched both pages", detail: `${((Date.now() - t0) / 1000).toFixed(1)}s` });
  const warnings = [];
  const snap = seedRaw.get(slug);
  if (!li.ok) {
    if (snap && linkedinSlug(snap.linkedin.url) === slug) { li = snap.linkedin; warnings.push(`LinkedIn live fetch failed (${snap.linkedin ? "throttled/blocked" : ""}); used the stored snapshot of this profile.`); }
    else warnings.push("LinkedIn: " + li.error);
  }
  if (!ig.ok) {
    if (snap && snap.instagram?.handle === handle) { ig = snap.instagram; warnings.push("Instagram live fetch failed; used the stored snapshot of this profile."); }
    else warnings.push("Instagram: " + ig.error);
  }
  if (!li.ok && !ig.ok) return { status: 422, body: { error: "Neither page could be read.", problems: warnings, trace } };

  trace.push({ step: "Read LinkedIn", detail: li.ok ? `${li.name} — ${li.headline || "no headline"} · ${li.posts.length} posts/articles · ${li.about ? "about section" : "no about"}` : "unavailable" });
  trace.push({ step: "Read Instagram", detail: ig.ok ? `${ig.name} (@${ig.handle}) — ${ig.bio ? "bio: " + ig.bio.replace(/\s+/g, " ").slice(0, 90) : "no bio"}` : "unavailable" });
  const id = slug;
  if (ig.ok) ig = { ...ig, image: await inlineImage(ig.image) };
  if (li.ok) li = { ...li, image: await inlineImage(li.image) };
  const person = build(id, li, ig, { gender, origin: people.get(id)?.origin === "seed" ? "seed" : "added", addedAt: new Date().toISOString(), warnings });
  people.set(id, person);
  recalibrate();
  if (person.origin === "added") await persistUser();
  const a = person.analysis;
  trace.push({ step: "Extracted interests", detail: a.interests.map((i) => i.label).join(", ") || "none visible" });
  trace.push({ step: "Inferred needs", detail: a.needs.map((n) => n.label).join(" · ") });
  trace.push({ step: "Profile ready", detail: `confidence ${a.confidence}%` });
  return { status: 200, body: { person: full(person), trace, warnings } };
}

const recalibrate = () => { setPopulation([...people.values()]); dateCache.clear(); };
const full = (p) => ({ ...card(p), analysis: p.analysis, linkedin: p.linkedin, instagram: p.instagram, warnings: p.warnings || [] });

/* ----------------------------------------------------------- http */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon" };
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
const readBody = async (req) => { let s = ""; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; };

async function getDate(aId, bId, withLLM = true) {
  const key = [aId, bId].join("|") + (withLLM && llmEnabled() ? "|llm" : "");
  if (dateCache.has(key)) return dateCache.get(key);
  const a = people.get(aId), b = people.get(bId);
  if (!a || !b) return null;
  if (a.gender === b.gender) return { error: "Agents only date across genders (male ↔ female).", status: 400 };
  let d = runDate(a, b);
  if (withLLM) d = await llmDate(a, b, d);
  dateCache.set(key, d);
  return d;
}

export async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/api/status") return json(res, 200, { people: people.size, llm: llmEnabled(), engine: llmEnabled() ? "Claude + evidence-grounded analysis" : "evidence-grounded rule engine" });
    if (p === "/api/people" && req.method === "GET") return json(res, 200, { people: [...people.values()].map(card) });
    if (p === "/api/people" && req.method === "POST") {
      const r = await ingest(await readBody(req));
      return json(res, r.status, r.body);
    }
    let m;
    if ((m = p.match(/^\/api\/people\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]);
      const person = people.get(id);
      if (req.method === "DELETE") {
        if (!person || person.origin !== "added") return json(res, 400, { error: "Only people you added can be removed." });
        people.delete(id); recalibrate(); await persistUser();
        return json(res, 200, { ok: true });
      }
      return person ? json(res, 200, { person: full(person) }) : json(res, 404, { error: "No such person." });
    }
    if ((m = p.match(/^\/api\/rankings\/([^/]+)$/))) {
      const person = people.get(decodeURIComponent(m[1]));
      if (!person) return json(res, 404, { error: "No such person." });
      return json(res, 200, { person: card(person), ranking: rankFor(person, [...people.values()]) });
    }
    if (p === "/api/date") {
      const d = await getDate(url.searchParams.get("a"), url.searchParams.get("b"));
      return d?.error ? json(res, d.status, { error: d.error }) : d ? json(res, 200, d) : json(res, 404, { error: "Pick two people who exist." });
    }
    if (p === "/api/img") {
      try {
        const { buf, type } = await fetchImage(url.searchParams.get("u") || "");
        res.writeHead(200, { "content-type": type, "cache-control": "public, max-age=86400" });
        return res.end(buf);
      } catch { res.writeHead(404); return res.end(); }
    }
    if (p === "/api/leaderboard") return json(res, 200, { pairs: leaderboard([...people.values()], 20) });
    if ((m = p.match(/^\/api\/round\/([^/]+)$/))) {          // speed-dating round, streamed
      const person = people.get(decodeURIComponent(m[1]));
      if (!person) return json(res, 404, { error: "No such person." });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      const send = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
      const others = [...people.values()].filter((o) => o.id !== person.id && o.gender !== person.gender);
      let closed = false; req.on("close", () => (closed = true));
      send("start", { total: others.length, name: person.name });
      for (const o of others) {
        if (closed) return;
        const d = await getDate(person.id, o.id, false);
        send("date", { withId: o.id, withName: o.name, score: d.scores.viewA, mutual: d.scores.mutual, verdict: verdictOf(d.scores.viewA),
          line: d.turns.find((t) => t.stage === "Shared ground")?.text.slice(0, 160) || "" });
        await new Promise((r) => setTimeout(r, 90));
      }
      send("done", {});
      return res.end();
    }
    if (p.startsWith("/api/")) return json(res, 404, { error: "Unknown endpoint." });

    // static
    let file = normalize(p === "/" ? "/index.html" : p).replace(/^([/\\])+/, "");
    const abs = join(PUBLIC, file);
    if (!abs.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    try {
      const buf = await readFile(abs);
      res.writeHead(200, { "content-type": MIME[extname(abs)] || "application/octet-stream" });
      return res.end(buf);
    } catch {
      res.writeHead(200, { "content-type": MIME[".html"] });
      return res.end(await readFile(join(PUBLIC, "index.html")));
    }
  } catch (e) {
    if (!res.headersSent) json(res, e instanceof SyntaxError ? 400 : 500, { error: String(e.message || e) });
    else res.end();
  }
}

export const ready = (async () => { await load(); recalibrate(); })();
export { PORT, people, llmEnabled as llm };
