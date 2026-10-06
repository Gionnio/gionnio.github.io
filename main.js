(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const mobile = matchMedia("(max-width: 900px)");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const lines = (s) => esc(s).replace(/\n/g, "<br>");
  const external = (url) => /^https?:/.test(url || "") ? ` target="_blank" rel="noopener"` : "";

  // Small Markdown subset for long texts: paragraphs, "- " lists, **bold**, *italic*, `code`, [links](url)
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => /^\s*javascript:/i.test(u) ? t
      : `<a href="${u}"${external(u.replace(/&amp;/g, "&"))}>${t}</a>`);
  const md = (s) => String(s ?? "").trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
    const rows = block.split("\n");
    return rows.every((r) => /^\s*[-•]\s+/.test(r))
      ? `<ul>${rows.map((r) => `<li>${inline(r.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`
      : `<p>${rows.map(inline).join("<br>")}</p>`;
  }).join("");

  const GITHUB_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.81.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

  // State shared between render() and the scroll handler
  let apps = [];
  let active = -1;
  let current = null; // app id when showing a project page
  const preview = new URLSearchParams(location.search).has("preview");

  const hasPage = (a) => a.page?.enabled;
  // Relative links: project pages use <base href="../">, so these work from both levels
  const pageHref = (a) => `${encodeURIComponent(a.id)}/`;
  const homeHref = (hash = "") => `./${hash}`;

  /* ---------- Shared templates ---------- */

  const screenHTML = (a, L) => `
    <div class="wall" style="--c1:${esc(a.color)};--c2:${esc(a.color2)}">
      ${a.shot
        ? `<img class="window" src="${esc(a.shot)}" alt="${esc(a.name)} screenshot" loading="lazy">`
        : `<div class="placeholder">${a.icon ? `<img src="${esc(a.icon)}" alt="">` : ""}<span>${esc(L.noShot)}</span></div>`}
    </div>`;

  const macbookHTML = (inner) => `
    <div class="macbook">
      <div class="lid"><div class="bezel"><div class="screen">
        <div class="notch"></div>${inner}
      </div></div></div>
      <div class="base"><span></span></div>
    </div>`;

  const badgeHTML = (a, L) => a.public
    ? `<span class="badge open">${esc(L.open)}</span>`
    : `<span class="badge soon">${esc(L.soon)}</span>`;

  const actionsHTML = (a, L) => a.public && (a.repo || a.download || a.web) ? `<div class="actions">
      ${a.web ? `<a class="btn" href="${esc(a.web)}"${external(a.web)}>${esc(L.web || "Open")}</a>` : ""}
      ${a.repo ? `<a class="btn${a.web ? " ghost" : ""}" href="${esc(a.repo)}"${external(a.repo)}>${esc(L.github)}</a>` : ""}
      ${a.download ? `<a class="btn ghost" href="${esc(a.download)}"${external(a.download)}>${esc(L.download)}</a>` : ""}
    </div>` : "";

  const detailsHTML = (a, L) => `
    <div class="app-head">
      ${a.icon ? `<img class="app-icon" src="${esc(a.icon)}" alt="">` : ""}
      <div><h2>${esc(a.name)}</h2>${badgeHTML(a, L)}</div>
    </div>
    ${a.tagline ? `<p class="tagline">${lines(a.tagline)}</p>` : ""}
    ${a.description ? `<p class="desc">${lines(a.description)}</p>` : ""}
    ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}
    ${a.tags?.length ? `<ul class="chips">${a.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    ${a.public && a.brew ? `<code class="cmd"><span>$</span> ${esc(a.brew)}</code>` : ""}
    ${actionsHTML(a, L)}
    ${hasPage(a) && L.more ? `<a class="more" href="${pageHref(a)}" data-page="${esc(a.id)}">${esc(L.more)}</a>` : ""}`;

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
          `<a href="${hasPage(a) ? pageHref(a) : `#${esc(a.id)}`}" ${hasPage(a) ? `data-page="${esc(a.id)}"` : `data-goto="${i}"`} title="${esc(a.name)}"><img src="${esc(a.icon)}" alt="${esc(a.name)}"></a>`).join("")}</div></article>`;
      default: {
        const big = (+c.rows || 1) > 1;
        return `<article class="card text${big ? " big" : ""}" ${style}>${kicker}
          ${c.title ? (big ? `<h2>${esc(c.title)}</h2>` : `<p class="card-title">${esc(c.title)}</p>`) : ""}
          ${c.text ? `<p class="${big ? "body" : "muted"}">${lines(c.text)}</p>` : ""}</article>`;
      }
    }
  };

  function sidebarHTML(c) {
    const s = c.sidebar;
    const appLink = (a, i) => current
      // On a project page every project opens its own page (or the home showcase if it has none)
      ? `<a href="${hasPage(a) ? pageHref(a) : homeHref(`#${esc(a.id)}`)}"${hasPage(a) ? ` data-page="${esc(a.id)}"` : ` data-home="#${esc(a.id)}"`} class="${a.id === current ? "on" : ""}">`
      : `<a href="#${esc(a.id)}" data-goto="${i}">`;
    const moreLink = (l) => current && l.url.startsWith("#")
      ? `<a href="${homeHref(esc(l.url))}" data-home="${esc(l.url)}">`
      : `<a href="${esc(l.url)}"${external(l.url)}>`;
    return `
      <a class="brand" href="${current ? homeHref() : "#top"}"${current ? ` data-home=""` : ""}>${esc(s.brand)}</a>
      <p class="brand-sub">${esc(s.subtitle)}</p>
      <nav>
        ${apps.length ? `<p class="nav-label">${esc(s.projectsLabel)}</p>
        <ul class="nav-apps">${apps.map((a, i) => `<li>${appLink(a, i)}
          ${a.icon ? `<img src="${esc(a.icon)}" alt="">` : ""}${esc(a.name)}</a></li>`).join("")}</ul>` : ""}
        ${s.links?.length ? `<p class="nav-label">${esc(s.moreLabel)}</p>
        <ul class="nav-more">${s.links.map((l) => `<li>${moreLink(l)}${esc(l.label)}</a></li>`).join("")}</ul>` : ""}
      </nav>
      <p class="sidebar-foot">${esc((s.copyright || "").replace("{year}", new Date().getFullYear()))}</p>`;
  }

  const footerHTML = (c) => c.footer.text ? `<footer><p class="mono">${lines(c.footer.text)}</p></footer>` : "";

  /* ---------- Home ---------- */

  function renderHome(c) {
    const L = c.showcase.labels;
    const n = Math.max(apps.length, 1);
    const h = c.hero;
    const cards = c.bento.cards.filter((k) => k.visible !== false);
    document.title = c.site.title;
    document.body.classList.remove("project");
    document.body.style.removeProperty("--accent");

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
          ${macbookHTML(`<div class="strip">${apps.map((a) => `<div class="slide">${screenHTML(a, L)}</div>`).join("")}</div>`)}
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
      ${footerHTML(c)}`;
  }

  /* ---------- Project page ---------- */

  const blockHTML = (b, a, i) => {
    const title = b.title ? `<h2>${esc(b.title)}</h2>` : "";
    switch (b.type) {
      case "quote":
        return `<section class="block quote">${b.title ? `<p class="mono">${esc(b.title)}</p>` : ""}<div class="quote-body">${md(b.text)}</div></section>`;
      case "features":
        return `<section class="block">${title}
          <div class="features">${(b.items || []).map((f) => `
            <div class="feature">${f.title ? `<h3>${esc(f.title)}</h3>` : ""}${md(f.text)}</div>`).join("")}</div></section>`;
      case "image":
        return b.image ? `<figure class="block shot${b.frame === "macbook" ? " framed" : ""}">
          ${b.frame === "macbook"
            ? macbookHTML(`<div class="wall" style="--c1:${esc(a.color)};--c2:${esc(a.color2)}"><img class="window" src="${esc(b.image)}" alt="${esc(b.caption)}"></div>`)
            : `<div class="wall plain" style="--c1:${esc(a.color)};--c2:${esc(a.color2)}"><img class="window" src="${esc(b.image)}" alt="${esc(b.caption)}" loading="lazy"></div>`}
          ${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>` : "";
      case "annotated": {
        if (!b.image) return "";
        // Pages generated by an older editor do not load sketch.js: show the plain screenshot
        if (!window.Sketch) return blockHTML({ ...b, type: "image", frame: "plain" }, a, i);
        const notes = (b.notes || []).filter((n) => n.text || n.kind);
        return `<figure class="block annotated" data-seed="${esc(a.id)}-${i}" data-notes="${esc(JSON.stringify(notes))}"${b.numbered ? " data-numbered" : ""}>
          ${title}
          <div class="ann-stage"><div class="ann-img" style="--c1:${esc(a.color)}"><img src="${esc(b.image)}" alt="${esc(b.caption || a.name)}"></div></div>
          ${notes.length ? `<ol class="ann-list">${notes.map((n) => `<li style="--dot:${esc(Sketch.color(n.color))}">${Sketch.noteHTML(n.text)}</li>`).join("")}</ol>` : ""}
          ${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
      }
      default:
        return `<section class="block text">${title}<div class="prose">${md(b.text)}</div></section>`;
    }
  };

  function renderProject(c, a) {
    const L = c.showcase.labels;
    const P = c.projectPage?.labels || {};
    const page = a.page || {};
    const withPages = apps.filter(hasPage);
    const next = withPages[(withPages.indexOf(a) + 1) % withPages.length];
    document.title = `${a.name} — ${c.sidebar.brand}`;
    document.body.classList.add("project");
    document.body.style.setProperty("--accent", a.color);

    $("#top").innerHTML = `
      <article class="project-page">
        <a class="back mono" href="${homeHref(`#${esc(a.id)}`)}" data-home="#${esc(a.id)}">${esc(P.back || "← All projects")}</a>
        <header class="project-head">
          <div class="app-head">
            ${a.icon ? `<img class="app-icon" src="${esc(a.icon)}" alt="">` : ""}
            <div><h2>${esc(a.name)}</h2>${badgeHTML(a, L)}</div>
          </div>
          ${a.tagline ? `<h1>${lines(a.tagline)}</h1>` : ""}
          ${page.intro ? `<div class="intro">${md(page.intro)}</div>` : a.description ? `<p class="intro">${lines(a.description)}</p>` : ""}
          ${a.public && a.brew ? `<code class="cmd"><span>$</span> ${esc(a.brew)}</code>` : ""}
          ${actionsHTML(a, L)}
          ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}
        </header>
        <div class="project-hero">${macbookHTML(screenHTML(a, L))}</div>
        ${(page.blocks || []).map((b, i) => (b.visible !== false ? blockHTML(b, a, i).replace(/^\s*<(\w+)/, `<$1 data-block="${i}"`) : "")).join("")}
        ${next && next !== a ? `
        <a class="next" href="${pageHref(next)}" data-page="${esc(next.id)}">
          <span class="mono">${esc(P.next || "Next project")}</span>
          <span class="next-name">${next.icon ? `<img src="${esc(next.icon)}" alt="">` : ""}${esc(next.name)} →</span>
        </a>` : ""}
      </article>
      ${footerHTML(c)}`;
  }

  /* ---------- Render ---------- */

  let content = null;
  function render(c, pageId = current) {
    content = c;
    apps = c.apps.filter((a) => a.visible !== false && (a.public || c.showcase.showPrivate));
    const a = pageId && apps.find((x) => x.id === pageId && hasPage(x));
    current = a ? a.id : null;
    active = -1;
    $('meta[name="description"]').setAttribute("content", a ? (a.tagline || a.description) : c.site.description);
    $("#sidebar").innerHTML = sidebarHTML(c);
    if (a) renderProject(c, a); else renderHome(c);

    $$("[data-goto]").forEach((el) => el.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(+el.dataset.goto);
    }));
    // The editor preview has no generated folders: switch view in place instead of navigating
    if (preview) {
      $$("[data-page]").forEach((el) => el.addEventListener("click", (e) => {
        e.preventDefault();
        render(content, el.dataset.page);
        scrollTo(0, 0);
      }));
      $$("[data-home]").forEach((el) => el.addEventListener("click", (e) => {
        e.preventDefault();
        render(content, null);
        jumpTo(el.dataset.home.slice(1));
      }));
    }
    onScroll();
    if (current && window.Sketch) Sketch.layoutAll($("#top"));
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

  // Scroll to a project in the showcase or to any element id
  function jumpTo(id) {
    if (!id) return scrollTo(0, 0);
    const i = apps.findIndex((a) => a.id === id);
    if (i >= 0) goTo(i, "auto");
    else document.getElementById(id)?.scrollIntoView();
  }

  addEventListener("scroll", () => requestAnimationFrame(onScroll), { passive: true });
  addEventListener("resize", onScroll);
  mobile.addEventListener("change", onScroll);

  /* ---------- Boot ---------- */

  // Inside the editor preview the content arrives by message, unsaved edits included
  if (preview) {
    document.documentElement.style.scrollBehavior = "auto";
    addEventListener("message", (e) => {
      if (e.origin !== location.origin) return;
      const m = e.data || {};
      if (m.type === "content") {
        const y = scrollY;
        render(m.content);
        scrollTo(0, y);
      } else if (m.type === "show-home") {
        if (current) render(content, null);
        jumpTo(m.id);
      } else if (m.type === "show-page") {
        const same = current === m.id;
        render(content, m.id);
        if (!same) scrollTo(0, 0);
        if (m.block != null) $(`.project-page [data-block="${m.block}"]`)?.scrollIntoView({ block: "center" });
      } else if (m.type === "goto") {
        if (current) render(content, null);
        const el = document.querySelector(m.selector);
        if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY - 20);
      }
    });
    parent.postMessage({ type: "preview-ready" }, location.origin);
  } else {
    // Project pages are generated folders (<id>/index.html) that declare which project they show
    const pageId = document.body.dataset.project || null;
    // GitHub Pages caches files for up to 10 minutes: always ask for fresh content
    fetch(`content.json?v=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => render(c, pageId))
      .then(() => { if (!current) jumpTo(decodeURIComponent(location.hash.slice(1))); });
  }
})();
