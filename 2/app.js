// Fibonacci Castles :: reactor console frontend.
//
// Two pages.  The explorer draws one castle of height 2 at a time and says
// which families it belongs to.  The tracker never draws a castle: it counts
// the Fibonacci castles exactly at widths far past drawing, and shows the
// parity difference S_F(w) cycling with period 6.

import * as C from "./castles.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n) => n.toLocaleString("en-US");

// Digit groups by hand: a regex lookahead is quadratic on 20,000 digits.
function group(n) {
  const neg = n < 0n, s = (neg ? -n : n).toString();
  const parts = [];
  for (let end = s.length; end > 0; end -= 3) parts.push(s.slice(Math.max(0, end - 3), end));
  return (neg ? "−" : "") + parts.reverse().join(",");
}
const digitCount = (n) => (n < 0n ? -n : n).toString().length;
const digitsText = (n) => { const d = digitCount(n); return `${fmt(d)} digit${d === 1 ? "" : "s"}`; };
const S = { reduced: false, bricks: true };

// ------------------------------------------------------------------------
// Rails (role="slider"): amber thumb, zones and cyan ticks on the rail
// ------------------------------------------------------------------------

// The rail spans min … max, evenly or, with log, evenly in log v.
function makeRail(railId, numId, { min, max, log = false, page, valueText, onSet }) {
  const el = $(railId);
  const thumb = el.querySelector(".thumb");
  const num = $(numId);
  let value = min;
  const frac = (v) => clamp(log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min), 0, 1);
  const atFrac = (f) => (log ? min * (max / min) ** f : min + f * (max - min));

  function show(v) {
    value = v;
    thumb.style.left = frac(v) * 100 + "%";
    el.setAttribute("aria-valuenow", v);
    el.setAttribute("aria-valuetext", valueText(v));
    if (document.activeElement !== num) num.value = v;
  }
  function set(v) {
    v = clamp(Math.round(v), min, max);
    num.value = v;
    if (v === value) return;
    show(v);
    onSet(v);
  }
  const fromX = (x) => { const b = el.getBoundingClientRect(); return atFrac(clamp((x - b.left) / b.width, 0, 1)); };

  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); el._drag = true; set(fromX(e.clientX)); });
  el.addEventListener("pointermove", (e) => { if (el._drag) set(fromX(e.clientX)); });
  const end = () => { el._drag = false; };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("keydown", (e) => {
    let v = value, hit = true;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") v += 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v -= 1;
    else if (e.key === "PageUp") v += page;
    else if (e.key === "PageDown") v -= page;
    else if (e.key === "Home") v = min;
    else if (e.key === "End") v = max;
    else hit = false;
    if (hit) { e.preventDefault(); set(v); }
  });
  num.parentElement.querySelectorAll("[data-step]").forEach((b) => {
    b.addEventListener("click", () => set(value + Number(b.dataset.step)));
  });
  // Typed values commit on Enter or blur, so "12" doesn't fire for "1" first.
  num.addEventListener("keydown", (e) => { if (e.key === "Enter") num.blur(); });
  num.addEventListener("blur", () => set(parseInt(num.value, 10) || value));

  // zone: { a, b, cls, title } in value units, inclusive; ticks: [{ v, label }]
  function mark(zones, ticks = []) {
    el.querySelector(".zones").innerHTML = zones.map((r) => {
      const left = frac(r.a - 0.5) * 100, right = frac(r.b + 0.5) * 100;
      return `<span class="zone ${r.cls}" style="left:${left}%;width:${right - left}%" title="${r.title}"></span>`;
    }).join("");
    el.querySelector(".ticks").innerHTML = ticks.map((t) =>
      `<span class="tick" style="left:${frac(t.v) * 100}%">${t.label ? `<b>${t.label}</b>` : ""}</span>`).join("");
  }
  return { show, set, mark, get value() { return value; } };
}

// ------------------------------------------------------------------------
// Page 1: explorer
// ------------------------------------------------------------------------

const XW_MAX = 40;
const CATALOG_MAX = 10;

const X = {
  c: [2, 1, 2, 1, 2, 1, 2, 1],
  source: "ALTERNATE",
  sheet: null,
  geom: null,
  cursor: -1,        // keyboard column
  hover: -1,         // column under the pointer
  hoverRow: -1,      // and its row, 0 at the base
  down: false,
  paint: 0,          // the height a drag paints
  f: {},
};

