/* Builds data/people.json: candidate public figures -> fetch BOTH official
 * pages live -> keep only people where LinkedIn AND Instagram resolve to the
 * same name. Usage: node scripts/seed.mjs */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fetchLinkedIn, fetchInstagram } from "../lib/sources.mjs";

// [linkedin slug, instagram handle]
const CANDIDATES = [
  ["satyanadella", "satyanadella"], ["richardbranson", "richardbranson"], ["williamhgates", "thisisbillgates"],
  ["ariannahuffington", "ariannahuffington"], ["garyvaynerchuk", "garyvee"], ["simonsinek", "simonsinek"],
  ["brenebrown", "brenebrown"], ["adammgrant", "adamgrant"], ["sherylsandberg", "sherylsandberg"],
  ["neilkpatel", "neilpatel"], ["jayshetty", "jayshetty"], ["oprah", "oprah"], ["melrobbins", "melrobbins"],
  ["tonyrobbins", "tonyrobbins"], ["marieforleo", "marieforleo"], ["grantcardone", "grantcardone"],
  ["codiesanchez", "codiesanchez"], ["alexhormozi", "alexhormozi"], ["sarahblakely", "sarahblakely"],
  ["ryanholiday", "ryanholiday"], ["deepakchopra", "deepakchopra"], ["steven-bartlett-1", "steven"],
  ["brianchesky", "brianchesky"], ["timferriss", "tferriss"], ["jeffweiner08", "jeffweiner"],
  ["reidhoffman", "reidhoffman"], ["melindafrenchgates", "melindafrenchgates"], ["mark-cuban", "mcuban"],
  ["justinwelsh", "justinwelsh"], ["lewishowes", "lewishowes"], ["emilyweiss", "emilyweiss"],
  ["tomasz-tunguz", "tomasztunguz"], ["jackdorsey", "jack"], ["tim-cook-", "tim_cook"],
  ["sundarpichai", "sundarpichai"], ["jensen-huang-", "nvidia"], ["mary-barra", "marybarra"],
  ["ginnirometty", "ginnirometty"], ["vishen", "vishenl"], ["noahkagan", "noahkagan"],
  ["gretaherzog", "gretaherzog"], ["priyankachopra", "priyankachopra"], ["kevinhart", "kevinhart4real"],
  ["maryam-nawaz", "maryamnsharif"], ["huberman", "hubermanlab"], ["ankurnagpal", "ankurnagpal"],
  ["richardbranson", "richardbranson"], ["oprah", "oprah"], ["sarahblakely", "sarahblakely"], ["mark-cuban", "mcuban"],
  ["melindafrenchgates", "melindafrenchgates"], ["steven-bartlett-1", "steven"], ["sundarpichai", "sundarpichai"],
  ["alexhormozi", "alexhormozi"], ["brianchesky", "brianchesky"], ["jackdorsey", "jack"],
  ["vanessanakate", "vanessanakate1"], ["gabbybernstein", "gabbybernstein"], ["amyporterfield", "amyporterfield"],
  ["dorie-clark-9a3b0a1", "doriec"], ["kimscott", "kimberlyscottrad"], ["chris-voss-the-black-swan-group", "blackswangroup"],
  ["robinsharma", "robinsharma"], ["nirandfar", "nireyal"], ["charliemunger", "charliemungerofficial"],
  ["jonahberger", "jonahberger"], ["scottgalloway", "profgalloway"], ["ashleighmotley", "ashleighmotley"],
  ["leilahormozi", "leilahormozi"], ["jordan-harbinger-5a0b7a", "jordanharbinger"],
];

const norm = (s = "") => s.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const sameName = (a, b) => {
  const A = norm(a).split(" "), B = norm(b).split(" ");
  return A.some((w) => w.length > 2 && B.includes(w));
};

let out = [];
try { out = JSON.parse(await readFile(new URL("../data/people.json", import.meta.url), "utf8")); } catch {}
const have = new Set(out.map((p) => p.id));
for (const [slug, handle] of CANDIDATES) {
  if (have.has(slug)) continue;
  const [li, ig] = await Promise.all([
    fetchLinkedIn(`https://www.linkedin.com/in/${slug}`),
    fetchInstagram(`https://www.instagram.com/${handle}/`),
  ]);
  const good = li.ok && ig.ok && sameName(li.name, ig.name);
  console.log(good ? "OK  " : "SKIP", slug, handle, "|", li.ok ? li.name : li.error, "|", ig.ok ? ig.name : ig.error);
  if (good) { out.push({ id: slug, linkedin: li, instagram: ig }); have.add(slug); }
  await new Promise((r) => setTimeout(r, 4000));
}
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(new URL("../data/people.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`\nkept ${out.length} / ${CANDIDATES.length}`);
