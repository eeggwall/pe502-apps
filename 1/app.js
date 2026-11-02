// Castle Foundry :: reactor console frontend.
//
// Field drawing model taken from vii.js: the castle is drawn cell by cell
// into a <canvas> via fillRect, one flat color per cell, with a 1px gutter
// that reads as a continuous grid.  Cell size auto-fits the bay.  The console
// around it (annunciator, rails) follows ../index.html:
// amber is what the operator sets and the castle's notifications (its parity,
// the counts it is part of), cyan is theory and confirmation.  What the
// console prints (the line printer) is paper in pe502.com's style.

import * as C from "./castles.js";
import * as R from "./representations.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n) => n.toLocaleString("en-US");

// -------- palette (canvas) -----------------------------------------------
const STONE  = "#D4CDB7";   // filled cell
const EMPTY  = "#0E1412";   // empty cell below the ceiling
const AIR    = "#070A09";   // rows above the ceiling (or above the castle)
const GUTTER = "#1A2421";   // 1px grid between cells
const AMBER  = "#FFB347";   // operator: ceiling line
const RED    = "#FF5240";   // the cell under the pointer or keyboard cursor
const RED_BAND = "rgba(255,82,64,.13)";   // its row and column

// -------- sizing ---------------------------------------------------------
// Cell size floats between CELL_MIN (a 200 x 100 field) and CELL_MAX (a 3x3).
// The backing store is sized to the field at that cell size; CSS caps the
// display width, so mouse positions are rescaled.
const CELL_MIN = 4;
const CELL_MAX = 42;
const W_MAX = 200;
const H_MAX = 100;

// -------- state ----------------------------------------------------------
const S = {
  bricks: true,        // each block drawn as one brick
  grid: true,
  reduced: false,
};

const D = {            // Chamber I: designer
  profile: [1, 2, 3, 4, 5, 4, 3, 2, 1],
  w: 9,
  h: 6,
  source: "HAND-DRAWN",
  sheet: null,
  canvas: null,
  geom: null,
  down: false,
  mode: 0,             // +1 raising, -1 lowering while dragging
  last: "",
  hover: null,         // [col, row] under the pointer
  cursor: -1,          // keyboard column, -1 when not in use
  readout: null,
};

// ------------------------------------------------------------------------
// Field renderer (flat cells, 1px gutter, auto-fit cell size)
// ------------------------------------------------------------------------

function drawField(canvas, profile, { rows, maxW, maxH, cellMax = CELL_MAX, ceiling = null, pointer = null }) {
  const ctx = canvas.getContext("2d");
  const cols = profile.length;
  const sp = S.grid || S.bricks ? 1 : 0;
  const csW = Math.floor((maxW - sp) / cols) - sp;
  const csH = Math.floor((maxH - sp) / rows) - sp;
  const cell = Math.max(CELL_MIN, Math.min(cellMax, csW, csH));
  const stride = cell + sp;
  const fw = sp + cols * stride;
  const fh = sp + rows * stride;
  if (canvas.width !== fw) canvas.width = fw;
  if (canvas.height !== fh) canvas.height = fh;

  ctx.fillStyle = S.grid ? GUTTER : AIR;
  ctx.fillRect(0, 0, fw, fh);
  const airFrom = ceiling === null ? 1 + Math.max(...profile, 0) : ceiling;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const alive = r === 0 || r <= profile[c];
      ctx.fillStyle = alive ? STONE : (r >= airFrom ? AIR : EMPTY);
      ctx.fillRect(sp + c * stride, sp + (rows - 1 - r) * stride, cell, cell);
    }
  }

  // Bricks: the gutter between two filled cells of one row is filled too, so
  // each block reads as one brick and the seams fall between blocks, as
  // PE502-1 Figure 1 outlines them.
  if (S.bricks) {
    ctx.fillStyle = STONE;
    for (let r = 0; r < rows; r++) {
      const y = sp + (rows - 1 - r) * stride;
      for (let c = 0; c + 1 < cols; c++) {
        if (r === 0 || (r <= profile[c] && r <= profile[c + 1])) ctx.fillRect(sp + c * stride + cell, y, sp, cell);
      }
    }
  }

  // Pointer: a red band along its row and column, under the ceiling line.
  const at = pointer && pointer[0] >= 0 && pointer[0] < cols && pointer[1] >= 0 && pointer[1] < rows;
  if (at) {
    ctx.fillStyle = RED_BAND;
    ctx.fillRect(sp + pointer[0] * stride, 0, cell, fh);
    ctx.fillRect(0, sp + (rows - 1 - pointer[1]) * stride, fw, cell);
  }

  // Ceiling: a dashed amber line along the top of row (ceiling - 1).
  if (ceiling !== null && ceiling < rows) {
    const y = sp + (rows - ceiling) * stride;
    ctx.fillStyle = AMBER;
    for (let x = 0; x < fw; x += 8) ctx.fillRect(x, y - 2, 5, 2);
  }

  // Pointer: a glowing red square on its cell.
  if (at) {
    const lw = cell >= 10 ? 2 : 1;
    const x = sp + pointer[0] * stride, y = sp + (rows - 1 - pointer[1]) * stride;
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
  return { cell, sp, stride, rows, cols };
}

