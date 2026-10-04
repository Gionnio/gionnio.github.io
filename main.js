(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const mobile = matchMedia("(max-width: 900px)");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const lines = (s) => esc(s).replace(/\n/g, "<br>");
  const external = (url) => /^https?:/.test(url || "") ? ` target="_blank" rel="noopener"` : "";

  const GITHUB_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.81.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

  // State shared between render() and the scroll handler
  let apps = [];
  let active = -1;

  /* ---------- Templates ---------- */

  const screenHTML = (a, L) => `
    <div class="wall" style="--c1:${esc(a.color)};--c2:${esc(a.color2)}">
      ${a.shot
        ? `<img class="window" src="${esc(a.shot)}" alt="${esc(a.name)} screenshot" loading="lazy">`
        : `<div class="placeholder">${a.icon ? `<img src="${esc(a.icon)}" alt="">` : ""}<span>${esc(L.noShot)}</span></div>`}
    </div>`;

  const detailsHTML = (a, L) => `
    <div class="app-head">
      ${a.icon ? `<img class="app-icon" src="${esc(a.icon)}" alt="">` : ""}
      <div><h2>${esc(a.name)}</h2>${a.public
        ? `<span class="badge open">${esc(L.open)}</span>`
        : `<span class="badge soon">${esc(L.soon)}</span>`}</div>
    </div>
    ${a.tagline ? `<p class="tagline">${lines(a.tagline)}</p>` : ""}
    ${a.description ? `<p class="desc">${lines(a.description)}</p>` : ""}
    ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}
    ${a.tags?.length ? `<ul class="chips">${a.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    ${a.public && a.brew ? `<code class="cmd"><span>$</span> ${esc(a.brew)}</code>` : ""}
    ${a.public && (a.repo || a.download) ? `<div class="actions">
      ${a.repo ? `<a class="btn" href="${esc(a.repo)}"${external(a.repo)}>${esc(L.github)}</a>` : ""}
      ${a.download ? `<a class="btn ghost" href="${esc(a.download)}"${external(a.download)}>${esc(L.download)}</a>` : ""}
    </div>` : ""}`;

  const cardHTML = (c) => {
    const kicker = c.kicker ? `<p class="mono">${esc(c.kicker)}</p>` : "";
    const style = `style="--cols:${+c.cols || 2};--rows:${+c.rows || 1}"`;
    switch (c.type) {
      case "link":
        return `<a class="card link" href="${esc(c.url)}"${external(c.url)} ${style}>
          ${c.icon === "github" ? GITHUB_ICON : ""}
          <div><p class="card-title">${esc(c.title)}</p><p class="muted">${lines(c.text)}</p></div>
          <span class="arrow">↗</span></a>`;
      case "command":
        return `<article class="card command" ${style}>${kicker}
          ${c.title ? `<p class="card-title">${esc(c.title)}</p>` : ""}
          ${c.text ? `<p class="muted">${lines(c.text)}</p>` : ""}
          <code class="cmd"><span>$</span> ${esc(c.cmd)}</code></article>`;
      case "chips":
        return `<article class="card" ${style}>${kicker}
          <ul class="chips">${(c.items || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></article>`;
      case "icons":
        return `<article class="card icons" ${style}><div class="icon-grid">${apps.map((a, i) =>
          `<a href="#${esc(a.id)}" data-goto="${i}" title="${esc(a.name)}"><img src="${esc(a.icon)}" alt="${esc(a.name)}"></a>`).join("")}</div></article>`;
      default: {
        const big = (+c.rows || 1) > 1;
        return `<article class="card text${big ? " big" : ""}" ${style}>${kicker}
          ${c.title ? (big ? `<h2>${esc(c.title)}</h2>` : `<p class="card-title">${esc(c.title)}</p>`) : ""}
          ${c.text ? `<p class="${big ? "body" : "muted"}">${lines(c.text)}</p>` : ""}</article>`;
      }
    }
  };

  /* ---------- Render ---------- */

  function render(c) {
    const L = c.showcase.labels;
    apps = c.apps.filter((a) => a.visible !== false && (a.public || c.showcase.showPrivate));
    const n = Math.max(apps.length, 1);
    active = -1;

    document.title = c.site.title;
    $('meta[name="description"]').setAttribute("content", c.site.description);

    const s = c.sidebar;
    $("#sidebar").innerHTML = `
      <a class="brand" href="#top">${esc(s.brand)}</a>
      <p class="brand-sub">${esc(s.subtitle)}</p>
      <nav>
        ${apps.length ? `<p class="nav-label">${esc(s.projectsLabel)}</p>
        <ul class="nav-apps">${apps.map((a, i) => `<li><a href="#${esc(a.id)}" data-goto="${i}">
          ${a.icon ? `<img src="${esc(a.icon)}" alt="">` : ""}${esc(a.name)}</a></li>`).join("")}</ul>` : ""}
        ${s.links?.length ? `<p class="nav-label">${esc(s.moreLabel)}</p>
        <ul class="nav-more">${s.links.map((l) => `<li><a href="${esc(l.url)}"${external(l.url)}>${esc(l.label)}</a></li>`).join("")}</ul>` : ""}
      </nav>
      <p class="sidebar-foot">${esc((s.copyright || "").replace("{year}", new Date().getFullYear()))}</p>`;

    const h = c.hero;
    const cards = c.bento.cards.filter((k) => k.visible !== false);
    $("#top").innerHTML = `
      <section class="hero">
        ${h.kicker ? `<p class="mono">${lines(h.kicker)}</p>` : ""}
        <h1>${lines(h.title)}</h1>
        ${h.lede ? `<p class="lede">${lines(h.lede)}</p>` : ""}
        ${h.scrollHint && apps.length ? `<a class="scroll-hint" href="#showcase">${esc(h.scrollHint)}</a>` : ""}
      </section>
      ${apps.length ? `
      <section class="showcase" id="showcase" style="--n:${n}">
        <div class="stage">
          <div class="macbook">
            <div class="lid"><div class="bezel"><div class="screen">
              <div class="notch"></div>
              <div class="strip">${apps.map((a) => `<div class="slide">${screenHTML(a, L)}</div>`).join("")}</div>
            </div></div></div>
            <div class="base"><span></span></div>
          </div>
          <div class="details">${apps.map((a, i) =>
            `<div class="detail" id="${esc(a.id)}" data-i="${i}">${detailsHTML(a, L)}</div>`).join("")}</div>
          <div class="dots">${apps.map((a, i) => `<button data-goto="${i}" aria-label="${esc(a.name)}"></button>`).join("")}</div>
        </div>
      </section>
      <div class="mobile-list">${apps.map((a) => `
        <article class="mcard" id="m-${esc(a.id)}">
          <div class="mscreen">${screenHTML(a, L)}</div>
          ${detailsHTML(a, L)}
        </article>`).join("")}</div>` : ""}
      ${cards.length ? `<section class="bento" id="${esc(c.bento.anchor || "about")}">${cards.map(cardHTML).join("")}</section>` : ""}
      ${c.footer.text ? `<footer><p class="mono">${lines(c.footer.text)}</p></footer>` : ""}`;

    $$("[data-goto]").forEach((el) => el.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(+el.dataset.goto);
    }));
    onScroll();
  }

  /* ---------- Scroll-driven showcase ---------- */

  const setActive = (i) => {
    if (i === active || !apps[i]) return;
    active = i;
    $$(".detail").forEach((d, j) => d.classList.toggle("on", j === i));
    $$(".nav-apps a").forEach((l, j) => l.classList.toggle("on", j === i));
    $$(".dots button").forEach((d, j) => d.classList.toggle("on", j === i));
  };

  // Hold each screen for a while, then slide to the next one
  const ease = (t) => t * t * (3 - 2 * t);
  const hold = (pos) => {
    const k = Math.floor(pos), f = pos - k;
    return k + ease(Math.min(1, Math.max(0, (f - 0.3) / 0.4)));
  };

  function onScroll() {
    const showcase = $("#showcase");
    if (!showcase) return;
    const n = apps.length;
    if (mobile.matches) {
      let best = 0, bestD = Infinity;
      $$(".mcard").forEach((card, j) => {
        const r = card.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - innerHeight / 2);
        if (d < bestD) { bestD = d; best = j; }
      });
      setActive(best);
      return;
    }
    const total = showcase.offsetHeight - innerHeight;
    const p = total > 0 ? Math.min(1, Math.max(0, -showcase.getBoundingClientRect().top / total)) : 0;
    const pos = p * Math.max(n - 1, 0);
    $(".strip").style.transform = `translateY(${(-hold(pos) * 100) / n}%)`;
    setActive(Math.round(pos));
  }

  function goTo(i, behavior = "smooth") {
    if (!apps[i]) return;
    if (mobile.matches) {
      document.getElementById(`m-${apps[i].id}`)?.scrollIntoView({ behavior, block: "center" });
      return;
    }
    const showcase = $("#showcase");
    const total = showcase.offsetHeight - innerHeight;
    const n = apps.length;
    scrollTo({ top: showcase.offsetTop + (n > 1 ? (total * i) / (n - 1) : 0), behavior });
  }

  addEventListener("scroll", () => requestAnimationFrame(onScroll), { passive: true });
  addEventListener("resize", onScroll);
  mobile.addEventListener("change", onScroll);

  /* ---------- Boot ---------- */

  // Inside the editor preview the content arrives by message, unsaved edits included
  if (new URLSearchParams(location.search).has("preview")) {
    document.documentElement.style.scrollBehavior = "auto";
    addEventListener("message", (e) => {
      if (e.origin !== location.origin) return;
      const m = e.data || {};
      if (m.type === "content") {
        const y = scrollY;
        render(m.content);
        scrollTo(0, y);
      } else if (m.type === "goto-app") {
        const i = apps.findIndex((a) => a.id === m.id);
        if (i >= 0) goTo(i, "auto");
      } else if (m.type === "goto") {
        const el = document.querySelector(m.selector);
        if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY - 20);
      }
    });
    parent.postMessage({ type: "preview-ready" }, location.origin);
  } else {
    // GitHub Pages caches files for up to 10 minutes: always ask for fresh content
    fetch(`content.json?v=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(render)
      .then(() => {
        const id = decodeURIComponent(location.hash.slice(1));
        if (!id) return;
        const i = apps.findIndex((a) => a.id === id);
        if (i >= 0) goTo(i, "auto");
        else document.getElementById(id)?.scrollIntoView();
      });
  }
})();
