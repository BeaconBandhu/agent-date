/* The dating agents.  Each person's agent speaks for them, using ONLY the
 * analysis derived from their LinkedIn + Instagram. A date is a staged,
 * evidence-grounded conversation that also produces the compatibility scores
 * the rankings are built from. */
import { TOPIC_LABELS, TOPIC_KIND } from "./analyze.mjs";

const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const first = (n = "") => n.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] || "they";
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rngOf = (seed) => { let t = hash(seed) || 1; return () => ((t = Math.imul(t ^ (t >>> 15), 1 | t) + 0x6d2b79f5 | 0), ((t ^ (t >>> 7)) >>> 0) / 4294967296); };
const pickFrom = (rng, a) => a[Math.floor(rng() * a.length)];
const join = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a.at(-1));

function cosine(va, vb, ids) {
  let d = 0, na = 0, nb = 0;
  for (const id of ids) { const x = va[id] || 0, y = vb[id] || 0; d += x * y; na += x * x; nb += y * y; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
/* Population calibration: similarity is measured against the pool average so
 * that "everyone writes about books" does not count as chemistry. */
let POP = { mean: {}, sd: {}, v: 0 };
export function setPopulation(list) {
  const ids = Object.keys(TOPIC_LABELS);
  const mean = {}, sd = {};
  for (const id of ids) {
    const xs = list.map((p) => p.analysis.vector[id] || 0);
    const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length || 1);
    mean[id] = m; sd[id] = Math.max(0.12, Math.sqrt(v));
  }
  POP = { mean, sd, v: POP.v + 1 };
}
const zvec = (p) => {
  if (p._zv === POP.v) return p._z;
  const z = {};
  for (const id of Object.keys(TOPIC_LABELS)) z[id] = clamp(((p.analysis.vector[id] || 0) - (POP.mean[id] || 0)) / (POP.sd[id] || 0.25), -2.5, 2.5);
  Object.defineProperty(p, "_z", { value: z, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(p, "_zv", { value: POP.v, writable: true, enumerable: false, configurable: true });
  return z;
};
const cmap = (c) => clamp(Math.round(32 + 68 * clamp((c + 0.4) / 1.1, 0, 1)));
const idsOf = (kind) => Object.keys(TOPIC_KIND).filter((k) => TOPIC_KIND[k] === kind);

function locationFit(a, b) {
  const la = (a.analysis.location || "").toLowerCase(), lb = (b.analysis.location || "").toLowerCase();
  if (!la || !lb) return { v: 0.45, note: "location unknown for at least one of them" };
  const ca = la.split(",")[0].replace(/ (metropolitan|area|greater)/g, "").trim(), cb = lb.split(",")[0].replace(/ (metropolitan|area|greater)/g, "").trim();
  if (ca === cb) return { v: 1, note: `both based around ${a.analysis.location.split(",")[0]}` };
  const sa = la.split(",").map((s) => s.trim()), sb = lb.split(",").map((s) => s.trim());
  if (sa.at(-1) === sb.at(-1) && sa.length > 2 && sb.length > 2 && sa.at(-2) === sb.at(-2)) return { v: 0.7, note: "same state" };
  if (sa.at(-1) === sb.at(-1)) return { v: 0.55, note: "same country, different cities" };
  return { v: 0.2, note: "different countries — long-distance" };
}

/* directional: how well does B's profile supply A's needs */
function needFit(a, b) {
  const rows = a.analysis.needs.map((n) => {
    const z = zvec(b);
    const sup = n.supplyIds.map((id) => ({ id, v: b.analysis.vector[id] || 0, z: z[id] })).sort((x, y) => y.z - x.z);
    const top = sup.slice(0, 3);
    const zs = top.reduce((s, x) => s + x.z, 0) / top.length;
    const v = clamp((zs + 0.4) / 2.6, 0, 1);
    return { need: n, fit: v, via: top.filter((x) => x.v > 0.12 && x.z > 0.2).map((x) => TOPIC_LABELS[x.id]) };
  });
  const wsum = rows.reduce((s, r) => s + r.need.strength, 0) || 1;
  const v = rows.reduce((s, r) => s + r.fit * r.need.strength, 0) / wsum;
  return { v, rows };
}

export function pairScores(a, b) {
  const A = a.analysis, B = b.analysis;
  const za = zvec(a), zb = zvec(b);
  const interests = cosine(za, zb, idsOf("interest"));
  const values = cosine(za, zb, idsOf("value"));
  const hobby = cosine(za, zb, idsOf("hobby"));
  const loc = locationFit(a, b);
  const pa = A.personality, pb = B.personality;
  const sim = (k) => 1 - Math.abs(pa[k] - pb[k]) / 100;
  const chem = sim("openness") * 0.25 + sim("agreeableness") * 0.2 + sim("ambition") * 0.2 + sim("emotional_openness") * 0.15 +
    (1 - Math.abs(pa.extraversion - pb.extraversion - 8) / 100) * 0.1 + sim("conscientiousness") * 0.1;
  const nAB = needFit(a, b), nBA = needFit(b, a);
  const s = {
    interests: cmap(interests),
    values: cmap(values),
    lifestyle: clamp(Math.round(0.55 * cmap(hobby) + 0.45 * (32 + 68 * loc.v))),
    chemistry: clamp(Math.round(32 + 68 * clamp((chem - 0.6) / 0.36, 0, 1))),
    needs_a: clamp(Math.round(32 + 68 * nAB.v)),
    needs_b: clamp(Math.round(32 + 68 * nBA.v)),
  };
  s.needs = Math.round((s.needs_a + s.needs_b) / 2);
  const mutual = Math.round(s.interests * 0.2 + s.values * 0.2 + s.lifestyle * 0.12 + s.chemistry * 0.16 + s.needs * 0.32);
  const viewA = Math.round(mutual * 0.6 + s.needs_a * 0.4);
  const viewB = Math.round(mutual * 0.6 + s.needs_b * 0.4);
  return { ...s, mutual, viewA, viewB, loc, needDetailAB: nAB, needDetailBA: nBA };
}

const band = (n) => (n >= 72 ? "Strong match" : n >= 62 ? "Promising" : n >= 50 ? "Friendly, mild chemistry" : "Better as friends");
export const verdictOf = band;

function sharedTopics(A, B) {
  const zOf = (P, id) => ((P.vector[id] || 0) - (POP.mean[id] || 0)) / (POP.sd[id] || 0.25);
  return Object.keys(TOPIC_LABELS)
    .map((id) => ({ id, v: Math.min(A.vector[id] || 0, B.vector[id] || 0), z: Math.min(zOf(A, id), zOf(B, id)), kind: TOPIC_KIND[id] }))
    .filter((x) => x.v > 0.15 && x.z > 0.1).sort((x, y) => y.z - x.z);
}
const ev = (item) => (item?.evidence?.[0] ? [{ src: item.evidence[0].src, where: item.evidence[0].where, quote: item.evidence[0].quote }] : []);
const q = (e) => (e?.[0] ? ` (“${e[0].quote.replace(/\s+/g, " ").slice(0, 120)}” — ${e[0].src})` : "");

/* ------------------------------------------------------------ the date */
export function runDate(a, b) {
  const sc = pairScores(a, b);
  const A = a.analysis, B = b.analysis;
  const fa = first(a.name), fb = first(b.name);
  const rng = rngOf([a.id, b.id].sort().join("|"));
  const turns = [];
  let meterParts = [];
  const meter = () => Math.round(meterParts.reduce((s, x) => s + x, 0) / Math.max(1, meterParts.length));
  const say = (who, stage, text, evidence = [], reveal) => {
    if (reveal != null) meterParts.push(reveal);
    turns.push({ n: turns.length + 1, stage, speaker: who, name: who === "A" ? a.name : b.name, text, evidence, meter: meterParts.length ? meter() : null });
  };
  const hl = (p) => (p.linkedin?.headline || p.analysis.roles[0] || "a professional with a public profile").replace(/\s+/g, " ").replace(/[.\s]+$/, "").slice(0, 140);

  // 1 — introductions
  say("A", "Introductions",
    pickFrom(rng, [`Hi ${fb}'s agent — I represent ${a.name}. From their LinkedIn: ${hl(a)}.`, `Hello! I'm ${fa}'s agent. For the record: ${hl(a)}.`]) +
    ` What I read as most central to ${fa}: ${join(A.interests.slice(0, 2).map((i) => i.label.toLowerCase()))}${A.values[0] ? `, and a value of ${A.values[0].label.toLowerCase()}` : ""}.`,
    [...ev(A.interests[0]), ...ev(A.values[0])].slice(0, 2));
  say("B", "Introductions",
    `Nice to meet you. I speak for ${b.name} — ${hl(b)}. ${fb}'s public footprint centres on ${join(B.interests.slice(0, 2).map((i) => i.label.toLowerCase()))}. My read of ${fb}: ${B.style.label.toLowerCase()}.`,
    [...ev(B.interests[0]), ...ev(B.values[0])].slice(0, 2));

  // 2 — shared ground
  const shared = sharedTopics(A, B);
  const sh = shared.filter((x) => x.kind !== "value").slice(0, 3);
  if (sh.length) {
    const lbl = sh.map((x) => TOPIC_LABELS[x.id]);
    const ea = [...(A.interests.find((i) => i.id === sh[0].id) || A.hobbies.find((i) => i.id === sh[0].id) || {}).evidence || []];
    say("A", "Shared ground", `I see overlap right away: ${join(lbl)}. That's where ${fa} spends real attention${q(ea)}. Does that match ${fb}?`, ea.slice(0, 1), sc.interests);
    const eb = [...(B.interests.find((i) => i.id === sh[0].id) || B.hobbies.find((i) => i.id === sh[0].id) || {}).evidence || []];
    say("B", "Shared ground", `It does — ${TOPIC_LABELS[sh[0].id].toLowerCase()} shows up in ${fb}'s own words${q(eb)}. ${sh.length > 1 ? `And ${TOPIC_LABELS[sh[1].id].toLowerCase()} gives us a second thread.` : "One strong thread is enough to start a good dinner conversation."}`, eb.slice(0, 1));
  } else {
    const bi = B.interests[0];
    say("A", "Shared ground", `Honestly, our public footprints don't overlap much. ${fa} lives in ${join(A.interests.slice(0, 2).map((i) => i.label.toLowerCase()))}; I see ${fb} leaning to ${bi ? bi.label.toLowerCase() : "a different world"}. Curious how ${fb} would explain that to ${fa}.`, ev(bi), sc.interests);
    say("B", "Shared ground", `Fair. ${fb}'s world is ${B.interests[0]?.label.toLowerCase() || "different"}${q(ev(B.interests[0]))}. Different doesn't mean incompatible — it would be a conversation of explaining rather than agreeing.`, ev(B.interests[0]));
  }

  // 3 — values (B's reaction to A's value is merged with B's own value statement)
  const va = A.values[0], vb = B.values[0];
  const react = (v, other, fo, fs, label) => {
    if (!v) return "";
    return (other.vector[v.id] || 0) > 0.2
      ? `That lands — ${fo} carries ${v.label.toLowerCase()} too; we would not have to translate each other here.`
      : `Respect that. ${fo} weighs things differently, but nothing in ${fo}'s public record fights it.`;
  };
  if (va) say("A", "Values", `The value ${fa} signals most is ${va.label.toLowerCase()}${q(va.evidence)}.`, va.evidence.slice(0, 1));
  if (va || vb) {
    const bOwn = vb && (!va || vb.id !== va.id) ? ` For ${fb} the anchor is ${vb.label.toLowerCase()}${q(vb.evidence)}.` : vb ? ` It is ${fb}'s anchor as well${q(vb.evidence)}.` : "";
    say("B", "Values", (va ? react(va, B, fb, fa) : "") + bOwn, vb ? vb.evidence.slice(0, 1) : [], sc.values);
  }
  if (vb && (!va || vb.id !== va.id)) {
    say("A", "Values", (A.vector[vb.id] || 0) > 0.2 ? `${fa} shares that — we'd get along on principle.` : `Noted. It isn't ${fa}'s loudest value, but it's compatible with how ${fa} lives.`, ev(A.values.find((v) => v.id === vb.id)));
  }

  // 4 — needs, both directions (B's reply to A's need is merged with B's own need statement)
  const needLine = (P, fpA, row) =>
    `What ${fpA} most likely needs in a partner: ${row.need.label.toLowerCase()}${row.need.because.length ? ` — inferred from their emphasis on ${join(row.need.because.map((x) => x.toLowerCase()))}` : ""}${q(row.need.evidence)}.`;
  const answerLine = (row, fpB) => {
    const lvl = row.fit >= 0.55 ? "strong" : row.fit >= 0.3 ? "partial" : "weak";
    return lvl === "strong"
      ? `${fpB} delivers that — ${row.via.length ? join(row.via.map((x) => x.toLowerCase())) + " show in" : "it shows in"} ${fpB}'s public record. Strong fit.`
      : lvl === "partial"
        ? `Partly. ${row.via.length ? `${fpB} brings ${join(row.via.map((x) => x.toLowerCase()))}` : `${fpB} would have to stretch`}, but it isn't ${fpB}'s centre of gravity.`
        : `I'll be candid: ${fpB}'s public footprint doesn't show much of that. It could exist off-camera, but the evidence is thin.`;
  };
  const top = (d) => d.rows.slice().sort((x, y) => y.need.strength - x.need.strength)[0];
  const rA = top(sc.needDetailAB), rB = top(sc.needDetailBA);
  if (rA) say("A", "Needs", needLine(A, fa, rA), rA.need.evidence.slice(0, 1));
  if (rA || rB) say("B", "Needs", (rA ? answerLine(rA, fb) + " " : "") + (rB ? needLine(B, fb, rB) : ""), rB ? rB.need.evidence.slice(0, 1) : [], sc.needs_a);
  if (rB) say("A", "Needs", answerLine(rB, fa), [], sc.needs_b);

  // 5 — friction & logistics
  const dims = ["extraversion", "openness", "conscientiousness", "agreeableness", "ambition", "emotional_openness"];
  const gap = dims.map((k) => ({ k, d: A.personality[k] - B.personality[k] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
  const dn = { extraversion: "public energy / social appetite", openness: "appetite for new ideas", conscientiousness: "structure and discipline", agreeableness: "warmth and accommodation", ambition: "professional intensity", emotional_openness: "emotional expressiveness" }[gap.k];
  const hi = gap.d > 0 ? fa : fb, lo = gap.d > 0 ? fb : fa;
  const small = Math.abs(gap.d) < 14;
  say("A", "Friction check",
    small ? `I looked for friction and found little: the widest gap is ${dn}, and it's small.`
      : `The biggest friction I see is ${dn}: ${hi} sits notably higher than ${lo} (${Math.abs(gap.d)} points apart on my scale).`, [], sc.chemistry);
  say("B", "Friction check",
    small ? `Agreed. Where we'd need work is mostly logistics — ${sc.loc.note}.`
      : `Manageable if both are explicit about it. ${lo} would need to ${gap.k === "ambition" || gap.k === "conscientiousness" ? "respect the pace" : "give room for the difference"}; ${hi} would need to ${gap.k === "extraversion" ? "not mistake quiet for distance" : "avoid steamrolling"}. Also: ${sc.loc.note}.`, [], sc.lifestyle);

  // 6 — verdicts
  const vA = band(sc.viewA), vB = band(sc.viewB);
  const second = (n) => (n >= 70 ? "Yes — I'd book a second date." : n >= 58 ? "Maybe — I'd want one more conversation." : "Probably not romantically; I'd keep it friendly.");
  say("A", "Verdict", `From ${fa}'s side: ${sc.viewA}/100, "${vA}". ${second(sc.viewA)} Best fit: ${strongest(sc)}.`, []);
  say("B", "Verdict", `From ${fb}'s side: ${sc.viewB}/100, "${vB}". ${second(sc.viewB)} Weakest area: ${weakest(sc)}.`, []);
  turns.at(-1).meter = sc.mutual;

  return {
    a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name },
    scores: { interests: sc.interests, values: sc.values, lifestyle: sc.lifestyle, chemistry: sc.chemistry, needs: sc.needs, needs_a: sc.needs_a, needs_b: sc.needs_b, mutual: sc.mutual, viewA: sc.viewA, viewB: sc.viewB },
    verdict: band(sc.mutual), turns, engine: "evidence-grounded rules",
    summary: `${a.name} × ${b.name}: ${sc.mutual}/100 (${band(sc.mutual)}). Strongest: ${strongest(sc)}. Weakest: ${weakest(sc)}.`,
  };
}

const NAMES = { interests: "shared interests", values: "values", lifestyle: "lifestyle & place", chemistry: "personality chemistry", needs: "meeting each other's needs" };
const strongest = (s) => NAMES[Object.keys(NAMES).sort((x, y) => s[y] - s[x])[0]];
const weakest = (s) => NAMES[Object.keys(NAMES).sort((x, y) => s[x] - s[y])[0]];

/* ------------------------------------------------------------- rankings */
export function rankFor(person, everyone) {
  const rows = everyone.filter((p) => p.id !== person.id && p.gender !== person.gender).map((o) => {
    const sc = pairScores(person, o);
    return { id: o.id, name: o.name, headline: o.linkedin?.headline || null, score: sc.viewA, mutual: sc.mutual, theirView: sc.viewB, verdict: band(sc.viewA), breakdown: { interests: sc.interests, values: sc.values, lifestyle: sc.lifestyle, chemistry: sc.chemistry, needs: sc.needs_a },
      why: whyLine(person, o, sc) };
  }).sort((x, y) => y.score - x.score || y.mutual - x.mutual);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
function whyLine(a, b, sc) {
  const sh = sharedTopics(a.analysis, b.analysis).slice(0, 2).map((x) => TOPIC_LABELS[x.id].toLowerCase());
  const fit = sc.needDetailAB.rows.slice().sort((x, y) => y.fit * y.need.strength - x.fit * x.need.strength)[0];
  return [sh.length ? `Shared: ${join(sh)}` : "Little overlap in interests", fit && fit.fit > 0.3 ? `meets need "${fit.need.label.toLowerCase()}"` : "needs only partly met"].join(" · ");
}

export function leaderboard(everyone, n = 15) {
  const out = [];
  for (let i = 0; i < everyone.length; i++) for (let j = i + 1; j < everyone.length; j++) {
    if (everyone[i].gender === everyone[j].gender) continue;
    const sc = pairScores(everyone[i], everyone[j]);
    out.push({ a: { id: everyone[i].id, name: everyone[i].name }, b: { id: everyone[j].id, name: everyone[j].name }, score: sc.mutual, verdict: band(sc.mutual) });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, n);
}