function makeSheet(c) {
  const h = C.height(c), w = c.length;
  const blocks = C.blocks(c);
  const fibBreaks = C.fibonacciBreaks(c), ridgeBreaks = C.ridgeBreaks(c);
  const h2 = h === 2;
  const fib = h2 && fibBreaks.length === 0, ridge = h2 && ridgeBreaks.length === 0;
  return { c, w, h, h2, blocks, even: blocks % 2 === 0, fibBreaks, ridgeBreaks, fib, ridge, rank: fib ? C.rank(c) : 0 };
}

// ---- the field -----------------------------------------------------------

// Drawn as prototype3 draws its field: flat cells on a 1px gutter grid, the
// cell size fitted to the bay, each block one brick, an air row above the
// ceiling.  Cells where a rule breaks are tinted amber.
const STONE  = "#D4CDB7";   // filled cell
const EMPTY  = "#0E1412";   // empty cell below the ceiling
const AIR    = "#070A09";   // the row above the ceiling
const GUTTER = "#1A2421";   // 1px grid between cells
const STONE_BREAK = "#E3BA7C";   // a cell of a 2 × 2 square
const EMPTY_BREAK = "#3D2D13";   // a cell of a notch two cells wide
const RED = "#FF5240";           // the cell under the pointer or keyboard cursor
const RED_BAND = "rgba(255,82,64,.13)";
const CELL_MIN = 6, CELL_MAX = 56, ROWS = 3;

function drawField() {
  const sh = X.sheet, w = sh.w, c = sh.c;
  const cv = $("field"), ctx = cv.getContext("2d");
  const sp = 1;
  const maxW = Math.max(160, $("x-wrap").clientWidth - 28);
  const cell = clamp(Math.floor((maxW - sp) / w) - sp, CELL_MIN, CELL_MAX);
  const stride = cell + sp, fw = sp + w * stride, fh = sp + ROWS * stride;
  if (cv.width !== fw) cv.width = fw;
  if (cv.height !== fh) cv.height = fh;
  const cx = (i) => sp + i * stride, cy = (r) => sp + (ROWS - 1 - r) * stride;   // row 0 is the base

  const sq = new Set(), notch = new Set();
  for (const i of sh.fibBreaks) for (const k of [i, i + 1]) { sq.add(`${k},0`); sq.add(`${k},1`); }
  for (const i of sh.ridgeBreaks) { notch.add(i); notch.add(i + 1); }

  ctx.fillStyle = GUTTER;
  ctx.fillRect(0, 0, fw, fh);
  for (let i = 0; i < w; i++) {
    for (let r = 0; r < ROWS; r++) {
      const alive = r < c[i];
      ctx.fillStyle = alive ? (sq.has(`${i},${r}`) ? STONE_BREAK : STONE) : r === 2 ? AIR : notch.has(i) ? EMPTY_BREAK : EMPTY;
      ctx.fillRect(cx(i), cy(r), cell, cell);
    }
  }
  // Bricks: the gutter between two filled cells of one row is filled too.
  for (let r = 0; r < (S.bricks ? 2 : 0); r++) {
    for (let i = 0; i + 1 < w; i++) {
      if (r < c[i] && r < c[i + 1]) {
        ctx.fillStyle = sq.has(`${i},${r}`) && sq.has(`${i + 1},${r}`) ? STONE_BREAK : STONE;
        ctx.fillRect(cx(i) + cell, cy(r), sp, cell);
      }
    }
  }

  const col = X.cursor >= 0 ? X.cursor : X.hover;
  const row = X.cursor >= 0 ? c[X.cursor] - 1 : X.hoverRow;
  const at = col >= 0 && col < w && row >= 0 && row < ROWS;
  if (at) {
    ctx.fillStyle = RED_BAND;
    ctx.fillRect(cx(col), 0, cell, fh);
    ctx.fillRect(0, cy(row), fw, cell);
  }
  // Ceiling: a dashed amber line along the top of row 2.
  ctx.fillStyle = AMBER;
  for (let x = 0; x < fw; x += 8) ctx.fillRect(x, cy(1) - 2, 5, 2);
  if (at) {
    const lw = cell >= 10 ? 2 : 1, x = cx(col), y = cy(row);
    ctx.save();
    ctx.shadowColor = RED;
    ctx.shadowBlur = Math.max(6, cell * 0.6);
    ctx.fillStyle = "rgba(255,82,64,.35)";
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = RED;
    ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, cell - lw, cell - lw);
    ctx.restore();
  }
  X.geom = { sp, stride };

  const where = at ? ` · <span class="ptr">column ${col + 1}, row ${row + 1}</span>` : "";
  $("x-fieldsub").innerHTML = `w = ${w} · ceiling h = 2${where}`;
}

