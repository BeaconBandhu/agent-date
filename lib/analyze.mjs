/* The reading agent. Input: the two source objects (LinkedIn + Instagram).
 * Output: a structured profile — needs, hobbies, interests, values, personality,
 * communication style — where EVERY claim carries evidence quoted from one of the
 * two sources. Deterministic lexical engine; optionally refined by Claude
 * (see llm.mjs) when ANTHROPIC_API_KEY is set. */

/* id, label, kind, regex.  kind: interest | hobby | value */
const TAXO = [
  // interests
  ["tech", "Technology & AI", "interest", /\b(ai|a\.i\.|artificial intelligence|software|cloud|tech(nology)?|digital|data|machine learning|llm|cyber|computing|platform|nvidia|microsoft|ibm|linkedin|engineer(ing)?)\b/i],
  ["startups", "Entrepreneurship & startups", "interest", /\b(entrepreneur\w*|founder|co-?founder|startup\w*|venture|build(ing)? (a )?(business|company)|small business|appsumo|business owner|ceo)\b/i],
  ["investing", "Investing & finance", "interest", /\b(invest\w*|capital|fund|equity|angel|portfolio|wealth|money|finance|financial|acquisition|ventures?)\b/i],
  ["leadership", "Leadership & management", "interest", /\b(leader\w*|chairman|chair|executive|manage\w*|team|culture|organization\w*|coach\w*|mentor\w*)\b/i],
  ["psychology", "Psychology & mindset", "interest", /\b(psycholog\w*|mindset|mental|behavio\w*|emotion\w*|vulnerab\w*|shame|resilien\w*|think again|research(er)?|brain|habit\w*|motivation\w*|self[- ]?help|personal development|confidence)\b/i],
  ["health", "Health & wellness", "interest", /\b(health\w*|wellness|well-?being|physician|medical|medicine|nutrition|sleep|longevity|protein|fitness|mental health|healing|holistic)\b/i],
  ["science", "Science & research", "interest", /\b(science|scientific|research\w*|phd|ph\.d|professor|wharton|university|study|studies|lab|physics|biolog\w*)\b/i],
  ["learning", "Learning & education", "interest", /\b(learn\w*|educat\w*|teach\w*|school|student\w*|curious|curiosity|skills?|knowledge|lessons?)\b/i],
  ["writing", "Books & writing", "interest", /\b(author|book\w*|writ(e|er|ing)\w*|bestsell\w*|essay\w*|newsletter|publish\w*|nyt|new york times|storytell\w*|story)\b/i],
  ["media", "Podcasting & media", "interest", /\b(podcast\w*|host\w*|show|media|youtube|video\w*|content|creator|stream\w*|film|documentary|tv)\b/i],
  ["marketing", "Marketing & brand", "interest", /\b(marketing|seo|brand\w*|advertis\w*|social media|audience|growth|sales|sell|digital agency)\b/i],
  ["impact", "Philanthropy & global impact", "interest", /\b(foundation|philanthrop\w*|charit\w*|nonprofit|global health|poverty|equity|impact|humanity|world|mission|vaccine\w*|donat\w*|give|giving)\b/i],
  ["climate", "Climate & energy", "interest", /\b(climate|energy|sustainab\w*|clean|carbon|environment\w*|planet|green|breakthrough energy)\b/i],
  ["philosophy", "Philosophy & stoicism", "interest", /\b(stoic\w*|philosoph\w*|meaning|wisdom|virtue\w*|purpose|truth|mindful\w*|consciousness)\b/i],
  ["spirit", "Spirituality & meditation", "interest", /\b(spiritual\w*|meditat\w*|soul|conscious\w*|awaken\w*|yoga|monk|ayurved\w*|faith|prayer|gratitude)\b/i],
  ["policy", "Policy & society", "interest", /\b(policy|government|politic\w*|public service|society|community|civic|democracy|workforce|jobs|skills-first|skillsfirst|inclusion|diversity)\b/i],
  ["realestate", "Real estate", "interest", /\b(real estate|property|properties|apartment\w*|housing|multifamily)\b/i],
  // hobbies / lifestyle
  ["fitness", "Fitness & sport", "hobby", /\b(fitness|gym|workout|athlet\w*|sport\w*|handball|olympic\w*|run(ning)?|marathon|basketball|football|soccer|training|wrestl\w*|lifting)\b/i],
  ["outdoors", "Outdoors & adventure", "hobby", /\b(hik\w*|outdoor\w*|adventure|mountain\w*|nature|camp\w*|surf\w*|ski\w*|travel\w*|explor\w*|trip|journey)\b/i],
  ["reading", "Reading", "hobby", /\b(read\w*|book club|library|bookshop|book shop|bookstore|novel\w*)\b/i],
  ["music", "Music & arts", "hobby", /\b(music|song|concert|guitar|piano|art|artist\w*|design\w*|creative|creativity|poetry)\b/i],
  ["food", "Food & cooking", "hobby", /\b(food|cook\w*|chef|recipe\w*|taco\w*|restaurant|coffee|wine|dinner)\b/i],
  ["pets", "Pets & animals", "hobby", /\b(dog\w*|cat\w*|pet\w*|puppy|animal\w*|paw\w*)\b/i],
  ["humor", "Humor & play", "hobby", /\b(funny|humou?r|laugh\w*|joke\w*|fun|play\w*|comedy|😂|🤣|lol)\b/i],
  ["family", "Family life", "hobby", /\b(family|dad|mom|father|mother|parent\w*|husband|wife|kids?|children|daughter|son|grandchild\w*|married|partner)\b/i],
  // values
  ["v_growth", "Growth & self-improvement", "value", /\b(growth|improve\w*|better|transform\w*|potential|level up|evolve|progress|achieve\w*|goals?)\b/i],
  ["v_authentic", "Authenticity & vulnerability", "value", /\b(authentic\w*|vulnerab\w*|honest\w*|real|genuine|truth|courage\w*|brave|shame|wholehearted|imperfect\w*)\b/i],
  ["v_mission", "Mission & purpose", "value", /\b(mission|purpose|meaning|empower\w*|change the world|impact|serve|service|why|calling)\b/i],
  ["v_ambition", "Ambition & excellence", "value", /\b(ambiti\w*|excellence|win\w*|scale|10x|build\w*|top \d+|#1|billion|leading|best|world-class|dominat\w*|hustle|grind)\b/i],
  ["v_optimism", "Optimism & hope", "value", /\b(optimis\w*|hope\w*|positiv\w*|joy\w*|inspir\w*|believe|possible|bright)\b/i],
  ["v_curiosity", "Curiosity", "value", /\b(curio\w*|wonder|question\w*|explor\w*|discover\w*|think again|rethink\w*|ideas?|experiment\w*|learn\w*)\b/i],
  ["v_generosity", "Generosity & service", "value", /\b(generous|generosity|give|giving|help\w*|support\w*|share|sharing|kind\w*|compassion|empath\w*|care|lift)\b/i],
  ["v_freedom", "Freedom & independence", "value", /\b(freedom|independen\w*|own terms|your own|solopreneur|on their own terms|own or be owned|ownership|autonom\w*|free)\b/i],
  ["v_discipline", "Discipline & craft", "value", /\b(discipline|habit\w*|routine|craft|consisten\w*|focus\w*|stoic\w*|systems?|process|hard work|practice)\b/i],
  ["v_connection", "Connection & relationships", "value", /\b(connection\w*|relationship\w*|love|friend\w*|together|community|belong\w*|people|trust|team|bond\w*)\b/i],
];

/* inferred needs: what this person likely wants from a partner, with the
 * topics that trigger it and the topics a partner must carry to supply it. */
const NEEDS = [
  { id: "n_depth", label: "Emotional honesty and depth", need: ["v_authentic", "psychology", "v_connection"], supply: ["v_authentic", "psychology", "v_connection", "v_generosity", "spirit"] },
  { id: "n_purpose", label: "A partner who shares a sense of mission", need: ["v_mission", "impact", "climate", "policy"], supply: ["v_mission", "impact", "climate", "policy", "v_generosity", "philosophy"] },
  { id: "n_drive", label: "Someone who matches (or respects) their drive and schedule", need: ["v_ambition", "startups", "investing", "leadership"], supply: ["v_ambition", "startups", "investing", "leadership", "v_discipline"] },
  { id: "n_mind", label: "An intellectual sparring partner", need: ["v_curiosity", "science", "learning", "tech", "philosophy", "writing"], supply: ["v_curiosity", "science", "learning", "tech", "philosophy", "writing", "psychology"] },
  { id: "n_wellness", label: "Shared healthy rituals and a calm home base", need: ["health", "fitness", "spirit", "v_discipline", "outdoors"], supply: ["health", "fitness", "spirit", "outdoors", "v_discipline", "food"] },
  { id: "n_play", label: "Humor, play and lightness", need: ["humor", "v_optimism", "pets", "music", "food"], supply: ["humor", "v_optimism", "music", "pets", "food", "outdoors"] },
  { id: "n_space", label: "Room for independence and autonomy", need: ["v_freedom", "startups", "outdoors"], supply: ["v_freedom", "v_discipline", "startups", "outdoors"] },
  { id: "n_home", label: "Shared priorities around family and home", need: ["family", "v_connection", "pets"], supply: ["family", "v_connection", "pets", "v_generosity", "food"] },
  { id: "n_grounded", label: "Grounded, private support away from the spotlight", need: ["media", "marketing", "leadership"], supply: ["v_authentic", "v_connection", "family", "v_discipline", "spirit", "v_optimism"] },
];

const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const squash = (x) => 1 - Math.exp(-x / 2.2);
const uniq = (a) => [...new Set(a)];

/* source-weighted text chunks, each tagged so evidence can cite its origin */
function chunks(li, ig) {
  const out = [];
  const push = (src, where, text, w) => { if (text && String(text).trim()) out.push({ src, where, text: String(text).trim(), w }); };
  if (ig?.ok) {
    push("Instagram", "bio", ig.bio, 2.2); push("Instagram", "name", ig.name, 0.2);
    for (const p of ig.posts || []) push("Instagram", "post", [p.caption, ...(p.hashtags || []).map((h) => "#" + h)].join(" "), 1.1);
  }
  if (li?.ok) {
    push("LinkedIn", "headline", li.headline, 2);
    push("LinkedIn", "tagline", li.tagline, 1);
    push("LinkedIn", "about", li.about, 1.6);
    for (const t of li.titles || []) push("LinkedIn", "title", t, 1.4);
    for (const o of li.current || []) push("LinkedIn", "current role", o.name, 1.2);
    for (const o of li.past || []) push("LinkedIn", "background", [o.name, o.role].filter(Boolean).join(" — "), 0.6);
    for (const o of li.current || []) if (o.description) push("LinkedIn", "role description", o.description, 0.8);
    if (li.skills?.length) push("LinkedIn", "skills", li.skills.join(", "), 0.8);
    if (li.awards?.length) push("LinkedIn", "honors", li.awards.join(", "), 0.8);
    if (li.interestsListed?.length) push("LinkedIn", "interests", li.interestsListed.join(", "), 1.2);
    for (const p of li.posts || []) push("LinkedIn", p.kind === "article" ? "article" : "post", p.text, 0.9);
  }
  return out;
}

const snippet = (text, re) => {
  const m = text.match(re);
  if (!m) return text.slice(0, 110);
  let i = Math.max(0, m.index - 45);
  if (i > 0) { const sp = text.indexOf(" ", i); if (sp > -1 && sp < m.index) i = sp + 1; }
  let end = Math.min(text.length, m.index + m[0].length + 70);
  if (end < text.length) { const sp = text.lastIndexOf(" ", end); if (sp > m.index + m[0].length) end = sp; }
  let s = text.slice(i, end).replace(/\s+/g, " ").trim();
  return (i > 0 ? "…" : "") + s + (i + s.length < text.length ? "…" : "");
};

export function analyze(li, ig) {
  const cs = chunks(li, ig);
  const score = {}; // topic id -> raw
  const evid = {};  // topic id -> [{src, where, quote}]
  for (const [id, label, kind, re] of TAXO) {
    for (const c of cs) {
      const g = new RegExp(re.source, "gi");
      const hits = c.text.match(g);
      if (!hits) continue;
      score[id] = (score[id] || 0) + Math.min(3, hits.length) * c.w;
      (evid[id] ||= []).push({ src: c.src, where: c.where, quote: snippet(c.text, re), w: c.w });
    }
  }
  const norm = {};
  for (const [id] of TAXO) norm[id] = +squash(score[id] || 0).toFixed(3);

  const pick = (kind, n) =>
    TAXO.filter((t) => t[2] === kind && norm[t[0]] > 0.12)
      .sort((a, b) => norm[b[0]] - norm[a[0]]).slice(0, n)
      .map(([id, label]) => ({ id, label, strength: Math.round(norm[id] * 100), evidence: (evid[id] || []).sort((a, b) => b.w - a.w).slice(0, 2).map(({ src, where, quote }) => ({ src, where, quote })) }));
  const interests = pick("interest", 6);
  const hobbies = pick("hobby", 5);
  const values = pick("value", 5);

  /* inferred needs */
  const needs = NEEDS.map((n) => {
    const s = n.need.reduce((a, id) => a + (norm[id] || 0), 0) / Math.sqrt(n.need.length);
    const ev = n.need.flatMap((id) => (evid[id] || []).map((e) => ({ ...e, id }))).sort((a, b) => b.w - a.w);
    return { id: n.id, label: n.label, strength: Math.round(clamp(s * 48, 0, 96)), supplyIds: n.supply,
      because: uniq(n.need.filter((id) => norm[id] > 0.1).sort((a, b) => norm[b] - norm[a])).slice(0, 3).map((id) => TAXO.find((t) => t[0] === id)[1]),
      evidence: ev.filter((e, i, arr) => arr.findIndex((x) => x.quote === e.quote) === i).slice(0, 2).map(({ src, where, quote }) => ({ src, where, quote })) };
  }).filter((n) => n.strength >= 18).sort((a, b) => b.strength - a.strength).slice(0, 5);
  if (!needs.length) needs.push({ id: "n_mind", label: "An intellectual sparring partner", strength: 30, supplyIds: NEEDS[3].supply, because: [], evidence: [] });

  /* personality (0-100, 50 = neutral) from cues + footprint */
  const all = cs.map((c) => c.text).join(" \n ");
  const count = (re) => (all.match(new RegExp(re.source, "gi")) || []).length;
  const followers = li?.followers || 0;
  const emoji = (ig?.bio || "").match(/\p{Extended_Pictographic}/gu)?.length || 0;
  const personality = {
    extraversion: clamp(50 + count(/\b(host|speaker|keynote|podcast|audience|community|stage|show|talk|people|together|social|media)\b/) * 5 + Math.log10(followers + 1) * 3 + emoji * 2 - 8),
    openness: clamp(46 + count(/\b(curio\w*|creative|ideas?|explor\w*|learn\w*|philosoph\w*|innovat\w*|science|wonder|rethink\w*|art|design)\b/) * 6 + (norm.philosophy + norm.science + norm.v_curiosity) * 8),
    conscientiousness: clamp(48 + count(/\b(build\w*|disciplin\w*|habit\w*|system\w*|execut\w*|scale|process|plan\w*|focus\w*|routine|operator|manage\w*|chair\w*)\b/) * 4.5),
    agreeableness: clamp(48 + count(/\b(help\w*|kind\w*|empath\w*|support\w*|together|care|grateful|gratitude|thank\w*|love|compassion|generous|serve|service|team)\b/) * 5),
    ambition: clamp(42 + count(/\b(ceo|chair\w*|founder|co-?founder|#1|bestsell\w*|billion|scale|top \d+|win\w*|lead\w*|president|executive|investor)\b/) * 6),
    emotional_openness: clamp(40 + count(/\b(vulnerab\w*|courage\w*|feel\w*|shame|heal\w*|emotion\w*|heart|soul|love|authentic\w*|honest\w*|trust)\b/) * 8),
  };
  for (const k in personality) personality[k] = Math.round(personality[k]);

  const style = communicationStyle(li, ig, personality, emoji);
  const lifeStage = lifeStageOf(li);
  const roles = [...(li?.titles || []), ...(li?.current || []).map((o) => o.name)].filter(Boolean);
  const topInterests = interests.slice(0, 3).map((i) => i.label.toLowerCase());
  const name = li?.name || ig?.name || "This person";

  const summary =
    `${name}${li?.headline ? " — " + li.headline.replace(/\s+/g, " ") : ""}. ` +
    (topInterests.length ? `Reads as someone organised around ${topInterests.join(", ")}` : "Limited public signal") +
    (values.length ? `, driven by ${values.slice(0, 2).map((v) => v.label.toLowerCase()).join(" and ")}` : "") +
    `. Communication style: ${style.label.toLowerCase()}.` +
    (needs[0] ? ` In a partner, most likely needs: ${needs[0].label.toLowerCase()}.` : "");

  const sources = {
    linkedin: li?.ok ? { url: li.url, fields: ["headline", li.about && "about", li.titles?.length && "titles", (li.current?.length || li.past?.length) && "experience", li.posts?.length && `${li.posts.length} posts/articles`, li.skills?.length && `${li.skills.length} skills`, li.location && "location"].filter(Boolean) } : null,
    instagram: ig?.ok ? { url: ig.url, fields: ["name", ig.bio ? "bio" : "no bio", "handle", ig.posts?.length && `${ig.posts.length} recent posts (captions, hashtags)`, ig.followers != null && "follower count"].filter(Boolean) } : null,
  };
  const confidence = Math.round(clamp(
    (li?.ok ? 35 : 0) + (ig?.ok ? 20 : 0) + Math.min(25, cs.length * 2) + (li?.about ? 10 : 0) + (ig?.bio ? 10 : 0)));

  return {
    name, summary, interests, hobbies, values, needs, personality, style, lifeStage,
    roles: uniq(roles).slice(0, 4), location: li?.location || null, vector: norm, confidence, sources,
    qualities: qualities(personality, values, style),
    dealbreakers: dealbreakers(personality, norm),
  };
}

function communicationStyle(li, ig, p, emoji) {
  const text = [li?.about, ig?.bio, ...(li?.posts || []).map((x) => x.text)].join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  const excl = (text.match(/!/g) || []).length;
  let label = "Measured and professional";
  let detail = "Writes plainly and factually; lets credentials and work do the talking.";
  if (emoji >= 4 || excl >= 3) { label = "Warm, expressive and energetic"; detail = "Uses emoji and exclamation, speaks directly to an audience, wears enthusiasm openly."; }
  else if (p.emotional_openness >= 62) { label = "Reflective and emotionally open"; detail = "Frames ideas around feelings, courage and personal truth."; }
  else if (p.openness >= 62) { label = "Curious and idea-driven"; detail = "Leads with questions, frameworks and big ideas rather than résumé."; }
  else if (words > 250) { label = "Detailed and narrative"; detail = "Tells longer stories about their path; comfortable with context."; }
  else if (p.ambition >= 70) { label = "Direct and achievement-led"; detail = "Short, confident statements built around titles, scale and results."; }
  return { label, detail };
}

function lifeStageOf(li) {
  const yrs = [...(li?.current || []), ...(li?.past || [])].map((o) => +o.start).filter((y) => y > 1970 && y < 2030);
  if (!yrs.length) return { label: "Established", note: "Career span not visible in public data." };
  const span = new Date().getFullYear() - Math.min(...yrs);
  if (span >= 28) return { label: "Veteran / legacy-building", note: `Public career visible since ~${Math.min(...yrs)}.` };
  if (span >= 15) return { label: "Established and scaling", note: `Public career visible since ~${Math.min(...yrs)}.` };
  return { label: "Early-to-mid career", note: `Public career visible since ~${Math.min(...yrs)}.` };
}

function qualities(p, values, style) {
  const q = [];
  if (p.ambition >= 65) q.push("Highly driven");
  if (p.extraversion >= 65) q.push("Publicly energetic");
  if (p.openness >= 62) q.push("Intellectually curious");
  if (p.emotional_openness >= 60) q.push("Emotionally articulate");
  if (p.agreeableness >= 62) q.push("Warm and supportive");
  if (p.conscientiousness >= 62) q.push("Disciplined builder");
  for (const v of values.slice(0, 2)) q.push(v.label);
  q.push(style.label);
  return uniq(q).slice(0, 7);
}

function dealbreakers(p, n) {
  const d = [];
  if (p.ambition >= 65) d.push("Someone who resents a demanding schedule");
  if (p.emotional_openness >= 60) d.push("Emotional avoidance or stonewalling");
  if (n.v_authentic > 0.3) d.push("Performative or inauthentic behaviour");
  if (p.openness >= 60) d.push("Closed-minded, incurious conversation");
  if (n.v_mission > 0.3 || n.impact > 0.3) d.push("Indifference to the wider world");
  if (!d.length) d.push("Disrespect and dishonesty");
  return d.slice(0, 3);
}

export const TOPIC_LABELS = Object.fromEntries(TAXO.map((t) => [t[0], t[1]]));
export const TOPIC_KIND = Object.fromEntries(TAXO.map((t) => [t[0], t[2]]));
