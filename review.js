/* Read-only static review UI for the C3 website-migration grader.
   Loads docs/data/<dataset>.json (rollup + per-page records incl. critics, live
   URLs, and any bundled screenshots) and renders verdict-colored cards with
   prominent click-out links so a reviewer can open prod + migrated side by side.
   No backend, no auth, no verdict-writing — this is a snapshot. */
(function () {
  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const DS_LABEL = { standalone: "Product pages (the migration)", collection: "Collection tail" };
  const CRITIC_VCLASS = (v) => v === "FAIL" ? "NEEDS-FIX" : v === "FLAG" ? "FLAG-HUMAN" : "PASS";

  let dataset = "standalone";
  let DATA = null;                       // { rollup, records }
  let filters = { verdict: new Set(), q: "", fam: "" };

  // ── lightbox ──────────────────────────────────────────────────────────
  const lb = document.getElementById("lb");
  function zoom(src, cap) {
    document.getElementById("lbimg").src = src;
    document.getElementById("lbcap").textContent = cap || "";
    lb.style.display = "block";
  }
  lb.onclick = () => { lb.style.display = "none"; document.getElementById("lbimg").src = ""; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.click(); });

  // ── data ────────────────────────────────────────────────────────────────
  async function load() {
    const r = await fetch(`data/${dataset}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`couldn't load data/${dataset}.json (${r.status})`);
    DATA = await r.json();
  }

  // ── intro / usage banner (differs per dataset) ───────────────────────────
  function intro() {
    if (dataset === "standalone") {
      return `<div class="intro">
        <p><b>The 47 priority product pages.</b> Each was migrated from the live c3.ai
        page it must reproduce, then graded. Click <b>↗ Live prod</b> to open the real
        page; the migrated render is shown as a screenshot below each card (these pages
        aren't deployed to a public URL yet, so there's no live migrated link).</p>
        <div class="note">Migrated product pages live only on a local dev server, so the
        screenshot is the migrated artifact here. Verdicts grade the migrated render
        against live prod.</div>
      </div>`;
    }
    return `<div class="intro">
      <p><b>The re-skinned collection tail.</b> Blog / news / case-study pages, deliberately
      restyled. Graded on <b>content coverage</b> — everything live on prod must survive into
      the migration. Click <b>↗ Live prod</b> and <b>↗ Migrated staging</b> to compare the two
      live pages side by side.</p>
      <div class="note">The migrated staging links sit behind a Vercel visitor password
      — ask Grace for it (shared separately, not published here).</div>
    </div>`;
  }

  // ── toolbar (dataset switch + verdict chips + search/filter) ─────────────
  function toolbar() {
    const ro = DATA.rollup;
    const dsTabs = Object.keys(DS_LABEL).map((d) =>
      `<span class="chip ds${dataset === d ? " active" : ""}" data-ds="${d}">${esc(DS_LABEL[d])}</span>`).join("");
    const chips = (ro.order || []).filter((v) => ro.dist[v]).map((v) =>
      `<span class="chip${filters.verdict.has(v) ? " active" : ""}" data-v="${v}">
        <span class="dot bg-${v}"></span>${v}<span class="n">${ro.dist[v]}</span></span>`).join("");
    const fams = [...new Set(DATA.records.map((r) => r.family).filter(Boolean))].sort();
    return `
      <div class="toolbar"><span class="dslabel">View:</span> ${dsTabs}
        <span class="progresslbl">${ro.n} pages graded</span></div>
      ${intro()}
      <div class="rollupbar">${chips}</div>
      <div class="toolbar">
        <input type="search" id="q" placeholder="search id / reason / evidence…" value="${esc(filters.q)}">
        <select id="fam"><option value="">all ${dataset === "standalone" ? "areas" : "families"}</option>${fams.map((f) =>
          `<option ${filters.fam === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>
        <span class="progresslbl" id="shown"></span>
      </div>`;
  }

  function visible() {
    const q = filters.q.toLowerCase();
    const order = DATA.rollup.order || [];
    return DATA.records.filter((r) => {
      if (filters.verdict.size && !filters.verdict.has(r.verdict)) return false;
      if (filters.fam && r.family !== filters.fam) return false;
      if (q) {
        const ev = (r.critics || []).map((c) => (c.evidence || []).join(" ")).join(" ");
        if (!(r.id + " " + r.reason + " " + ev).toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict) || a.id.localeCompare(b.id));
  }

  // ── card ──────────────────────────────────────────────────────────────
  function linksHTML(r) {
    const prod = r.prod_url
      ? `<a class="openbtn prod" href="${esc(r.prod_url)}" target="_blank" rel="noopener">↗ Live prod</a>` : "";
    const mig = r.staging_url
      ? `<a class="openbtn mig" href="${esc(r.staging_url)}" target="_blank" rel="noopener">↗ Migrated staging</a>`
      : `<span class="openbtn mig dead">migrated render below ↓</span>`;
    const note = (dataset === "collection" && r.staging_url)
      ? `<div class="linknote">staging needs the Vercel visitor password (ask Grace)</div>` : "";
    return `<div class="openlinks">${prod}${mig}</div>${note}`;
  }

  function shotHTML(label, url) {
    if (!url) return "";
    return `<div class="shot"><div class="lbl">${esc(label)}</div>
      <img loading="lazy" src="${esc(url)}" data-cap="${esc(label)}"></div>`;
  }
  function shotsHTML(r) {
    const shots = [
      shotHTML("PROD oracle (ground truth)", r.prod_shot),
      shotHTML(dataset === "standalone" ? "MIGRATED render (graded)" : "MIGRATED staging", r.migrated_shot),
    ].filter(Boolean).join("");
    return shots ? `<div class="shots gallery" data-shots>${shots}</div>` : "";
  }

  function critHTML(c) {
    const ev = (c.evidence || []).map((e) =>
      `<div class="ev${/^\s/.test(e) ? " ind" : ""}">${esc(e)}</div>`).join("");
    const tag = `<span class="tag v-${CRITIC_VCLASS(c.verdict)}">${esc(c.verdict)}</span>`;
    const dc = c.defect_code ? ` <code>${esc(c.defect_code)}</code>` : "";
    return `<div class="critic"><div class="ch">${tag}${esc(c.id)} ${esc(c.name)}${dc}</div>${ev}</div>`;
  }

  function card(r) {
    const critics = (r.critics || []).length
      ? `<details class="critics"><summary>critics &amp; evidence (${r.critics.length})</summary>${r.critics.map(critHTML).join("")}</details>`
      : `<div class="ev">no critics ran — terminal state (see reason)</div>`;
    return `<div class="card" id="card-${esc(r.id)}">
      <div class="chead">
        <span class="badge bg-${r.verdict}">${esc(r.verdict)}</span>
        <div class="ctitle">
          <div class="id">${esc(r.id)}</div>
          <div class="meta">${esc(r.family)} · ${esc(r.status)}</div>
          <div class="reason">${esc(r.reason)}</div>
          ${linksHTML(r)}
        </div>
      </div>
      <div class="cbody">
        ${shotsHTML(r)}
        ${critics}
      </div></div>`;
  }

  function draw() {
    const rows = visible();
    const list = document.getElementById("list");
    list.innerHTML = rows.length ? rows.map(card).join("")
      : `<div class="empty">no pages match the current filters</div>`;
    list.querySelectorAll(".shot img").forEach((img) =>
      img.onclick = () => zoom(img.src, img.dataset.cap));
    const s = document.getElementById("shown");
    if (s) s.textContent = `${rows.length} shown`;
  }

  function bindToolbar() {
    document.querySelectorAll(".chip[data-ds]").forEach((el) =>
      el.onclick = () => { if (el.dataset.ds !== dataset) switchDataset(el.dataset.ds); });
    document.querySelectorAll(".chip[data-v]").forEach((el) => el.onclick = () => {
      const v = el.dataset.v;
      filters.verdict.has(v) ? filters.verdict.delete(v) : filters.verdict.add(v);
      el.classList.toggle("active"); draw();
    });
    document.getElementById("q").oninput = (e) => { filters.q = e.target.value; draw(); };
    document.getElementById("fam").onchange = (e) => { filters.fam = e.target.value; draw(); };
  }

  function setCounts() {
    const el = document.getElementById("counts").querySelector(".txt");
    el.textContent = `${DATA.rollup.n} ${dataset} pages`;
  }

  async function render() {
    const view = document.getElementById("view");
    view.innerHTML = `<div class="empty">loading ${esc(DS_LABEL[dataset])}…</div>`;
    try { await load(); }
    catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    setCounts();
    view.innerHTML = toolbar() + `<div id="list"></div>`;
    bindToolbar(); draw();
  }

  async function switchDataset(ds) {
    dataset = ds;
    filters = { verdict: new Set(), q: "", fam: "" };
    location.hash = "#/" + ds;
    await render();
  }

  // initial dataset from the hash (#/collection or #/standalone)
  const h = (location.hash || "").replace(/^#\//, "");
  if (h === "collection" || h === "standalone") dataset = h;
  render();
})();