// Pointer -> [column, row] in castle coordinates (row 0 is the base).
function cellAt(e) {
  const cv = $("field"), r = cv.getBoundingClientRect();
  const px = (e.clientX - r.left) * (cv.width / r.width) - X.geom.sp;
  const py = (e.clientY - r.top) * (cv.height / r.height) - X.geom.sp;
  return [clamp(Math.floor(px / X.geom.stride), 0, X.sheet.w - 1), clamp(ROWS - 1 - Math.floor(py / X.geom.stride), 0, ROWS - 1)];
}

// ---- readouts ------------------------------------------------------------

function buildExplorer() {
  $("bay-explorer").querySelectorAll("[data-f]").forEach((el) => { X.f[el.dataset.f] = el; });
}

// ---- annunciator, above the field ----------------------------------------

// The castle's families and parity, notifications in amber: neither family
// and neither parity is a fault.
const ALARMS = [
  { id: "fib",   t: "Fibonacci castle",  s: "no two neighboring columns of height 2", c: () => X.sheet.fib },
  { id: "ridge", t: "Ridge castle",      s: "no two neighboring columns of height 1", c: () => X.sheet.ridge },
  { id: "even",  t: "Even-block castle", s: "an even number of blocks", c: () => X.sheet.even },
  { id: "odd",   t: "Odd-block castle",  s: "an odd number of blocks", c: () => !X.sheet.even },
];

function buildAnn() {
  $("ann").innerHTML = ALARMS.map((a) => `<div class="tile" id="an-${a.id}"><span>${a.t}</span><small>${a.s}</small></div>`).join("");
  ALARMS.forEach((a) => { a.el = $("an-" + a.id); a.cls = "tile"; });
}

// Each tile is lit while its condition holds and dark otherwise.
function updAnn() {
  ALARMS.forEach((a) => {
    const cls = "tile" + (a.c() ? " am" : "");
    if (cls !== a.cls) { a.cls = cls; a.el.className = cls; }
  });
}

function renderExplorer() {
  const sh = X.sheet, f = X.f, w = sh.w;
  const m = sh.c.filter((v) => v === 2).length;

  f.blocks.textContent = fmt(sh.blocks);
  f.parity.textContent = sh.even ? "Even-block" : "Odd-block";
  f.parity.className = "pill am";
  const runs = sh.blocks - 1;
  f["blocks-note"].innerHTML = !sh.h2
    ? "The flat skyline (1, …, 1): the bottom row alone, one block. It is a castle of height 1, so no count of castles of height 2 includes it."
    : sh.fib
      ? `The bottom row is one block, and each of the m = ${m} columns of height 2 is a block of its own, PE502-2 Lemma 8: 1 + ${m} = ${sh.blocks}. So a Fibonacci castle has an even number of blocks exactly when m is odd.`
      : `The bottom row is one block, and the second row has ${runs} run${runs === 1 ? "" : "s"} of cells: 1 + ${runs} = ${sh.blocks}, the total descent of the padded skyline, eq. (1.2).`;

  updAnn();

  f["counts-sub"].textContent = `this castle: w = ${w}, h = 2`;
  const cf = C.closedForm(w), a2 = C.allHeight2(w);
  for (const [key, n, lit] of [["all", a2.all, sh.h2], ["even", a2.even, sh.h2 && sh.even], ["odd", a2.odd, sh.h2 && !sh.even]]) {
    f[key + "-num"].textContent = group(n);
    f[key + "-w"].textContent = w;
    f[key + "-lamp"].classList.toggle("on", lit);
  }

  // Zeckendorf rank
  const total = Number(cf.AF);
  if (sh.fib) {
    const terms = [], idx = [];
    sh.c.forEach((v, i) => { if (v === 2) { terms.push(C.weight(w, i + 1)); idx.push(`F<sub>${w + 1 - i}</sub>`); } });
    f.rank.textContent = fmt(sh.rank);
    f["rank-of"].innerHTML = `of ${fmt(total)}`;
    f["rank-note"].innerHTML = `${fmt(sh.rank)}${terms.length > 1 ? " = " + terms.map(fmt).join(" + ") : ""} = ${idx.join(" + ")}, its Zeckendorf representation, with ${terms.length} term${terms.length === 1 ? "" : "s"}. Fibonacci string ${sh.c.map((v) => v - 1).join("")}, the towers left when the bottom row is removed.`;
  } else {
    f.rank.textContent = "—";
    f["rank-of"].textContent = "";
    f["rank-note"].innerHTML = "Only Fibonacci castles have a rank, and this castle is not one.";
  }
  $("rankDown").disabled = !sh.fib || sh.rank <= 1;
  $("rankUp").disabled = !sh.fib || sh.rank >= total;

  const fam = [sh.fib && "FIBONACCI", sh.ridge && "RIDGE"].filter(Boolean).join(" · ") || (sh.h2 ? "NEITHER FAMILY" : "HEIGHT 1");
  $("x-stamp").textContent = `EXPLORER · ${w} × 2 · ${fmt(sh.blocks)} BLOCK${sh.blocks === 1 ? "" : "S"} · ${sh.even ? "EVEN" : "ODD"}-BLOCK · ${fam} · ${X.source}`;
}