// Pointer event -> [col, row] in castle coordinates (row 0 = base).
function cellAt(canvas, geom, event) {
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (canvas.width / rect.width) - geom.sp;
  const py = (event.clientY - rect.top) * (canvas.height / rect.height) - geom.sp;
  const col = Math.floor(px / geom.stride);
  const row = geom.rows - 1 - Math.floor(py / geom.stride);
  if (col < 0 || col >= geom.cols || row < 0) return null;
  return [col, row];
}

const blocksText = (n) => `${fmt(n)} BLOCK${n === 1 ? "" : "S"}`;

const fieldWidth = (wrapId) => Math.max(160, $(wrapId).clientWidth - 28);

// ------------------------------------------------------------------------
// Readouts
// ------------------------------------------------------------------------

function buildReadout(containerId) {
  const f = {};
  $(containerId).querySelectorAll("[data-f]").forEach((el) => { f[el.dataset.f] = el; });
  return f;
}

const parityWord = (sheet) => (sheet.evenBlock ? "Even-block" : "Odd-block");

function renderReadout(f, sheet) {
  const w = sheet.width, h = sheet.height;
  const c = sheet.profile.map((x) => x + 1);

  f.blocks.textContent = fmt(sheet.blocks);
  f.parity.textContent = parityWord(sheet);
  f.parity.className = "pill am";
  // blocks(c), the total descent of the padded skyline (0, c_1, …, c_w, 0)
  const drops = [];
  [...c, 0].forEach((v, i) => { const prev = i ? c[i - 1] : 0; if (prev > v) drops.push(prev - v); });
  // and, row by row from the base, the runs of filled cells: the bricks
  const perRow = [];
  for (let r = 0; r < h; r++) {
    let n = 0, run = false;
    for (const x of sheet.profile) { const on = r <= x; if (on && !run) n++; run = on; }
    perRow.push(n);
  }
  f["blocks-note"].innerHTML = "One per brick on the field, row by row from the base" +
    (perRow.length <= 12 ? `: ${perRow.join(" + ")} = ${fmt(sheet.blocks)}.` : `, over ${fmt(h)} rows.`) +
    " Equally, the total descent of the padded skyline (0, c<sub>1</sub>, …, c<sub>w</sub>, 0), PE502-1 eq. (2.1)" +
    (drops.length <= 12 ? `: its drops ${drops.join(", ")} add up to ${fmt(sheet.blocks)}.` : `, here ${fmt(drops.length)} drops.`);

  f["counts-sub"].textContent = `this castle: w = ${w}, h = ${h}`;
  const all = sheet.countAll, even = sheet.countEven, odd = all - even;
  for (const [key, value, lit] of [["all", all, true], ["even", even, sheet.evenBlock], ["odd", odd, !sheet.evenBlock]]) {
    const text = value.toLocaleString("en-US");
    f[key + "-num"].textContent = text;
    f[key + "-num"].classList.toggle("long", text.length > 16);
    f[key + "-wh"].textContent = `${w}, ${h}`;
    f[key + "-lamp"].classList.toggle("on", lit);
  }

  f.size.textContent = `${w} × ${h}`;
  f.degree.textContent = sheet.degree;
  f.valleys.textContent = sheet.valleys;
  f.nick.textContent = sheet.nickname;
  f.symmetric.classList.toggle("on", sheet.features.symmetric);
  f.convex.classList.toggle("on", sheet.features.convex);
  f.concave.classList.toggle("on", sheet.features.concave);
}

