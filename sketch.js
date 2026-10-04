// Hand-drawn "crayon" annotations over screenshots, shared by the site and the editor.
// A note: { kind: circle|underline|arrow|dot, x, y, w, h (percent of the image), side: auto|left|right, color, text }
(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const COLORS = { red: "#E5484D", orange: "#F2830D", yellow: "#E8B100", green: "#2FA36B", blue: "#3E7BFA", purple: "#8B5CF6" };
  const color = (c) => COLORS[c] || c || COLORS.red;

  // Deterministic randomness: the same note is always drawn the same way
  const prng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

  // Smooth curve through points (Catmull-Rom to cubic Bézier)
  const curve = (p) => {
    let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };

  // A loop that overshoots and does not quite close, like a circle drawn by hand
  const loop = (cx, cy, rx, ry, rnd) => {
    const start = -2.5 + rnd() * 0.7, sweep = Math.PI * 2 + 0.45 + rnd() * 0.35, n = 28, pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), a = start + sweep * t, k = 1 + (rnd() - 0.5) * 0.05 + 0.08 * t;
      pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]);
    }
    return curve(pts);
  };
  const wave = (x1, x2, y, rnd) => {
    const n = Math.max(4, Math.round((x2 - x1) / 14)), pts = [];
    for (let i = 0; i <= n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y + Math.sin(i * 1.4) * 1.6 + (rnd() - 0.5) * 1.6]);
    return curve(pts);
  };
  const stroke = (a, b, rnd) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const bow = len * (0.08 + rnd() * 0.06) * (rnd() > 0.5 ? 1 : -1);
    const c = [(a[0] + b[0]) / 2 - (dy / len) * bow, (a[1] + b[1]) / 2 + (dx / len) * bow];
    return { d: `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`, c };
  };
  const head = (tip, from, size = 11) => {
    const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const wing = (s) => [tip[0] - size * Math.cos(ang + s), tip[1] - size * Math.sin(ang + s)];
    const [l, r] = [wing(0.5), wing(-0.45)];
    return `M${l[0].toFixed(1)} ${l[1].toFixed(1)} L${tip[0].toFixed(1)} ${tip[1].toFixed(1)} L${r[0].toFixed(1)} ${r[1].toFixed(1)}`;
  };

  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent?.appendChild(e);
    return e;
  };

  // Crayon texture: wobble the line a little and punch tiny gaps into it
  function defs(svg, id) {
    const d = el("defs", {}, svg);
    const f = el("filter", { id, x: "-5%", y: "-5%", width: "110%", height: "110%" }, d);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: "2", seed: "4", result: "noise" }, f);
    el("feDisplacementMap", { in: "SourceGraphic", in2: "noise", scale: "2.2", xChannelSelector: "R", yChannelSelector: "G", result: "wobble" }, f);
    el("feColorMatrix", { in: "noise", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.75", result: "grain" }, f);
    el("feComposite", { in: "wobble", in2: "grain", operator: "in" }, f);
  }

  /**
   * Draw the marks of `notes` into `svg`. `box` is the image rectangle in the svg's pixels.
   * Returns, for every note, its geometry and a function giving the point where a connector should end.
   */
  function drawMarks(svg, notes, box, { numbered = false, seed = 1, filterId = "crayon" } = {}) {
    if (!svg.querySelector(`#${filterId}`)) defs(svg, filterId);
    const g = el("g", { filter: `url(#${filterId})`, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    return notes.map((n, i) => {
      const rnd = prng(seed * 977 + i * 131 + hash(n.kind));
      const col = color(n.color);
      const cx = box.x + (box.w * (+n.x || 0)) / 100, cy = box.y + (box.h * (+n.y || 0)) / 100;
      const rx = Math.max(6, (box.w * (+n.w || 10)) / 200), ry = Math.max(5, (box.h * (+n.h || 8)) / 200);
      const width = Math.max(2.4, Math.min(4, box.w / 260));
      const line = (d, w = width, o = 0.92) => el("path", { d, stroke: col, "stroke-width": w, opacity: o }, g);
      let edge, badge;
      if (n.kind === "underline") {
        const x1 = cx - rx * 1, x2 = cx + rx * 1;
        line(wave(x1, x2, cy, rnd));
        line(wave(x1 + 6, x2 - 3, cy + 3.5, rnd), width * 0.7, 0.75);
        edge = (p) => (Math.abs(p[0] - x1) < Math.abs(p[0] - x2) ? [x1 - 4, cy] : [x2 + 4, cy]);
        badge = [x1 - 4, cy - 14];
      } else if (n.kind === "arrow") {
        edge = () => [cx, cy];
        badge = [cx - 16, cy - 16];
      } else if (n.kind === "dot") {
        line(loop(cx, cy, 9, 9, rnd));
        edge = (p) => { const a = Math.atan2(p[1] - cy, p[0] - cx); return [cx + 13 * Math.cos(a), cy + 13 * Math.sin(a)]; };
        badge = null;
      } else {
        line(loop(cx, cy, rx, ry, rnd));
        line(loop(cx, cy, rx * 1.04, ry * 1.06, prng(seed + i * 7 + 3)), width * 0.6, 0.6);
        edge = (p) => {
          const t = Math.atan2((p[1] - cy) / ry, (p[0] - cx) / rx);
          return [cx + rx * 1.12 * Math.cos(t), cy + ry * 1.12 * Math.sin(t)];
        };
        badge = [cx + (rx + 12) * Math.cos(-2.35), cy + (ry + 12) * Math.sin(-2.35)];
      }
      // Step number: a crayon disc with the number written on it
      if (numbered) {
        const [bx, by] = n.kind === "dot" ? [cx, cy] : badge;
        // The number disc stays crisp (outside the crayon filter) so it is always readable
        el("circle", { cx: bx, cy: by, r: 9.5, fill: col }, svg);
        const t = el("text", { x: bx, y: by + 5, "text-anchor": "middle", class: "sketch-num" }, svg);
        t.textContent = i + 1;
      }
      return { note: n, i, cx, cy, col, edge, width };
    });
  }

  // Connector from a label to its mark, with an arrow head for "arrow" notes
  function connect(svg, from, mark, filterId = "crayon") {
    const g = svg.querySelector(`g[filter="url(#${filterId})"]`) || svg;
    const rnd = prng(mark.i * 53 + 11);
    const to = mark.edge(from);
    const s = stroke(from, to, rnd);
    el("path", { d: s.d, stroke: mark.col, "stroke-width": mark.width * 0.8, fill: "none", opacity: 0.85, "stroke-linecap": "round" }, g);
    if (mark.note.kind === "arrow") el("path", { d: head(to, s.c), stroke: mark.col, "stroke-width": mark.width * 0.9, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
  }

  const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const noteHTML = (s) => escapeHTML(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");

  /* ---------- Site: lay out an annotated figure ---------- */

  let figureCount = 0;
  function layout(fig) {
    const stage = fig.querySelector(".ann-stage"), img = stage.querySelector("img");
    if (!img.complete || !img.naturalWidth) return img.addEventListener("load", () => layout(fig), { once: true });
    const notes = JSON.parse(fig.dataset.notes || "[]");
    const numbered = fig.hasAttribute("data-numbered");
    const narrow = matchMedia("(max-width: 900px)").matches;
    fig.dataset.id ??= `crayon-${++figureCount}`;
    stage.querySelectorAll(".ann-svg, .ann-label").forEach((x) => x.remove());
    stage.style.minHeight = "";

    const sr = stage.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const box = { x: ir.left - sr.left, y: ir.top - sr.top, w: ir.width, h: ir.height };
    const svg = el("svg", { class: "ann-svg", width: sr.width, height: sr.height, viewBox: `0 0 ${sr.width} ${sr.height}` }, stage);
    const marks = drawMarks(svg, notes, box, { numbered: numbered || narrow, seed: hash(fig.dataset.seed || ""), filterId: fig.dataset.id });
    if (narrow) return; // On phones the notes are listed under the image

    // Labels in the side gutters, stacked so they never overlap
    const gutter = Math.max(0, box.x - 18);
    for (const side of ["left", "right"]) {
      const mine = marks.filter((m) => (m.note.side === side) || (!["left", "right"].includes(m.note.side) && (side === "left") === (+m.note.x < 50)));
      let bottom = -Infinity;
      mine.sort((a, b) => a.cy - b.cy).forEach((m) => {
        const label = document.createElement("div");
        label.className = `ann-label ${side}`;
        label.style.color = m.col;
        label.style.width = `${gutter}px`;
        label.innerHTML = `${numbered ? `<b>${m.i + 1}.</b> ` : ""}${noteHTML(m.note.text)}`;
        stage.appendChild(label);
        const hgt = label.offsetHeight;
        const top = Math.max(m.cy - hgt / 2, bottom + 12, 0);
        label.style.top = `${top}px`;
        label.style[side] = "0px";
        bottom = top + hgt;
        const anchorX = side === "left" ? gutter + 4 : sr.width - gutter - 4;
        connect(svg, [anchorX, top + Math.min(hgt / 2, 14)], m, fig.dataset.id);
      });
      if (bottom > stage.clientHeight) stage.style.minHeight = `${bottom + 8}px`;
    }
  }

  let timer;
  const layoutAll = (root = document) => root.querySelectorAll("figure.annotated").forEach(layout);
  addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(layoutAll, 120); });
  document.fonts?.ready.then(() => layoutAll());

  window.Sketch = { COLORS, color, hash, drawMarks, connect, layout, layoutAll, noteHTML };
})();