// ---- catalog -------------------------------------------------------------

const CAT = { key: "" };

function thumbSVG(c, t) {
  const g = 1, s = t + g, out = [];
  for (const r of [1, 2]) {
    for (let i = 0; i < c.length;) {
      if (c[i] < r) { i++; continue; }
      let j = i;
      while (j + 1 < c.length && c[j + 1] >= r) j++;
      out.push(`<rect x="${i * s}" y="${(2 - r) * s}" width="${(j - i + 1) * s - g}" height="${t}"/>`);
      i = j + 1;
    }
  }
  return `<svg width="${c.length * s - g}" height="${2 * s - g}" aria-hidden="true">${out.join("")}</svg>`;
}

function renderCatalog() {
  const sh = X.sheet, w = sh.w;
  const key = `${w}:${sh.rank}`;
  if (key === CAT.key) return;
  CAT.key = key;
  const box = $("catalog");
  const cf = C.closedForm(w);
  if (w > CATALOG_MAX) {
    $("cat-sub").textContent = `width ${w} · drawn up to width ${CATALOG_MAX}`;
    box.innerHTML = `<div class="cat-none">${group(cf.AF)} Fibonacci castles at width ${w}: too many to draw. The catalog draws them up to width ${CATALOG_MAX}; the Parity tracker counts them at any width.</div>`;
    return;
  }
  const all = C.fibonacciCastles(w);
  const t = w <= 6 ? 9 : 7;
  const cols = { even: [], odd: [] };
  all.forEach((c, i) => {
    const rank = i + 1, even = C.blocks(c) % 2 === 0;
    cols[even ? "even" : "odd"].push(`<button class="thumbc${rank === sh.rank ? " on" : ""}" data-rank="${rank}" title="Rank ${rank}: skyline (${c.join(", ")}), ${C.blocks(c)} blocks">${thumbSVG(c, t)}<span>${rank}</span></button>`);
  });
  const ne = cols.even.length, no = cols.odd.length;
  $("cat-sub").textContent = `width ${w} · ${all.length} Fibonacci castles`;
  box.innerHTML =
    `<div class="cat-col"><div class="cat-head"><span class="klab">Even-block</span><span class="n">${ne}</span></div><div class="cat-grid">${cols.even.join("")}</div></div>` +
    `<div class="cat-col"><div class="cat-head"><span class="klab">Odd-block</span><span class="n">${no}</span></div><div class="cat-grid">${cols.odd.join("")}</div></div>` +
    `<div class="cat-check"><span>${ne} even-block, ${no} odd-block: ${ne} − ${no} = ${ne - no} = S<sub>F</sub>(${w}).</span></div>`;
}

// ---- refresh and controls ------------------------------------------------

