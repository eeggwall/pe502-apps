// representations.js — the castle in each encoding the line printer offers.
//
// Each encoding takes the profile x_0 … x_{w−1} (tower heights above the
// base, as in castles.js) and returns what the printer prints: an optional
// heading, rule lines, then the representation itself, as `text` to wrap at
// the sheet's width, and optional `foot` lines.
// The encodings follow the castles wiki (castle-representations).

import { towerWord, toUrd } from "./castles.js";

const MINUS = "−";
const signed = (n) => (n > 0 ? "+" + n : n < 0 ? MINUS + -n : "0");
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

// The tower word as nested lists: "R" for a column, an array for a block
// holding the word of the towers on it.
function parseTowers(word) {
  const top = [];
  const stack = [top];
  for (const ch of word) {
    if (ch === "U") { const b = []; stack[stack.length - 1].push(b); stack.push(b); }
    else if (ch === "D") stack.pop();
    else stack[stack.length - 1].push("R");
  }
  return top;
}

// (direction, gap, direction, …, direction): signed lengths of the U and D
// runs alternating with the lengths of the R runs.  A tower word has no UD
// and no DU, so each vertical run is all U or all D.
function excursionGap(word) {
  const out = [];
  let i = 0;
  for (;;) {
    let d = 0;
    while (i < word.length && word[i] !== "R") { d += word[i] === "U" ? 1 : -1; i += 1; }
    out.push(d);
    if (i >= word.length) return out;
    let g = 0;
    while (i < word.length && word[i] === "R") { g += 1; i += 1; }
    out.push(g);
  }
}

// The first steps of the walk in words, in column heights c (base row = 1).
const READ_MAX = 6;
function readWalk(seq) {
  const at = (c) => (c === 1 ? "the base row" : `height ${c}`);
  const out = [];
  let c = 1;
  for (let i = 0; i < seq.length; i += 2) {
    const d = seq[i], g = seq[i + 1];
    c += d;
    if (g === undefined) { out.push(d ? `${signed(d)}: down ${-d} to the base row, the end` : "0: already on the base row, the end"); break; }
    const move = d > 0 ? `up ${d} to ${at(c)}` : d < 0 ? `down ${-d} to ${at(c)}` : `flat on ${at(c)}`;
    out.push(`${signed(d)}, ${g}: ${move}, ${plural(g, "column")}`);
  }
  return out.length > READ_MAX ? [...out.slice(0, READ_MAX), `… ${plural(out.length - READ_MAX, "more step")}`] : out;
}

// The printer's representations, in the order the Printout panel lists them;
// desc is HTML, for the subscripts.
export const MODES = [
  { id: "urd", label: "URD word", desc: "The castle's outline as steps: U up a row, R right a column, D down a row." },
  { id: "tuple", label: "Skyline", desc: "The integer tuple of column heights c = (c<sub>1</sub>, …, c<sub>w</sub>), base row included." },
  { id: "gap", label: "Excursion/gap word", desc: "The top of the castle as a walk from the base row and back: each climb or drop between columns, signed, then how many columns stay at that height." },
  { id: "forest", label: "Cycle forest", desc: "The blocks above the base as nested parentheses, with the R steps dropped." },
];

export function represent(mode, profile) {
  const h = 1 + Math.max(...profile, 0);
  const k = h - 1;
  const word = towerWord(profile);
  if (mode === "tuple") {
    return {
      head: "Skyline · column heights c = (c_1, …, c_w)",
      rules: [`1 ≤ c_i ≤ h and some c_i = h = ${h}`],
      text: "(" + profile.map((x) => x + 1).join(", ") + ")",
    };
  }
  if (mode === "gap") {
    const seq = excursionGap(word);
    return {
      head: "Excursion/gap word · the top of the castle as a walk",
      rules: [
        "walk the top of the castle left to right, from the base row back to it",
        "signed numbers: a climb (+) or drop (−) between columns, in rows",
        "unsigned numbers: how many columns the walk stays at that height",
        "0 first or last: the first or last column is the base row alone",
      ],
      text: "(" + seq.map((n, i) => (i % 2 ? String(n) : signed(n))).join(", ") + ")",
      foot: readWalk(seq),
    };
  }
  if (mode === "forest") {
    const towers = parseTowers(word);
    const blocks = (word.match(/U/g) || []).length;
    const trees = towers.filter((t) => t !== "R").length;
    return {
      head: "Cycle forest · the blocks above the base",
      rules: [
        "( … ) is a block, around the blocks resting on it",
        "the R steps are dropped, so the towers are not recoverable",
      ],
      text: blocks ? word.replace(/R/g, "").replace(/U/g, "(").replace(/D/g, ")") : "empty forest",
      foot: blocks ? [`${plural(trees, "tree")} · ${plural(blocks, "block")} · nested ${k} deep`] : [],
    };
  }
  return { text: toUrd(profile) };
}
