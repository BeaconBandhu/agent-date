/* The ONLY two sources of information about a person: their public LinkedIn
 * page and their public Instagram page. Both are fetched anonymously (no login,
 * no cookies). Everything downstream reads the objects returned here.
 *
 * LinkedIn  -> the public profile HTML carries schema.org JSON-LD (Person,
 *              Articles, DiscussionForumPostings) + og: tags.
 * Instagram -> the public profile HTML served to a link-preview crawler carries
 *              og:title / og:description / meta description (name, handle, bio).
 */
import { apifyEnabled, apifyLinkedIn, apifyInstagram } from "./apify.mjs";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

export const linkedinSlug = (u = "") => {
  const m = String(u).match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
};
export const instagramHandle = (u = "") => {
  const s = String(u).trim();
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(s)) return s.replace(/^@/, "").toLowerCase();
  const m = s.match(/instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/)([A-Za-z0-9._]{1,30})/i);
  return m ? m[1].toLowerCase() : null;
};

const decode = (s = "") =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function get(url, ua, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow", signal: ac.signal });
    return { status: r.status, text: await r.text() };
  } finally { clearTimeout(t); }
}
const meta = (html, key) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  const m = html.match(re) || html.match(re2);
  return m ? decode(decode(m[1])) : "";
};
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/* ------------------------------------------------------------- LinkedIn */
export async function fetchLinkedIn(url) {
  const slug = linkedinSlug(url);
  if (!slug) return { ok: false, error: "Not a linkedin.com/in/… link." };
  const canonical = `https://www.linkedin.com/in/${slug}`;
  if (apifyEnabled()) {
    try { const a = await apifyLinkedIn(canonical); if (a.ok) return a; } catch { /* fall through to anonymous fetch */ }
  }
  let res;
  try { res = await get(canonical, BROWSER_UA, 12000); } catch (e) { res = { status: 0, text: "" }; }
  if (res.status !== 200) {
    // LinkedIn throttles anonymous requests (HTTP 999). Retry the same public page via a reader relay.
    const viaRelay = await fetchLinkedInViaRelay(slug).catch(() => null);
    if (viaRelay?.ok) return viaRelay;
    return { ok: false, error: res.status === 999 || res.status === 0 ? "LinkedIn is rate-limiting anonymous requests and the profile is not visible to logged-out visitors (public profile visibility may be off)." : `LinkedIn returned HTTP ${res.status}.` };
  }
  const html = res.text;
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let nodes = [];
  for (const m of ld) {
    try { const j = JSON.parse(m[1]); nodes.push(...(j["@graph"] || [j])); } catch { /* skip */ }
  }
  const person = nodes.find((n) => n["@type"] === "Person");
  const title = decode((html.match(/<title>([^<]*)/i) || [])[1] || "");
  const ogDesc = meta(html, "og:description");
  if (!person && !title) return { ok: false, error: "No public profile data found on that page." };

  const orgs = (list) => arr(list).map((o) => ({
    name: decode(o.name || ""), start: o.member?.startDate ?? null, end: o.member?.endDate ?? null,
    location: o.location || null, type: o["@type"],
  })).filter((o) => o.name);
  const posts = nodes
    .filter((n) => n["@type"] === "Article" || n["@type"] === "DiscussionForumPosting")
    .map((n) => ({
      kind: n["@type"] === "Article" ? "article" : "post",
      text: decode(n.headline || n.articleBody || n.text || n.name || "").trim(),
      published: n.datePublished || null,
      likes: n.interactionStatistic?.userInteractionCount ?? null,
    }))
    .filter((p) => p.text)
    .slice(0, 12);

  const nm = person?.name || title.split(" - ")[0].replace(/\s*\|.*$/, "").trim();
  return {
    ok: true,
    url: canonical,
    name: decode(decode(nm)),
    headline: ogDesc.split(" · ")[0].trim() || decode(title.replace(/\s*\|\s*LinkedIn\s*$/i, "").split(" - ").slice(1).join(" - ")) || null,
    about: decode(person?.description || "") || null,
    summary: ogDesc || null,
    titles: arr(person?.jobTitle).map(decode),
    location: person?.address?.addressLocality || null,
    country: person?.address?.addressCountry || null,
    tagline: person?.disambiguatingDescription || null,
    followers: person?.interactionStatistic?.userInteractionCount ?? null,
    current: orgs(person?.worksFor),
    past: orgs(person?.alumniOf),
    awards: arr(person?.awards).map((a) => (typeof a === "string" ? a : a.name)).filter(Boolean),
    languages: arr(person?.knowsLanguage).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean),
    posts,
    image: person?.image?.contentUrl || null,
  };
}