function refreshExplorer() {
  X.sheet = makeSheet(X.c);
  if (X.cursor >= X.sheet.w) X.cursor = X.sheet.w - 1;
  drawField();
  renderExplorer();
  renderCatalog();
  writeHash();
}

function setCastle(c, source) {
  X.c = c.slice();
  X.source = source;
  xRail.show(X.c.length);
  refreshExplorer();
}

function generate(kind) {
  const w = X.c.length;
  if (kind === "height2") setCastle(C.randomHeight2(w), "RANDOM · HEIGHT 2");
  else if (kind === "fibonacci") setCastle(C.randomFibonacci(w), "RANDOM · FIBONACCI");
  else if (kind === "ridge") setCastle(C.randomRidge(w), "RANDOM · RIDGE");
  else if (kind === "exchange") setCastle(C.exchange(X.c), "EXCHANGED");
  else if (kind === "alternate") setCastle(Array.from({ length: w }, (_, i) => (i % 2 ? 1 : 2)), "ALTERNATE");
  else if (kind === "flat") setCastle(new Array(w).fill(1), "FLAT");
}

function stepRank(by) {
  const sh = X.sheet;
  if (!sh.fib) return;
  const r = sh.rank + by;
  if (r < 1 || r > Number(C.closedForm(sh.w).AF)) return;
  setCastle(C.unrank(r, sh.w), `RANK ${r}`);
}

const xRail = makeRail("xw-rail", "xw-num", {
  min: 1, max: XW_MAX, page: 10,
  valueText: (v) => `width ${v} column${v === 1 ? "" : "s"}`,
  onSet: (v) => {
    while (X.c.length < v) X.c.push(1);
    X.c.length = v;
    X.source = "HAND-DRAWN";
    refreshExplorer();
  },
});

function initExplorer() {
  buildExplorer();
  buildAnn();
  const svg = $("field");   // the field canvas

  const paintAt = (col) => {
    if (X.c[col] === X.paint) return;
    X.c[col] = X.paint;
    X.source = "HAND-DRAWN";
    refreshExplorer();
  };
  svg.addEventListener("pointerdown", (e) => {
    const [col, row] = cellAt(e);
    svg.setPointerCapture(e.pointerId);
    X.down = true;
    X.cursor = -1;
    X.hover = col;
    X.hoverRow = row;
    X.paint = 3 - X.c[col];
    paintAt(col);
  });
  svg.addEventListener("pointermove", (e) => {
    const [col, row] = cellAt(e);
    if (X.down) { X.hover = col; X.hoverRow = row; paintAt(col); return; }
    if (col !== X.hover || row !== X.hoverRow) { X.hover = col; X.hoverRow = row; drawField(); }
  });
  const end = () => { X.down = false; };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("pointerleave", () => { if (!X.down && X.hover >= 0) { X.hover = -1; drawField(); } });
  svg.addEventListener("keydown", (e) => {
    const w = X.c.length;
    let col = X.cursor >= 0 ? X.cursor : Math.max(0, X.hover);
    let to = null;
    if (e.key === "ArrowLeft") col = Math.max(0, col - 1);
    else if (e.key === "ArrowRight") col = Math.min(w - 1, col + 1);
    else if (e.key === "ArrowUp") to = 2;
    else if (e.key === "ArrowDown") to = 1;
    else if (e.key === " " || e.key === "Enter") to = 3 - X.c[col];
    else return;
    e.preventDefault();
    X.cursor = col;
    if (to !== null && X.c[col] !== to) { X.c[col] = to; X.source = "HAND-DRAWN"; refreshExplorer(); }
    else drawField();
  });
  svg.addEventListener("blur", () => { if (X.cursor >= 0) { X.cursor = -1; drawField(); } });

  document.querySelectorAll("[data-gen]").forEach((b) => b.addEventListener("click", () => generate(b.dataset.gen)));
  $("rankDown").addEventListener("click", () => stepRank(-1));
  $("rankUp").addEventListener("click", () => stepRank(1));
  $("catalog").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rank]");
    if (b) setCastle(C.unrank(Number(b.dataset.rank), X.c.length), `CATALOG · RANK ${b.dataset.rank}`);
  });
  xRail.show(X.c.length);
}

