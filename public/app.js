/* Agent Date — vanilla SPA (hash router). GSAP + Lenis are progressive enhancement. */
(() => {
  const $app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (n) => n.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const api = async (path, opts) => {
    const r = await fetch(path, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { body: j });
    return j;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  let people = [];

  /* ---- smooth scroll + animation (optional) ---- */
  let lenis = null;
  try {
    if (window.Lenis && !reduce) {
      lenis = new Lenis({ anchors: false });
      if (window.gsap && window.ScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add((t) => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      }
    }
  } catch { lenis = null; }
  const reveal = (sel, root = $app) => {
    if (!window.gsap || reduce) return;
    const els = root.querySelectorAll(sel);
    if (els.length) gsap.fromTo(els, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.04, ease: "power2.out", clearProps: "transform,opacity" });
  };
  const fillBars = (root = $app) => {
    root.querySelectorAll(".bar i[data-w]").forEach((el) => {
      const w = el.dataset.w + "%";
      if (window.gsap && !reduce) gsap.to(el, { width: w, duration: 0.9, ease: "power3.out" }); else el.style.width = w;
    });
  };

  /* ---- components ---- */
  const avatar = (p, big) => `<span class="avatar${big ? " lg" : ""}">${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : ""}<span style="position:absolute">${esc(initials(p.name))}</span></span>`;
  const avatarSafe = (p, big) => `<span class="avatar${big ? " lg" : ""}" style="position:relative">${esc(initials(p.name))}${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : ""}</span>`;
  const meter = (label, v, cls = "") => `<div class="meter"><span>${esc(label)}</span><div class="bar ${cls}"><i data-w="${Math.max(0, Math.min(100, v))}"></i></div><span class="num">${Math.round(v)}</span></div>`;
  const evidence = (list = []) => list.map((e) => `<div class="ev"><b>${esc(e.src)} · ${esc(e.where)}</b> — “${esc(e.quote)}”</div>`).join("");
  const personCard = (p) => `
    <a class="person" href="#/p/${encodeURIComponent(p.id)}">
      <div class="row">${avatarSafe(p)}<div><h3>${esc(p.name)}</h3><div class="sub">${esc(p.gender === "female" ? "♀ " : p.gender === "male" ? "♂ " : "")}${esc(p.location || "")}</div></div></div>
      <div class="sub">${esc(p.headline || "")}</div>
      <div class="pfoot">${p.topInterests.slice(0, 3).map((t) => `<span class="tag hot">${esc(t)}</span>`).join("")}</div>
    </a>`;

  /* ---- views ---- */
  async function viewHome() {
    $app.innerHTML = `
      <section class="hero">
        <h1>Your agent goes on <em>the date</em>. You get the ranking.</h1>
        <p>Paste a LinkedIn and a public Instagram. An agent reads both, builds the person's profile — needs, hobbies, interests — then dates every other agent on their behalf and ranks who fits best.</p>
        <div class="steps"><span><b>1</b> Links in</span><span><b>2</b> Agent reads</span><span><b>3</b> Profile page</span><span><b>4</b> Agents date</span><span><b>5</b> Ranking</span></div>
        <p style="margin-top:20px"><a class="btn" href="#/add">Add a person</a> <a class="btn ghost" href="#/board">See best pairs</a></p>
      </section>
      <div class="toolbar"><h2>The agents <span class="tag" id="count"></span></h2><input class="search" id="q" placeholder="Search name or interest…" aria-label="Search agents"></div>
      <div class="grid" id="grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;
    const grid = document.getElementById("grid");
    const draw = (q = "") => {
      const s = q.toLowerCase();
      const list = people.filter((p) => !s || (p.name + " " + p.headline + " " + p.topInterests.join(" ")).toLowerCase().includes(s));
      grid.innerHTML = list.map(personCard).join("") || `<p class="hint">No one matches “${esc(q)}”.</p>`;
      document.getElementById("count").textContent = `${people.length} people`;
      reveal(".person", grid);
    };
    draw();
    document.getElementById("q").addEventListener("input", (e) => draw(e.target.value));
  }

  function viewAdd() {
    $app.innerHTML = `
      <section class="hero"><h1>Meet a new <em>agent</em></h1>
      <p>Give it the two official links. It reads only those two pages — nothing else.</p></section>
      <form class="panel form" id="f" novalidate>
        <label>LinkedIn profile<input name="li" placeholder="https://www.linkedin.com/in/…" required autocomplete="off"></label>
        <label>Instagram profile <span class="hint">(must be public)</span><input name="ig" placeholder="https://www.instagram.com/…" required autocomplete="off"></label>
        <label>This person is <span class="hint">(agents only date across genders)</span><select name="gender" class="sel" required><option value="">Choose…</option><option value="female">Female</option><option value="male">Male</option></select></label>
        <div><button class="btn" id="go">Send the agent to read them</button></div>
        <div id="out"></div>
      </form>`;
    const f = document.getElementById("f");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const out = document.getElementById("out");
      const go = document.getElementById("go");
      const body = { linkedinUrl: f.li.value.trim(), instagramUrl: f.ig.value.trim(), gender: f.gender.value };
      if (!body.linkedinUrl || !body.instagramUrl) { out.innerHTML = `<div class="err">Please paste both links.</div>`; return; }
      if (!body.gender) { out.innerHTML = `<div class="err">Please choose male or female.</div>`; return; }
      go.disabled = true; go.textContent = "Reading…";
      const t0 = Date.now();
      out.innerHTML = `<div class="reading"><div><b>Agent</b><span id="wait">Fetching the two public pages… 0s</span></div></div>`;
      const tick = setInterval(() => { const w = document.getElementById("wait"); if (w) w.textContent = `Fetching LinkedIn and Instagram in parallel… ${Math.round((Date.now() - t0) / 1000)}s (up to ~30s if LinkedIn throttles)`; }, 500);
      try {
        const r = await api("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        clearInterval(tick);
        const box = out.querySelector(".reading");
        box.innerHTML = "";
        for (const t of r.trace) {
          box.insertAdjacentHTML("beforeend", `<div><b>${esc(t.step)}</b>${esc(t.detail)}</div>`);
          await sleep(reduce ? 0 : 380);
        }
        if (r.warnings?.length) out.insertAdjacentHTML("beforeend", r.warnings.map((w) => `<div class="warn" style="margin-top:8px">${esc(w)}</div>`).join(""));
        await sleep(reduce ? 0 : 500);
        await refresh();
        location.hash = "#/p/" + encodeURIComponent(r.person.id);
      } catch (err) {
        clearInterval(tick);
        out.innerHTML = `<div class="err"><b>${esc(err.message)}</b>${(err.body?.problems || []).map((p) => `<div style="margin-top:6px">• ${esc(p)}</div>`).join("")}<div class="hint" style="margin-top:8px">Both profiles must be public. You can still add someone if only one of the two pages is readable.</div></div>`;
        go.disabled = false; go.textContent = "Send the agent to read them";
      }
    });
  }

  async function viewProfile(id) {
    $app.innerHTML = `<div class="skeleton"></div>`;
    let p, rk;
    try { p = (await api("/api/people/" + encodeURIComponent(id))).person; rk = (await api("/api/rankings/" + encodeURIComponent(id))).ranking; }
    catch (e) { $app.innerHTML = `<div class="err">${esc(e.message)}</div><p><a href="#/">← Back</a></p>`; return; }
    const a = p.analysis;
    const srcLinks = [p.linkedinUrl && `<a href="${esc(p.linkedinUrl)}" target="_blank" rel="noopener">LinkedIn ↗</a>`, p.instagramUrl && `<a href="${esc(p.instagramUrl)}" target="_blank" rel="noopener">Instagram ↗</a>`].filter(Boolean).join(" · ");
    const P = a.personality;
    const pnames = { extraversion: "Public energy", openness: "Openness to ideas", conscientiousness: "Discipline", agreeableness: "Warmth", ambition: "Ambition", emotional_openness: "Emotional openness" };
    $app.innerHTML = `
      <p><a href="#/" class="hint">← All agents</a></p>
      <div class="row" style="gap:18px;align-items:flex-start;flex-wrap:wrap">
        ${avatarSafe(p, true)}
        <div style="flex:1;min-width:260px">
          <h1 style="font-size:clamp(30px,4vw,46px)">${esc(p.name)}</h1>
          <div class="lead" style="color:var(--mute)">${esc(p.headline || "")}</div>
          <div class="src hint" style="margin-top:6px">${srcLinks} · ${esc(p.gender || "")} · ${esc(p.location || "location not public")} · reading confidence <b>${a.confidence}%</b></div>
        </div>
        <div><a class="btn" href="#/rank/${encodeURIComponent(p.id)}">Run the speed-dating round</a></div>
      </div>
      ${p.warnings?.length ? p.warnings.map((w) => `<div class="warn" style="margin-top:12px">${esc(w)}</div>`).join("") : ""}
      <div class="panel" style="margin-top:18px"><h3>What the agent understood</h3><p class="lead" style="margin:0">${esc(a.summary)}</p>
        <div class="chips" style="margin-top:12px">${a.qualities.map((q) => `<span class="tag hot">${esc(q)}</span>`).join("")}</div></div>
      <div class="pgrid">
        <div>
          <div class="panel"><h3>Needs <span class="hint">— what they likely seek in a partner</span></h3>
            ${a.needs.map((n) => `<div class="need"><h4>${esc(n.label)}</h4>${meter("Strength", n.strength, "mint")}
              ${n.because.length ? `<div class="hint">Because of: ${esc(n.because.join(", "))}</div>` : ""}${evidence(n.evidence)}</div>`).join("")}</div>
          <div class="panel"><h3>Interests</h3>
            ${a.interests.map((i) => `<div class="need"><h4>${esc(i.label)}</h4>${meter("Signal", i.strength)}${evidence(i.evidence)}</div>`).join("") || `<p class="hint">No strong interests visible in the public data.</p>`}</div>
          <div class="panel"><h3>Hobbies & lifestyle</h3>
            ${a.hobbies.map((i) => `<div class="need"><h4>${esc(i.label)}</h4>${meter("Signal", i.strength)}${evidence(i.evidence)}</div>`).join("") || `<p class="hint">No hobbies visible in the public data — the agent will not invent any.</p>`}</div>
        </div>
        <div>
          <div class="panel"><h3>Values</h3>${a.values.map((v) => `<div class="need"><h4>${esc(v.label)}</h4>${evidence(v.evidence.slice(0, 1))}</div>`).join("") || `<p class="hint">None detected.</p>`}</div>
          <div class="panel"><h3>Personality read</h3>${Object.keys(pnames).map((k) => meter(pnames[k], P[k])).join("")}
            <p class="hint">Style: <b style="color:var(--ink)">${esc(a.style.label)}</b> — ${esc(a.style.detail)}</p>
            <p class="hint">Life stage: ${esc(a.lifeStage.label)} · ${esc(a.lifeStage.note)}</p></div>
          <div class="panel"><h3>Likely dealbreakers</h3><div class="chips">${a.dealbreakers.map((d) => `<span class="tag">${esc(d)}</span>`).join("")}</div></div>
          <div class="panel"><h3>Top matches</h3>${rk.slice(0, 5).map((r) => `<a class="pair" href="#/date/${encodeURIComponent(p.id)}/${encodeURIComponent(r.id)}"><span><b>#${r.rank}</b> ${esc(r.name)}</span><span class="score" style="font-size:20px">${r.score}</span></a>`).join("")}
            <p><a href="#/rank/${encodeURIComponent(p.id)}" class="hint">Full ranking →</a></p></div>
          <div class="panel"><h3>Sources read</h3>
            <p class="hint">LinkedIn: ${a.sources.linkedin ? esc(a.sources.linkedin.fields.join(", ")) : "unavailable"}<br>Instagram: ${a.sources.instagram ? esc(a.sources.instagram.fields.join(", ")) : "unavailable"}</p>
            ${p.origin === "added" ? `<button class="btn ghost small" id="rm">Remove this person</button>` : ""}</div>
        </div>
      </div>`;
    fillBars(); reveal(".panel");
    document.getElementById("rm")?.addEventListener("click", async () => {
      if (!confirm("Remove " + p.name + "?")) return;
      await api("/api/people/" + encodeURIComponent(p.id), { method: "DELETE" });
      await refresh(); location.hash = "#/";
    });
  }

  async function viewRank(id) {
    const person = people.find((p) => p.id === id);
    if (!person) { $app.innerHTML = `<div class="err">Unknown person.</div>`; return; }
    $app.innerHTML = `
      <p><a href="#/p/${encodeURIComponent(id)}" class="hint">← ${esc(person.name)}'s profile</a></p>
      <h1 style="font-size:clamp(28px,4vw,44px)">${esc(person.name)}'s agent is speed-dating…</h1>
      <div class="progress"><i id="pg"></i></div>
      <div class="live" id="live"></div>
      <div id="final"></div>`;
    const live = document.getElementById("live"), pg = document.getElementById("pg");
    let total = 1, n = 0;
    await new Promise((resolve) => {
      const es = new EventSource("/api/round/" + encodeURIComponent(id));
      es.addEventListener("start", (e) => { total = JSON.parse(e.data).total || 1; });
      es.addEventListener("date", (e) => {
        const d = JSON.parse(e.data); n++;
        pg.style.width = Math.round((n / total) * 100) + "%";
        live.insertAdjacentHTML("afterbegin", `<div><b style="color:var(--ink)">${esc(person.name.split(" ")[0])} × ${esc(d.withName)}</b> — ${d.score}/100 · ${esc(d.verdict)}<br><span>${esc(d.line)}</span></div>`);
      });
      es.addEventListener("done", () => { es.close(); resolve(); });
      es.onerror = () => { es.close(); resolve(); };
    });
    const { ranking } = await api("/api/rankings/" + encodeURIComponent(id));
    document.querySelector("h1").textContent = `Who fits ${person.name} best`;
    document.getElementById("final").innerHTML = `<div class="toolbar"><h2>Ranking</h2><span class="hint">Score = how well the other person meets ${esc(person.name.split(" ")[0])}'s needs (60% mutual fit, 40% needs)</span></div>` +
      ranking.map((r) => `
      <div class="rankrow">
        <div class="rank">${r.rank}</div>
        <div><a href="#/p/${encodeURIComponent(r.id)}"><b>${esc(r.name)}</b></a><div class="sub">${esc(r.headline || "")}</div><div class="hint">${esc(r.why)}</div>
          <div class="mini">${["interests", "values", "lifestyle", "chemistry", "needs"].map((k) => `<div><span>${k}</span><div class="bar"><i data-w="${r.breakdown[k]}"></i></div></div>`).join("")}</div></div>
        <div><div class="score">${r.score}</div><div class="hint">${esc(r.verdict)} · they rate you ${r.theirView}</div></div>
        <div class="acts"><a class="btn small" href="#/date/${encodeURIComponent(id)}/${encodeURIComponent(r.id)}">Watch the date</a></div>
      </div>`).join("");
    fillBars(); reveal(".rankrow");
  }

  async function viewDate(aId, bId) {
    $app.innerHTML = `<div class="skeleton"></div>`;
    let d;
    try { d = await api(`/api/date?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`); }
    catch (e) { $app.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const A = people.find((p) => p.id === aId) || { name: d.a.name }, B = people.find((p) => p.id === bId) || { name: d.b.name };
    $app.innerHTML = `
      <p><a href="#/rank/${encodeURIComponent(aId)}" class="hint">← Ranking</a></p>
      <div class="duo">
        <div class="who">${avatarSafe(A, true)}<h3>${esc(A.name)}</h3><div class="hint">agent A</div></div>
        <div class="heart">♥</div>
        <div class="who">${avatarSafe(B, true)}<h3>${esc(B.name)}</h3><div class="hint">agent B</div></div>
      </div>
      <div class="stage">
        <div class="panel chat" id="chat"></div>
        <div class="panel score-card">
          <div class="bigmeter" id="big">–</div><div class="hint" style="text-align:center" id="vd">The date is underway…</div>
          <div id="breakdown" style="margin-top:14px"></div>
          <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost small" id="skip">Skip to verdict</button><button class="btn ghost small" id="swap">Swap seats</button></div>
          <p class="hint" id="eng"></p>
        </div>
      </div>`;
    const chat = document.getElementById("chat");
    let skip = false, stop = false, lastStage = "";
    document.getElementById("skip").onclick = () => (skip = true);
    document.getElementById("swap").onclick = () => { stop = true; location.hash = `#/date/${encodeURIComponent(bId)}/${encodeURIComponent(aId)}`; };
    const onLeave = () => { stop = true; window.removeEventListener("hashchange", onLeave); };
    window.addEventListener("hashchange", onLeave);
    for (const t of d.turns) {
      if (stop) return;
      if (t.stage !== lastStage) { chat.insertAdjacentHTML("beforeend", `<div class="stagechip">${esc(t.stage)}</div>`); lastStage = t.stage; }
      if (!skip && !reduce) {
        chat.insertAdjacentHTML("beforeend", `<div class="msg ${t.speaker} typing" id="typing"><small>${esc(t.name)}'s agent</small>…</div>`);
        chat.scrollTop = chat.scrollHeight;
        await sleep(650 + Math.min(1400, t.text.length * 9));
        document.getElementById("typing")?.remove();
      }
      chat.insertAdjacentHTML("beforeend", `<div class="msg ${t.speaker}"><small>${esc(t.name)}'s agent</small>${esc(t.text)}${t.evidence?.length ? `<div class="ev"><b>${esc(t.evidence[0].src)}</b> — “${esc(t.evidence[0].quote.slice(0, 140))}”</div>` : ""}</div>`);
      chat.scrollTop = chat.scrollHeight;
      if (t.meter != null) document.getElementById("big").textContent = t.meter;
    }
    window.removeEventListener("hashchange", onLeave);
    const s = d.scores;
    document.getElementById("big").textContent = s.mutual;
    document.getElementById("vd").textContent = `${d.verdict} — ${A.name.split(" ")[0]} rates ${s.viewA}, ${B.name.split(" ")[0]} rates ${s.viewB}`;
    document.getElementById("breakdown").innerHTML = ["interests", "values", "lifestyle", "chemistry", "needs"].map((k) => meter(k, s[k])).join("");
    document.getElementById("eng").textContent = "Dialogue engine: " + d.engine + (d.engine_note ? " — " + d.engine_note : "");
    fillBars();
  }

  async function viewBoard() {
    $app.innerHTML = `<section class="hero"><h1>Best <em>pairs</em></h1><p>Every agent has dated every other agent. These are the strongest mutual matches.</p></section><div id="b"><div class="skeleton"></div></div>`;
    const { pairs } = await api("/api/leaderboard");
    document.getElementById("b").innerHTML = pairs.map((p, i) => `<a class="pair" href="#/date/${encodeURIComponent(p.a.id)}/${encodeURIComponent(p.b.id)}"><span><b>#${i + 1}</b> ${esc(p.a.name)} × ${esc(p.b.name)}</span><span><span class="hint">${esc(p.verdict)}</span> <b class="score" style="font-size:22px">${p.score}</b></span></a>`).join("");
    reveal(".pair");
  }

  /* ---- router ---- */
  async function refresh() { people = (await api("/api/people")).people; }
  async function route() {
    const [, view, a, b] = (location.hash || "#/").split("/").map((s) => (s ? decodeURIComponent(s) : s));
    document.querySelectorAll("nav a").forEach((l) => l.classList.toggle("on", (l.dataset.nav === "home" && !view) || l.dataset.nav === view || (view === "p" && l.dataset.nav === "home")));
    window.scrollTo(0, 0); lenis?.scrollTo(0, { immediate: true });
    try {
      if (!view) return viewHome();
      if (view === "add") return viewAdd();
      if (view === "p") return viewProfile(a);
      if (view === "rank") return viewRank(a);
      if (view === "date") return viewDate(a, b);
      if (view === "board") return viewBoard();
      location.hash = "#/";
    } catch (e) { $app.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
  window.addEventListener("hashchange", route);
  (async () => {
    try {
      const s = await api("/api/status");
      document.getElementById("engine").textContent = s.llm ? "Claude-written dates" : "Evidence-grounded rule engine";
      await refresh();
    } catch (e) { $app.innerHTML = `<div class="err">Cannot reach the server: ${esc(e.message)}</div>`; return; }
    route();
  })();
})();
