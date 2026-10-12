/* Local launcher: `npm start`. On Vercel the entrypoint is api/index.mjs. */
import http from "node:http";
import { readFileSync } from "node:fs";
import { handler, ready, PORT, people, llm } from "./lib/app.mjs";

// Load .env.local (git-ignored) so APIFY_TOKEN / ANTHROPIC_API_KEY work locally.
try {
  for (const line of readFileSync(new URL("./.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local */ }

await ready;
http.createServer(handler).listen(PORT, () => console.log(`Agentic dating on http://localhost:${PORT}  (${people.size} people, engine: ${llm() ? "Claude" : "rules"}, apify: ${process.env.APIFY_TOKEN ? "on" : "off"})`));