// ------------------------------------------------------------------------
// Page 2: parity tracker
// ------------------------------------------------------------------------

const TW_MAX = 100000;
const HIST = 36;                        // six periods
const SWEEPS = [[0, "Off", "Off"], [1, "1", "1 width per second"], [2, "2", "2 widths per second"], [6, "6", "6 widths per second"], [30, "30", "30 widths per second"]];

const T = { w: 36, sweep: 0, lastSweep: 2, timer: 0 };

function buildTracker() {
  const row = (key, name, desc) =>
    `<div class="count nolamp"><span class="cname">${name}</span><span class="digits" id="${key}-d"></span><div class="well numwell" id="${key}-n">—</div><span class="cdesc">${desc}</span></div>`;
  $("t-counts").innerHTML =
    row("tF", "A<sub>F</sub>(w)", "All Fibonacci castles of width w: F<sub>w+2</sub> − 1, Theorem 2.") +
    row("tFe", "A<sup>e</sup><sub>F</sub>(w)", "Those with an even number of blocks.") +
    row("tFo", "A<sup>o</sup><sub>F</sub>(w)", "Those with an odd number of blocks.") +
    row("tS", "S<sub>F</sub>(w)", "A<sup>e</sup><sub>F</sub>(w) − A<sup>o</sup><sub>F</sub>(w), the S<sub>F</sub> at the center of the hexagon.");
  buildHex();

  $("sweepSeg").innerHTML = SWEEPS.map(([v, t, label]) => `<button data-v="${v}" aria-label="${label}" aria-pressed="${v === 0}">${t}</button>`).join("");
  $("sweepSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setSweep(Number(b.dataset.v)); });
  document.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => {
    const j = b.dataset.jump;
    tRail.set(j === "x10" ? T.w * 10 : T.w + Number(j));
  }));

  tRail.mark([], [[10, "10"], [100, "100"], [1000, "1k"], [10000, "10k"]].map(([v, label]) => ({ v, label })));
  tRail.show(T.w);
}

// ---- waveform ------------------------------------------------------------

function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  return [ctx, r.width, r.height];
}

const INK = "#DDD7C3", FAINT = "#9AA196", HAIR = "rgba(196,226,210,.12)", CYAN = "#74DBCF", AMBER = "#FFB347";

// S_F at the widths lo … lo + 35: bars for the exact counts up to w, a thin
// cyan mark at each width's predicted value.
function renderWave() {
  const cv = $("wave");
  if (!cv.offsetParent) return;          // its page is hidden
  const w = T.w, lo = Math.max(1, w - HIST + 1);
  const counts = C.transferRange(lo, w, "fibonacci");
  const [ctx, W, H] = fitCanvas(cv);
  ctx.font = '12px "Share Tech Mono", ui-monospace, monospace';
  const padL = 30, padR = 10, padT = 12, padB = 22;
  const slot = (W - padL - padR) / HIST;
  const yv = (v) => padT + (2.25 - v) / 2.25 * (H - padT - padB);
  ctx.strokeStyle = HAIR;
  ctx.fillStyle = FAINT;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const v of [0, 1, 2]) {
    const y = Math.round(yv(v)) + .5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(String(v), padL - 8, y);
  }
  counts.forEach((t, i) => {
    const v = Number(t.S), cur = lo + i === w;
    const h = Math.max(2, yv(0) - yv(v));
    ctx.fillStyle = cur ? AMBER : INK;
    ctx.globalAlpha = cur ? 1 : .55;
    ctx.fillRect(padL + i * slot + slot * .19, yv(0) - h, slot * .62, h);
    ctx.globalAlpha = 1;
    if (cur) ctx.fillRect(padL + i * slot + slot * .19, yv(0) + 4, slot * .62, 3);   // marks w even when S_F = 0
  });
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < HIST; i++) {
    const y = Math.round(yv(C.SF(lo + i))) + .5;
    ctx.beginPath(); ctx.moveTo(padL + i * slot + slot * .08, y); ctx.lineTo(padL + (i + 1) * slot - slot * .08, y); ctx.stroke();
  }
  ctx.fillStyle = FAINT;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left"; ctx.fillText(`w = ${fmt(lo)}`, padL, H - 3);
  ctx.textAlign = "right"; ctx.fillText(`w = ${fmt(lo + HIST - 1)}`, W - padR, H - 3);
  $("wave-sub").textContent = `w = ${fmt(lo)} to ${fmt(lo + HIST - 1)}`;
}

