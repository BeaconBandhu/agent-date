/* Apify-backed readers (used first when APIFY_TOKEN is set). They still read
 * only the two sources: the person's LinkedIn profile and Instagram profile.
 * Return shapes match lib/sources.mjs so everything downstream is unchanged. */
const BASE = "https://api.apify.com/v2/acts";
const LI_ACTOR = "harvestapi~linkedin-profile-scraper";
const IG_ACTOR = "apify~instagram-profile-scraper";
export const apifyEnabled = () => Boolean(process.env.APIFY_TOKEN);

async function run(actor, input, ms = 50000) {
  const r = await fetch(`${BASE}/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`Apify ${actor.split("~")[1]} HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j[0] : null;
}
const ym = (d) => (d && (d.year || d.text) ? d.year || d.text : null);

export async function apifyLinkedIn(url) {
  const p = await run(LI_ACTOR, { urls: [url], profileScraperMode: "Profile details no email ($4 per 1k)" });
  if (!p || (!p.firstName && !p.headline)) return { ok: false, error: "Apify returned no data for this LinkedIn profile (private or not found)." };
  const exp = Array.isArray(p.experience) ? p.experience : [];
  const edu = Array.isArray(p.education) ? p.education : [];
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  const isCurrent = (e) => !e.endDate || /present/i.test(JSON.stringify(e.endDate));
  return {
    ok: true, url: p.linkedinUrl || url, via: "apify", name,
    headline: p.headline || null, about: p.about || null,
    summary: [p.headline, p.about].filter(Boolean).join(" · ").slice(0, 600) || null,
    titles: exp.filter(isCurrent).map((e) => e.position).filter(Boolean).slice(0, 4),
    location: p.location?.linkedinText || p.location?.parsed?.text || null,
    country: p.location?.countryCode || null, tagline: p.industry || null,
    followers: p.followerCount ?? null, connections: p.connectionsCount ?? null,
    current: exp.filter(isCurrent).map((e) => ({ name: e.companyName, start: ym(e.startDate), end: null, location: e.location || null, type: "Organization", role: e.position, description: e.description || null })).filter((o) => o.name),
    past: [
      ...exp.filter((e) => !isCurrent(e)).map((e) => ({ name: e.companyName, start: ym(e.startDate), end: ym(e.endDate), location: e.location || null, type: "Organization", role: e.position, description: e.description || null })),
      ...edu.map((e) => ({ name: e.schoolName || e.school || e.title, start: ym(e.startDate), end: ym(e.endDate), type: "EducationalOrganization", role: e.degree || e.fieldOfStudy || null })),
    ].filter((o) => o.name),
    skills: (p.skills || []).map((s) => s.name).filter(Boolean).slice(0, 25),
    awards: (p.honorsAndAwards || []).map((a) => a.title || a.name).filter(Boolean).slice(0, 6),
    languages: (p.languages || []).map((l) => l.name || l).filter(Boolean),
    interestsListed: (p.interests || []).map((i) => i.name || i.title || i).filter((x) => typeof x === "string").slice(0, 12),
    posts: [], image: p.photo || p.profilePicture?.url || null,
  };
}

export async function apifyInstagram(handle) {
  const p = await run(IG_ACTOR, { usernames: [handle] });
  if (!p || !p.username) return { ok: false, error: "Apify returned no data for this Instagram profile (private or not found)." };
  if (p.private) return { ok: false, error: "This Instagram account is private." };
  const posts = (p.latestPosts || []).slice(0, 12).map((x) => ({
    caption: (x.caption || "").trim(), hashtags: x.hashtags || [], mentions: x.mentions || [], likes: x.likesCount ?? null,
    comments: x.commentsCount ?? null, type: x.type || null, url: x.url || null, at: x.timestamp || null, location: x.locationName || null,
  })).filter((x) => x.caption || x.hashtags.length);
  return {
    ok: true, via: "apify", url: `https://www.instagram.com/${p.username}/`, handle: p.username, name: p.fullName || p.username,
    bio: p.biography || null, followers: p.followersCount ?? null, following: p.followsCount ?? null, postsCount: p.postsCount ?? null,
    verified: !!p.verified, category: p.businessCategoryName || null, posts, image: p.profilePicUrlHD || p.profilePicUrl || null, counts_raw: null,
  };
}
