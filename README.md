# Agent Date

Every person is represented by an agent. The agent reads **exactly two sources** — the
person's public **LinkedIn** and public **Instagram** — builds a profile (needs, hobbies,
interests, values, personality), then **dates every other agent on that person's
behalf** and produces a **ranking** of who fits best.

Zero dependencies. Node 20+.

```bash
npm start            # http://localhost:3000 (reads .env.local)   (PORT=… to change)
npm run seed         # re-scrape / extend data/people.json (incremental)
```

**Live demo:** https://dating-agents.vercel.app

Environment (put in `.env.local` locally, or Vercel project settings; never commit):

* `APIFY_TOKEN` — optional but recommended. Reads LinkedIn + Instagram through Apify actors
  (`harvestapi/linkedin-profile-scraper`, `apify/instagram-profile-scraper`): full profile, skills
  and recent Instagram posts. Without it the app uses anonymous fetches (thinner, rate-limited).
* `ANTHROPIC_API_KEY` — optional.

Optional: `ANTHROPIC_API_KEY=…` makes Claude write the date dialogue (the rule engine's
scores and evidence are kept; only the wording is rewritten). Without a key everything
works with the built-in engine — the header chip shows which one is active.

## What you can do in the site

| Feature | Where |
|---|---|
| Browse 20+ real people (agents), search by name/interest | `#/` |
| **Paste a LinkedIn + Instagram link** → the agent reads both live, shows what it read, opens the profile | `#/add` |
| **Profile page**: summary, needs, interests, hobbies, values, personality, style, dealbreakers — every claim shows the quote it came from and which source | `#/p/<id>` |
| **Speed-dating round**: the person's agent dates everyone, live progress, then the ranking with per-dimension breakdown and how the *other* side rates them | `#/rank/<id>` |
| **Watch a date**: two agents talk through introductions → shared ground → values → needs → friction → verdict, with a live compatibility meter, skip and swap seats | `#/date/<a>/<b>` |
| **Leaderboard** of the best mutual pairs | `#/board` |
| Remove people you added | profile page |

## How it works

```
LinkedIn page  ─┐                       ┌─ profile (needs·hobbies·interests·values·…)
                ├─ lib/sources.mjs ─ lib/analyze.mjs ─┤
Instagram page ─┘   (fetch, parse)    (the reading agent) └─ evidence quotes per claim
                                                       │
                       lib/dating.mjs  ◄───────────────┘
        pairScores → runDate (staged dialogue) → rankFor / leaderboard
```

* **Sources** (`lib/sources.mjs`). LinkedIn: the public profile HTML carries schema.org
  JSON-LD (name, titles, employers, schools, location, about, articles, posts). Instagram:
  the public profile HTML served to a link-preview crawler carries name, handle and bio.
  Anonymous, no login, no cookies, nothing else is read.
* **Reading agent** (`lib/analyze.mjs`). Source-weighted lexical analysis over a taxonomy
  of interests / hobbies / values; derives inferred needs, a six-trait personality read,
  communication style and life stage. Every item stores the quote and source it came from.
* **Dating** (`lib/dating.mjs`). A date is six stages. Pair compatibility is computed on
  five dimensions — interests, values, lifestyle & place, personality chemistry and
  *needs fulfilment* — measured against the pool average (z-scored) so that things
  everyone shares do not count as chemistry. Needs are **directional**: how well B supplies
  A's needs differs from how well A supplies B's, so every person gets their own ranking.
* **Pairing rule**. Agents only date across genders (male ↔ female); the gender is set per person (chosen on the add form).
* **Ranking**. Score for A = 60 % mutual fit + 40 % how well B meets A's needs.

## Honest limits

* Instagram only exposes name, handle and bio to anonymous visitors (follower counts and
  posts require login), so Instagram contributes the bio and identity, not post content.
* LinkedIn rate-limits anonymous requests (HTTP 999). If a live fetch is blocked and the
  profile exists in the bundled snapshot (`data/people.json`) the site uses the snapshot
  and says so on the profile; otherwise it reports the failure instead of inventing data.
* Needs, personality and values are *inferences from public text*, labelled as such.
* The people included are public figures with official accounts, scraped live and
  verified so LinkedIn and Instagram resolve to the same name (`scripts/seed.mjs`).