// ------------------------------------------------------------------------
// Mimic diagram: PE502-1 eq. (4.4) in three steps (castles.js closedForm)
// ------------------------------------------------------------------------

const MV = { key: "", timer: 0, el: null };

const whole = (n) => (n < 0n ? "\u2212" + (-n).toLocaleString("en-US") : n.toLocaleString("en-US"));
const digits = (n) => (n < 0n ? -n : n).toString().length;
const SHORT = 15;   // digits up to which the boxes write out their arithmetic
const minus = (k) => (k < 0 ? "\u2212" + -k : String(k));
// " − 3,973" or " + 3,973": n added (sign +1) or subtracted (sign -1).
const term = (n, sign) => ((n < 0n) === (sign > 0) ? " \u2212 " : " + ") + whole(n < 0n ? -n : n);

function renderMimic(sheet) {
  if (!MV.el) {
    MV.el = {};
    $("mimic").querySelectorAll("[data-mv]").forEach((el) => { MV.el[el.dataset.mv] = el; });
  }
  const e = MV.el;
  const w = sheet.width, h = sheet.height;
  const cf = C.closedForm(w, h);
  const short = digits(cf.hw) <= SHORT;
  const size = (n) => (digits(n) > SHORT ? `${fmt(digits(n))} digits` : "");
  // The number in full, under a line that says what it is: label, always
  // shown, then the arithmetic when the numbers are short, else the size.
  const show = (key, n, label, sum) => {
    const text = whole(n);
    e[key].innerHTML = text.replace(/,/g, ",<wbr>");   // wrap between digit groups
    e[key].classList.toggle("long", text.length > 22);
    e[key + "-sub"].innerHTML = [label, short ? sum : size(n)].filter(Boolean).join(" · ");
  };

  $("mv-sub").innerHTML = `A<sup>e</sup>(${w}, ${h}) and A<sup>o</sup>(${w}, ${h}) by PE502-1 eq. (4.4)`;
  show("hw", cf.hw, `= ${h}<sup>${w}</sup>`);
  show("h1w", cf.h1w, `= ${h - 1}<sup>${w}</sup>`);
  show("high", cf.high, `= P(${minus(h - 1)}, ${w})`);
  show("low", cf.low, `= P(${minus(h - 2)}, ${w})` + (h === 1 ? ", an empty sum" : ""));
  show("all", cf.all, "", `= ${whole(cf.hw)} − ${whole(cf.h1w)}`);
  show("signs", cf.signs, "", `= ${whole(cf.high)}${term(cf.low, -1)}`);
  show("twiceEven", cf.twiceEven, "", `= ${whole(cf.all)}${term(cf.signs, -1)}`);
  show("twiceOdd", cf.twiceOdd, "", `= ${whole(cf.all)}${term(cf.signs, +1)}`);
  show("even", cf.even, "", `= ${whole(cf.twiceEven)} / 2`);
  show("odd", cf.odd, "", `= ${whole(cf.twiceOdd)} / 2`);

  // Lamps and pipes: this castle's path.  Steps 1 and 2 take every term, so
  // they are all on it; past the cross its parity picks one path, and the
  // other, where it counts 0 times, goes dark.
  const even = sheet.evenBlock;
  const lit = { hw: true, h1w: true, high: true, low: true, all: true, signs: true, twiceEven: even, twiceOdd: !even, even, odd: !even };
  for (const [key, on] of Object.entries(lit)) {
    e["l-" + key].classList.toggle("on", on);
    e["l-" + key].title = on ? "On this castle's path" : "Off this castle's path";
  }
  for (const [key, on] of [["x-even", even], ["op-even", even], ["half-top", even], ["x-odd", !even], ["op-odd", !even], ["half-bot", !even]]) {
    e[key].classList.toggle("off", !on);
  }

  // A new width or height runs the flow for a moment.
  const key = `${w},${h}`;
  if (key === MV.key) return;
  MV.key = key;
  clearTimeout(MV.timer);
  $("mimic").classList.add("run");
  MV.timer = setTimeout(() => $("mimic").classList.remove("run"), 1800);
}