// ---- refresh -------------------------------------------------------------

const putNum = (key, n) => {
  $(key + "-n").textContent = group(n);
  $(key + "-n").classList.toggle("short", digitCount(n) <= 18);
  $(key + "-d").textContent = digitsText(n);
};

// ---- the period as a hexagon ---------------------------------------------

// Corner r is the leftover r of w ÷ 6, clockwise from 0 at the top, with
// S_F outside it; going around reads 0, 1, 2, 2, 1, 0.  Edge e runs from
// corner e to corner e + 1 as a strip of LEDs, and a light runs along it
// when w moves.
const HX = { cx: 160, cy: 160, R: 112, per: 6, r: null, run: 0 };
const hxPt = (i, rad) => { const a = (-90 + 60 * i) * Math.PI / 180; return [HX.cx + rad * Math.cos(a), HX.cy + rad * Math.sin(a)]; };

function buildHex() {
  const corners = [0, 1, 2, 3, 4, 5].map((i) => hxPt(i, HX.R));
  const pts = corners.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  let s = `<polygon class="strip" points="${pts}"/>`;
  for (let e = 0; e < 6; e++) {
    const [x0, y0] = corners[e], [x1, y1] = corners[(e + 1) % 6];
    for (let k = 1; k <= HX.per; k++) {
      const t = k / (HX.per + 1);
      s += `<circle class="led" data-e="${e}" r="3.4" cx="${(x0 + t * (x1 - x0)).toFixed(1)}" cy="${(y0 + t * (y1 - y0)).toFixed(1)}"/>`;
    }
  }
  corners.forEach(([x, y], i) => {
    const [vx, vy] = hxPt(i, HX.R + 30);
    s += `<circle class="vglow" data-v="${i}" r="15" cx="${x}" cy="${y}"/><circle class="vled" data-v="${i}" r="8" cx="${x}" cy="${y}"/>` +
      `<text class="val" x="${vx}" y="${vy}">${C.SF(i || 6)}</text>`;
  });
  s += `<text class="cw" id="hx-w" x="${HX.cx}" y="${HX.cy - 36}"></text><text class="ceq" id="hx-eq" x="${HX.cx}" y="${HX.cy - 12}"></text>` +
    `<text class="csf" x="${HX.cx}" y="${HX.cy + 32}">S<tspan class="s" dy="7">F</tspan><tspan dy="-7"> = </tspan><tspan id="hx-sf"></tspan></text>`;
  const svg = $("hex");
  svg.innerHTML = s;
  HX.leds = [0, 1, 2, 3, 4, 5].map((e) => [...svg.querySelectorAll(`.led[data-e="${e}"]`)]);
  HX.corner = [0, 1, 2, 3, 4, 5].map((i) => [...svg.querySelectorAll(`[data-v="${i}"]`)]);
}

const lightCorner = (r) => HX.corner.forEach((els, i) => els.forEach((el) => el.classList.toggle("on", i === r)));

function moveHex(w) {
  const r = w % 6, from = HX.r;
  HX.r = r;
  $("hx-w").textContent = `w = ${fmt(w)}`;
  $("hx-eq").textContent = `= 6 × ${fmt(Math.floor(w / 6))} + ${r}`;
  const run = ++HX.run;
  HX.leds.flat().forEach((el) => el.classList.remove("on"));
  if (from === null || from === r || S.reduced) { lightCorner(r); return; }
  // the short way round, LED by LED
  let d = (r - from + 6) % 6, dir = 1;
  if (d > 3) { d = 6 - d; dir = -1; }
  const seq = [];
  for (let s = 0, c = from; s < d; s++, c = (c + dir + 6) % 6) seq.push(...(dir > 0 ? HX.leds[c] : [...HX.leds[(c + 5) % 6]].reverse()));
  lightCorner(-1);
  const budget = T.sweep ? 700 / T.sweep : 260 * d, step = Math.min(30, budget / seq.length), t0 = performance.now();
  const frame = (now) => {
    if (run !== HX.run) return;
    const i = Math.floor((now - t0) / step);
    seq.forEach((el, j) => el.classList.toggle("on", j === i));
    if (i < seq.length) requestAnimationFrame(frame);
    else lightCorner(r);
  };
  requestAnimationFrame(frame);
}