/* ------------------------------------------------------------ Instagram */
export async function fetchInstagram(url) {
  const handle = instagramHandle(url);
  if (!handle) return { ok: false, error: "Not an instagram.com/<handle> link." };
  const canonical = `https://www.instagram.com/${handle}/`;
  if (apifyEnabled()) {
    try { const a = await apifyInstagram(handle); if (a.ok) return a; } catch { /* fall through to anonymous fetch */ }
  }
  let res;
  try { res = await get(canonical, CRAWLER_UA, 12000); } catch { try { res = await get(canonical, CRAWLER_UA, 12000); } catch (e) { return { ok: false, error: "Instagram did not respond (" + (e.message || "timeout") + ")." }; } }
  if (res.status !== 200) return { ok: false, error: `Instagram returned HTTP ${res.status} (profile not public or blocked).` };
  const html = res.text;
  const ogTitle = meta(html, "og:title");
  const desc = meta(html, "description");
  const ogDesc = meta(html, "og:description");
  if (!ogTitle || /login/i.test(ogTitle) || !/\(@/.test(ogTitle)) return { ok: false, error: "Could not read this Instagram profile — it is private, does not exist, or Instagram is not serving it to link previews." };
  const name = ogTitle.replace(/\s*\(@.*$/, "").trim();
  // meta description:  'N Followers, M Following, K Posts - Name (@h) on Instagram: "bio"'
  const bioM = desc.match(/on Instagram:\s*"([\s\S]*)"\s*$/);
  const counts = (ogDesc || desc).match(/([\d.,KMB]+)\s+Followers,\s*([\d.,KMB]+)\s+Following,\s*([\d.,KMB]+)\s+Posts/i);
  return {
    ok: true,
    url: canonical,
    handle,
    name,
    bio: bioM ? bioM[1].trim() : null,
    // Instagram serves crawlers placeholder counts; keep them but flag as unreliable.
    counts_raw: counts ? { followers: counts[1], following: counts[2], posts: counts[3] } : null,
    image: meta(html, "og:image") || null,
  };
}

/* Same public page, fetched through the r.jina.ai reader (different egress IP),
 * parsed from its markdown rendering. Returns the same shape as fetchLinkedIn. */
async function fetchLinkedInViaRelay(slug) {
  const canonical = `https://www.linkedin.com/in/${slug}`;
  const r = await get(`https://r.jina.ai/${canonical}`, BROWSER_UA, 22000);
  if (r.status !== 200) return { ok: false };
  const md = r.text;
  const title = (md.match(/^Title:\s*(.*)$/m) || [])[1] || "";
  if (!title || /sign up|log in|authwall/i.test(title)) return { ok: false };
  const name = ((md.match(/^# (.+)$/m) || [])[1] || title.split(" - ")[0]).trim();
  const parts = title.replace(/\s*\|\s*LinkedIn\s*$/i, "").replace(/\|\s*Professional Profile/i, "").split(" - ").map((x) => x.trim());
  const rest = parts.slice(1).join(" - ").trim();
  const locM = md.match(/^### (.+?)\s+Contact Info/m);
  const location = locM ? locM[1].trim() : (/,\s/.test(rest) && /United States|Kingdom|India|Canada|Germany|Australia/.test(rest) ? rest : null);
  const headline = location && rest === location ? null : rest || null;
  const aboutM = md.match(/^## About\s+([\s\S]*?)(?=\n## )/m);
  const about = aboutM ? aboutM[1].replace(/\s*see more\s*$/i, "").replace(/\s+/g, " ").replace(/…\s*$/, "…").trim() : null;
  const fol = md.match(/([\d.,]+[KM]?)\s+followers/i);
  const n = fol ? parseFloat(fol[1].replace(/,/g, "")) * (/K/i.test(fol[1]) ? 1e3 : /M/i.test(fol[1]) ? 1e6 : 1) : null;
  const posts = [];
  for (const m of md.matchAll(/^### (?!Sign|\d)([^\n]{8,160})$/gm)) {
    const t = m[1].trim();
    if (t !== name && !/Contact Info|followers|View /i.test(t)) posts.push({ kind: "article", text: t, published: null, likes: null });
  }
  for (const m of md.matchAll(/shared this\]\([^)]*\)\s+([^\n\[]{40,600})/g)) posts.push({ kind: "post", text: m[1].trim(), published: null, likes: null });
  const img = md.match(/!\[[^\]]*\]\((https:\/\/media\.licdn\.com\/dms\/image[^)]*profile-displayphoto[^)]*)\)/);
  return {
    ok: true, url: canonical, via: "reader-relay", name, headline, about, summary: [headline, about].filter(Boolean).join(" · ") || null,
    titles: headline ? [headline] : [], location, country: null, tagline: null, followers: n, current: [], past: [], awards: [], languages: [],
    posts: posts.slice(0, 12), image: img ? img[1] : null,
  };
}