// ------------------------------------------------------------------------
// Line printer: the castle on a tractor-feed sheet, in one representation
// at a time (R.MODES), the URD word by default
// ------------------------------------------------------------------------

const LP = { key: "", timer: 0, busy: false, mode: "urd" };

function node(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Greedy wrap at spaces, cutting any word longer than a line.
function wrap(text, per) {
  const out = [];
  let line = "";
  for (let word of text.split(" ")) {
    if (line && line.length + 1 + word.length <= per) { line += " " + word; continue; }
    if (line) out.push(line);
    while (word.length > per) { out.push(word.slice(0, per)); word = word.slice(per); }
    line = word;
  }
  if (line) out.push(line);
  return out;
}

// Prints the castle in the selected representation: its heading and rules,
// the representation in lines as wide as the sheet, then the Checked stamp.
// With animate, reveals it a line at a time from the slot (a line printer
// prints whole lines), then stamps it.
function printWord(animate) {
  clearTimeout(LP.timer);
  const sheet = D.sheet;
  const rep = R.represent(LP.mode, sheet.profile);
  const page = $("d-sheet");
  page.textContent = "";
  const lines = [];
  const add = (parent, cls, text) => { const el = parent.appendChild(node("div", cls, text)); lines.push(el); return el; };

  if (rep.head) add(page, "hd", rep.head);
  for (const r of rep.rules || []) add(page, "rule", r);

  // Characters per line: the sheet's width over one character's.
  const body = page.appendChild(node("div", "word"));
  const probe = body.appendChild(node("span", "", "U".repeat(50)));
  const per = Math.max(1, Math.floor((body.getBoundingClientRect().width - 1) / (probe.getBoundingClientRect().width / 50)));
  probe.remove();
  for (const t of wrap(rep.text, per)) add(body, "", t);
  for (const t of rep.foot || []) add(page, "foot", t);

  const sign = add(page, "sign", "Checked");
  const stamp = sign.appendChild(node("span", "rstamp", parityWord(sheet).toUpperCase()));

  // The window fits the finished sheet (CSS caps it), so the sheet rises
  // into it without moving the printer.
  const out = $("d-out");
  out.style.height = out.firstElementChild.offsetHeight + 4 + "px";
  out.scrollTop = 0;          // column-reverse: 0 is the slot end
  const led = $("lp-led");
  LP.busy = false;
  if (!animate || S.reduced) { led.className = "led cyan idle"; return; }
  LP.busy = true;
  // The window shows about 18 lines, so only the last 40 are printed one at
  // a time; the rest of a long sheet has already risen past the slot.
  const from = Math.max(0, lines.length - 40);
  lines.slice(from).forEach((el) => { el.hidden = true; });
  stamp.hidden = true;
  led.className = "led cyan";
  const step = Math.min(45, 1600 / (lines.length - from));
  let i = from;
  const tick = () => {
    if (i < lines.length) { lines[i++].hidden = false; LP.timer = setTimeout(tick, step); return; }
    LP.timer = setTimeout(() => { stamp.hidden = false; stamp.classList.add("thunk"); led.className = "led cyan idle"; LP.busy = false; }, 220);
  };
  LP.timer = setTimeout(tick, 120);
}

const lineFeed = () => printWord(true);

// The Printout panel: one button per representation, each with a sentence
// saying what it prints.  Arrow keys move along it; choosing one prints it.
function showMode(focus) {
  $("modes").querySelectorAll(".mode").forEach((b) => {
    const on = b.dataset.mode === LP.mode;
    b.setAttribute("aria-checked", on);
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
}

function setMode(id, focus) {
  LP.mode = id;
  showMode(focus);
  printWord(true);
  writeHash();
}

const stepMode = (by, focus) => {
  const i = R.MODES.findIndex((m) => m.id === LP.mode);
  setMode(R.MODES[(i + by + R.MODES.length) % R.MODES.length].id, focus);
};

function buildModes() {
  const box = $("modes");
  for (const m of R.MODES) {
    const b = box.appendChild(node("button", "mode"));
    b.dataset.mode = m.id;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", m.id === LP.mode);
    b.tabIndex = m.id === LP.mode ? 0 : -1;
    const desc = node("span");
    desc.innerHTML = m.desc;
    b.append(node("i", "lampdot"), node("b", "", m.label), desc);
    b.addEventListener("click", () => setMode(m.id));
  }
  box.addEventListener("keydown", (e) => {
    const by = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (by) { e.preventDefault(); stepMode(by, true); }
  });
}

// ------------------------------------------------------------------------
// Annunciator
// ------------------------------------------------------------------------

// The parity of the castle, a notification in amber either way: neither
// parity is a fault.
const ALARMS = [
  { id: "even", t: "Even-block castle", s: "CH.\u00a0I", k: "am", c: () => D.sheet && D.sheet.evenBlock },
  { id: "odd",  t: "Odd-block castle",  s: "CH.\u00a0I", k: "am", c: () => D.sheet && !D.sheet.evenBlock },
];

function buildAnn() {
  $("ann").innerHTML = ALARMS.map((a) => `<div class="tile" id="an-${a.id}"><span>${a.t}</span><small>${a.s}</small></div>`).join("");
  ALARMS.forEach((a) => { a.el = $("an-" + a.id); a.cls = "tile"; });
}

// Each tile is lit while its condition holds and dark otherwise.
function updAnn() {
  ALARMS.forEach((a) => {
    const cls = "tile" + (a.c() ? " " + a.k : "");
    if (cls !== a.cls) { a.cls = cls; a.el.className = cls; }
  });
}

// ------------------------------------------------------------------------
// Rails (role="slider"): amber thumb, zones marked on the rail
// ------------------------------------------------------------------------

function makeRail(railId, numId, min, max, valueText, onSet) {
  const el = $(railId);
  const thumb = el.querySelector(".thumb");
  const zones = el.querySelector(".zones");
  const num = $(numId);
  let value = min;
  const frac = (v) => clamp((v - min) / (max - min), 0, 1);

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
  const fromX = (x) => { const b = el.getBoundingClientRect(); return min + clamp((x - b.left) / b.width, 0, 1) * (max - min); };

  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); el._drag = true; set(fromX(e.clientX)); });
  el.addEventListener("pointermove", (e) => { if (el._drag) set(fromX(e.clientX)); });
  const end = () => { el._drag = false; };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("keydown", (e) => {
    let v = value, hit = true;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") v += 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v -= 1;
    else if (e.key === "PageUp") v += 10;
    else if (e.key === "PageDown") v -= 10;
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

  // runs: [{ a, b, cls, title }] in value units, inclusive.
  function mark(runs) {
    zones.innerHTML = runs.map((r) => {
      const left = frac(r.a - 0.5) * 100, right = frac(r.b + 0.5) * 100;
      return `<span class="zone ${r.cls}" style="left:${left}%;width:${right - left}%" title="${r.title}"></span>`;
    }).join("");
  }
  return { show, set, mark, get value() { return value; } };
}

// Group consecutive values where pred holds into runs.
function runs(lo, hi, pred, cls, title) {
  const out = [];
  let start = null;
  for (let v = lo; v <= hi + 1; v++) {
    const on = v <= hi && pred(v);
    if (on && start === null) start = v;
    if (!on && start !== null) { out.push({ a: start, b: v - 1, cls, title: title(start, v - 1) }); start = null; }
  }
  return out;
}

const span = (a, b, x) => (a === b ? `${x} = ${a}` : `${x} ${a} – ${b}`);

function markRails() {
  const { w, h } = D;
  wRail.mark(runs(1, W_MAX, (x) => !C.hasEvenBlockCastles(x, h), "nil", (a, b) => `A^e(w, ${h}) = 0 for ${span(a, b, "w")}`));
  hRail.mark(runs(1, H_MAX, (y) => !C.hasEvenBlockCastles(w, y), "nil", (a, b) => `A^e(${w}, h) = 0 for ${span(a, b, "h")}`));
}

const wRail = makeRail("w-rail", "w-num", 1, W_MAX, (v) => `width ${v} column${v === 1 ? "" : "s"}`, (v) => {
  D.w = v; refreshDesigner(); markRails();
});
const hRail = makeRail("h-rail", "h-num", 1, H_MAX, (v) => `height ${v} row${v === 1 ? "" : "s"}`, (v) => {
  D.h = v; refreshDesigner(); markRails();
});

// ------------------------------------------------------------------------
// Chamber I: designer
// ------------------------------------------------------------------------

function drawDesigner() {
  const pointer = D.hover || (D.cursor >= 0 ? [D.cursor, D.profile[D.cursor]] : null);
  D.geom = drawField(D.canvas, D.profile, {
    rows: D.h + 1, maxW: fieldWidth("d-wrap"), maxH: 560, ceiling: D.h, pointer,
  });
  // Grid coordinates of the pointer, counted from 1: column from the left, row from the base.
  const where = pointer && pointer[0] < D.w && pointer[1] <= D.h
    ? ` · <span class="ptr">column ${pointer[0] + 1}, row ${pointer[1] + 1}</span>` : "";
  $("d-fieldsub").innerHTML = `w = ${D.w} · ceiling h = ${D.h}${where}`;
}

// animate: print the word line by line (a generator press) rather than at once.
function refreshDesigner(animate = false) {
  const { w, h } = D;
  // Pad or truncate to w columns; clamp towers to the ceiling h.
  while (D.profile.length < w) D.profile.push(0);
  D.profile.length = w;
  D.profile = D.profile.map((v) => clamp(v, 0, h - 1));
  if (D.cursor >= w) D.cursor = w - 1;

  const sheet = C.factSheet(D.profile);
  D.sheet = sheet;
  renderReadout(D.readout, sheet);
  drawDesigner();

  $("d-stamp").textContent = `${sheet.width} × ${sheet.height} · ${blocksText(sheet.blocks)} · ${parityWord(sheet).toUpperCase()} · ${D.source}`;
  $("d-led").className = "led amber";
  // A new word reprints; anything else (a resize) reflows the sheet at once
  // unless it is mid-print.
  const fresh = sheet.urd !== LP.key;
  LP.key = sheet.urd;
  if (animate || fresh || !LP.busy) printWord(animate);
  renderMimic(sheet);
  updAnn();
  writeHash();
}

function generate(kind) {
  const { w, h } = D;
  let profile, source;
  if (kind === "clear") { profile = new Array(w).fill(0); source = "CLEARED"; }
  else if (kind === "tallest") { profile = C.tallest(w, h); source = "TALLEST"; }
  else if (kind === "widest") { profile = C.widest(w, h); source = "WIDEST"; }
  else if (kind === "symmetric") { profile = C.randomSymmetric(w, h); source = "RANDOM · SYMMETRIC"; }
  else { profile = C.randomCastle(w, h); source = "RANDOM"; }
  D.profile = profile.slice();
  D.source = source;
  refreshDesigner(true);
}

function initDesigner() {
  D.canvas = $("designer-canvas");
  D.readout = buildReadout("d-readout");
  const cv = D.canvas;

  cv.addEventListener("pointerdown", (e) => {
    const pos = D.geom && cellAt(cv, D.geom, e);
    if (!pos) return;
    cv.setPointerCapture(e.pointerId);
    const [col, row] = pos;
    const cur = D.profile[col];
    if (row <= cur) {          // on a tower: lower it to just below this cell
      D.profile[col] = Math.max(0, row - 1);
      D.mode = -1;
    } else {                   // above it: raise it to this row, under the ceiling
      D.profile[col] = Math.min(row, D.h - 1);
      D.mode = +1;
    }
    D.down = true;
    D.cursor = -1;
    D.last = col + "," + row;
    D.source = "HAND-DRAWN";
    refreshDesigner();
  });

  cv.addEventListener("pointermove", (e) => {
    const pos = D.geom && cellAt(cv, D.geom, e);
    if (!D.down) {
      const key = pos ? pos.join(",") : "";
      if (key !== (D.hover ? D.hover.join(",") : "")) { D.hover = pos; drawDesigner(); }
      return;
    }
    if (!pos) return;
    const [col, row] = pos;
    const key = col + "," + row;
    if (key === D.last) return;
    D.last = key;
    D.hover = pos;
    if (D.mode > 0) D.profile[col] = Math.max(D.profile[col], Math.min(row, D.h - 1));
    else D.profile[col] = Math.min(D.profile[col], Math.max(0, row - 1));
    refreshDesigner();
  });

  const end = () => { D.down = false; };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener("pointerleave", () => { if (!D.down && D.hover) { D.hover = null; drawDesigner(); } });

  cv.addEventListener("keydown", (e) => {
    let c = D.cursor >= 0 ? D.cursor : (D.hover ? D.hover[0] : 0);
    const before = D.profile[c];
    if (e.key === "ArrowLeft") c = Math.max(0, c - 1);
    else if (e.key === "ArrowRight") c = Math.min(D.w - 1, c + 1);
    else if (e.key === "ArrowUp") D.profile[c] = Math.min(D.h - 1, D.profile[c] + 1);
    else if (e.key === "ArrowDown") D.profile[c] = Math.max(0, D.profile[c] - 1);
    else return;
    e.preventDefault();
    D.cursor = c;
    if (D.profile[c] !== before) { D.source = "HAND-DRAWN"; refreshDesigner(); }
    else drawDesigner();
  });
  cv.addEventListener("blur", () => { if (D.cursor >= 0) { D.cursor = -1; drawDesigner(); } });

  document.querySelectorAll("[data-gen]").forEach((b) => {
    b.addEventListener("click", () => generate(b.dataset.gen));
  });

  wRail.show(D.w);
  hRail.show(D.h);
}

// ------------------------------------------------------------------------
// The address: #c=2,3,5,2,3,1,5,4&h=5&rep=urd holds the skyline c, the
// ceiling h and the printout, so a link reopens the castle
// ------------------------------------------------------------------------

// Takes what is valid: a skyline of 1 to W_MAX heights in 1 … H_MAX, a
// ceiling no lower than the skyline, a printout listed in R.MODES.
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const rep = q.get("rep");
  if (R.MODES.some((m) => m.id === rep)) LP.mode = rep;
  const c = (q.get("c") || "").split(",").map(Number);
  if (c.length > W_MAX || !c.every((v) => Number.isInteger(v) && v >= 1 && v <= H_MAX)) return;
  const h = Number(q.get("h"));
  D.profile = c.map((v) => v - 1);
  D.w = c.length;
  D.h = Number.isInteger(h) && h <= H_MAX ? Math.max(h, ...c) : Math.max(...c);
  D.source = "FROM LINK";
}

// Debounced: a drag rewrites the castle on every cell, and browsers throttle
// replaceState.
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const hash = `#c=${D.profile.map((x) => x + 1).join(",")}&h=${D.h}&rep=${LP.mode}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }, 250);
}

// A link pasted or edited in the address bar of an open console.
window.addEventListener("hashchange", () => {
  readHash();
  wRail.show(D.w);
  hRail.show(D.h);
  showMode(false);
  refreshDesigner(true);
  markRails();
});

// ------------------------------------------------------------------------
// Display keys: bricks, grid, motion
// ------------------------------------------------------------------------

function toggleBricks() { S.bricks = !S.bricks; drawDesigner(); }
function toggleGrid() { S.grid = !S.grid; drawDesigner(); }
function setReduced(v) { S.reduced = v; document.body.classList.toggle("reduced", v); }

// ------------------------------------------------------------------------
// Keyboard
// ------------------------------------------------------------------------

function initKeys() {
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k === "b") toggleBricks();
    else if (k === "g") toggleGrid();
    else if (k === "l") lineFeed();
    else if (k === "p") stepMode(1);
    else if (k === "m") setReduced(!S.reduced);
  });
  $("feedBtn").addEventListener("click", lineFeed);

  let pending = false;
  window.addEventListener("resize", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      refreshDesigner();
    });
  });
}

// ------------------------------------------------------------------------
// Init
// ------------------------------------------------------------------------

readHash();
buildAnn();
buildModes();
initDesigner();
initKeys();
const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
setReduced(!!(mq && mq.matches));
if (mq && mq.addEventListener) mq.addEventListener("change", (e) => setReduced(e.matches));
refreshDesigner();
markRails();