function renderDiff(w, tm) {
  moveHex(w);
  $("hx-sf").textContent = String(tm.S);
  const ok = tm.S === BigInt(C.SF(w));
  $("d-check").textContent = ok ? "Exact count matches" : "Exact count differs";
  $("d-check").className = "pill " + (ok ? "cy" : "rd");
}

function refreshTracker() {
  const w = T.w, tm = C.transfer(w, "fibonacci");
  renderDiff(w, tm);
  $("tc-sub").textContent = `width w = ${fmt(w)}`;
  putNum("tF", tm.all); putNum("tFe", tm.even); putNum("tFo", tm.odd); putNum("tS", tm.S);
  $("tS-d").textContent = "";   // always one digit
  renderWave();
  writeHash();
}

const tRail = makeRail("tw-rail", "tw-num", {
  min: 1, max: TW_MAX, log: true, page: 6,
  valueText: (v) => `width ${v}`,
  onSet: (v) => { T.w = v; refreshTracker(); },
});

function setSweep(v) {
  T.sweep = v;
  if (v) T.lastSweep = v;
  $("sweepSeg").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.v) === v));
  clearInterval(T.timer);
  if (v) T.timer = setInterval(() => {
    if (T.w >= TW_MAX) { setSweep(0); return; }
    tRail.set(T.w + 1);
  }, 1000 / v);
}

// ------------------------------------------------------------------------
// Pages: the explorer and the tracker, one at a time
// ------------------------------------------------------------------------

const TABS = ["explorer", "tracker"];
let tab = "explorer";

function showTab(t) {
  tab = t;
  TABS.forEach((x, i) => {
    $("bay-" + x).hidden = x !== t;
    $("tab-" + x).setAttribute("aria-selected", x === t);
    if (x === t) $("sheetNo").textContent = String(i + 1).padStart(2, "0");
  });
  if (t === "explorer") drawField(); else renderWave();
  writeHash();
}

// ------------------------------------------------------------------------
// The address: #p=explorer&c=2,1,2,1&w=36 holds the page, the explorer's
// skyline and the tracker's width, so a link reopens all three
// ------------------------------------------------------------------------

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const c = (q.get("c") || "").split(",").map(Number);
  if (c.length >= 1 && c.length <= XW_MAX && c.every((v) => v === 1 || v === 2)) { X.c = c; X.source = "FROM LINK"; }
  if (TABS.includes(q.get("p"))) tab = q.get("p");
  const w = Number(q.get("w"));
  if (Number.isInteger(w) && w >= 1 && w <= TW_MAX) T.w = w;
}

let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const hash = `#p=${tab}&c=${X.c.join(",")}&w=${T.w}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }, 250);
}

window.addEventListener("hashchange", () => {
  readHash();
  xRail.show(X.c.length);
  tRail.show(T.w);
  refreshExplorer();
  refreshTracker();
  showTab(tab);
});

// ------------------------------------------------------------------------
// Keyboard, motion, resize
// ------------------------------------------------------------------------

function setReduced(v) { S.reduced = v; document.body.classList.toggle("reduced", v); }

function initKeys() {
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k === "1" || k === "2") showTab(TABS[Number(k) - 1]);
    else if (k === "x") generate("exchange");
    else if (k === "[") stepRank(-1);
    else if (k === "]") stepRank(1);
    else if (k === "w") setSweep(T.sweep ? 0 : T.lastSweep);
    else if (k === "b") { S.bricks = !S.bricks; drawField(); }
    else if (k === "m") setReduced(!S.reduced);
  });
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  let pending = false;
  window.addEventListener("resize", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; if (tab === "explorer") drawField(); else renderWave(); });
  });
}

// ------------------------------------------------------------------------
// Init
// ------------------------------------------------------------------------

readHash();
initExplorer();
buildTracker();
initKeys();
const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
setReduced(!!(mq && mq.matches));
if (mq && mq.addEventListener) mq.addEventListener("change", (e) => setReduced(e.matches));
refreshExplorer();
refreshTracker();
showTab(tab);
if (document.fonts) document.fonts.ready.then(renderWave);
