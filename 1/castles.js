// castles.js — a JavaScript port of the core `castles` library.
//
// Replaces the Pyodide bridge: the whole app runs natively in the browser, no
// WASM download, no JS<->Python hops.  The counts follow technical report
// PE502-1: a castle of width w and height h has column heights (the skyline)
// c_i = x_i + 1 in 1..h with some c_i = h, and an even or an odd number of
// blocks.  A(w, h) counts all of them, A^e(w, h) the even-block castles (the
// F(w, h) of Project Euler Problem 502) and A^o(w, h) the odd-block ones.

// ---- geometry -------------------------------------------------------------

export function blockCount(profile) {
  // base block (1) + one block per maximal run at each tower level.
  const height = 1 + Math.max(...profile, 0);
  let count = 1;
  for (let level = 1; level < height; level++) {
    let inRun = false;
    for (const col of profile) {
      if (col >= level) {
        if (!inRun) { count += 1; inRun = true; }
      } else {
        inRun = false;
      }
    }
  }
  return count;
}

export const isEvenBlocks = (profile) => blockCount(profile) % 2 === 0;

// ---- URD strings ----------------------------------------------------------

export function towerWord(profile) {
  let out = "";
  let prev = 0;
  for (const h of profile) {
    out += h >= prev ? "U".repeat(h - prev) : "D".repeat(prev - h);
    out += "R";
    prev = h;
  }
  out += "D".repeat(prev);
  return out;
}

export const toUrd = (profile) => "U" + towerWord(profile) + "D";

function isTower(word) {
  // The E_k grammar with k unbounded (a word of length n nests at most n/2
  // deep), checked in one pass: U and D balance without dipping below the
  // base, every U … D holds something (no "UD"), and two towers on one level
  // are parted by an R (no "DU").
  let depth = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === "U") {
      if (word[i + 1] === "D") return false;
      depth += 1;
    } else if (ch === "D") {
      if (depth === 0 || word[i + 1] === "U") return false;
      depth -= 1;
    } else if (ch !== "R") return false;
  }
  return depth === 0;
}

export function parseUrd(s) {
  if (typeof s !== "string" || s.length < 2 || s[0] !== "U" || s[s.length - 1] !== "D") {
    throw new Error("a castle string must be 'U' (tower) 'D'");
  }
  const tower = s.slice(1, -1);
  if (!isTower(tower)) throw new Error("invalid tower word");
  const profile = [];
  let height = 0;
  for (const ch of tower) {
    if (ch === "U") height += 1;
    else if (ch === "D") height -= 1;
    else if (ch === "R") profile.push(height);
    else throw new Error(`invalid character ${JSON.stringify(ch)}`);
  }
  if (profile.length === 0) throw new Error("castle must be at least 1 column wide");
  return profile;
}

// ---- features -------------------------------------------------------------

export function isSymmetric(profile) {
  for (let i = 0, j = profile.length - 1; i < j; i += 1, j -= 1) {
    if (profile[i] !== profile[j]) return false;
  }
  return true;
}

export function isConvex(profile) {
  let i = 0;
  while (i + 1 < profile.length && profile[i] <= profile[i + 1]) i += 1;
  while (i + 1 < profile.length && profile[i] >= profile[i + 1]) i += 1;
  return i === profile.length - 1;
}

export function numValleys(profile) {
  let v = 0;
  for (let c = 1; c < profile.length - 1; c += 1) {
    if (profile[c - 1] > profile[c] && profile[c] < profile[c + 1]) v += 1;
  }
  return v;
}

export function isConcave(profile) {
  if (numValleys(profile) === 0) return false;
  let i = 0;
  while (i + 1 < profile.length && profile[i] >= profile[i + 1]) i += 1;
  while (i + 1 < profile.length && profile[i] <= profile[i + 1]) i += 1;
  return i === profile.length - 1;
}

export function degree(profile) {
  let runs = 0;
  let inRun = false;
  for (const h of profile) {
    if (h >= 1) {
      if (!inRun) { runs += 1; inRun = true; }
    } else {
      inRun = false;
    }
  }
  return runs;
}

export function nickname(profile) {
  const parts = [];
  if (isSymmetric(profile)) parts.push("symmetric");
  if (isConvex(profile)) parts.push("convex");
  else if (isConcave(profile)) parts.push("concave");
  else parts.push("complex");
  const v = numValleys(profile);
  if (v > 0) parts.push(`${v}-valley`);
  return parts.join(" ");
}

// ---- counting -------------------------------------------------------------
//
// Column by column over the profile, from the block-count formula
//
//   blocks = 1 + sum_c max(0, x_c - x_{c-1}),   x_{-1} = 0,
//
// where x_c is the tower height of column c, in BigInt, so every count is
// exact at every size the app allows.

// Number of profiles x_0..x_{w-1} in [0, m] whose block count is even, i.e.
// whose rise sum is odd.
function evenProfiles(w, m) {
  if (m < 0) return 0n;
  // cnt[par][x]: profiles so far ending at height x with rise-sum parity par.
  let cnt = [Array(m + 1).fill(0n), Array(m + 1).fill(0n)];
  for (let x = 0; x <= m; x += 1) cnt[x & 1][x] = 1n;
  for (let c = 1; c < w; c += 1) {
    const next = [Array(m + 1).fill(0n), Array(m + 1).fill(0n)];
    const total = [cnt[0].reduce((a, b) => a + b, 0n), cnt[1].reduce((a, b) => a + b, 0n)];
    const below = [0n, 0n];             // sum over p < x
    const byClass = [[0n, 0n], [0n, 0n]]; // [p % 2][par], sum over p < x
    for (let x = 0; x <= m; x += 1) {
      const q = x & 1;
      for (let par = 0; par < 2; par += 1) {
        // p >= x: no rise, parity kept.  p < x: rise x - p, which flips the
        // parity exactly when p and x differ in parity.
        next[par][x] = (total[par] - below[par]) + byClass[q][par] + byClass[q ^ 1][par ^ 1];
      }
      for (let par = 0; par < 2; par += 1) {
        below[par] += cnt[par][x];
        byClass[q][par] += cnt[par][x];
      }
    }
    cnt = next;
  }
  return cnt[1].reduce((a, b) => a + b, 0n);
}

const countMemo = new Map();

// A(w, h) = h^w - (h-1)^w, the castles of width w and height h: the skylines
// in {1..h}^w less those that stay below h.
export function countAll(w, h) {
  if (w < 1 || h < 1) return 0n;
  return BigInt(h) ** BigInt(w) - BigInt(h - 1) ** BigInt(w);
}

// A^e(w, h), the even-block castles of width w and height h.
export function countEven(w, h) {
  if (w < 1 || h < 2) return 0n;
  const key = `${w},${h}`;
  if (!countMemo.has(key)) {
    if (countMemo.size > 256) countMemo.clear();
    countMemo.set(key, evenProfiles(w, h - 1) - evenProfiles(w, h - 2));
  }
  return countMemo.get(key);
}

// ---- PE502-1 eq. (4.4) ---------------------------------------------------
//
// The report's closed form, A^e(w, h) = 1/2 [h^w - (h-1)^w - P(h-1, w) + P(h-2, w)],
// where P(k, w), eq. (4.2), adds up (-1)^blocks over the towers (a castle
// with its bottom row removed) of height at most k on a base of length w.
// P(k, w) is the coefficient of x^w in num_k / den_k, from num_0 = 1,
// den_0 = 1 - x and the update of eq. (5.3)
//
//   num_k = 2 den_{k-1} - num_{k-1},   den_k = (1 - 2x) den_{k-1} + x num_{k-1}.

// [P(k - 1, L), P(k, L)], with P(-1, L) = 0, a sum over the empty set.
function signedTowerPair(k, L) {
  if (k < 0) return [0n, 0n];
  let num = [1n], den = [1n, -1n];
  let prev = null;
  for (let j = 1; j <= k; j += 1) {
    prev = [num, den];
    const n2 = den.map((d, i) => 2n * d - (num[i] || 0n));
    const d2 = Array(den.length + 1).fill(0n);
    den.forEach((d, i) => { d2[i] += d; d2[i + 1] -= 2n * d; });
    num.forEach((n, i) => { d2[i + 1] += n; });
    num = n2; den = d2;
  }
  // den_k has constant term 1, so the series divides out term by term.
  const coeff = ([n, d]) => {
    const p = [];
    for (let i = 0; i <= L; i += 1) {
      let s = n[i] || 0n;
      for (let j = 1; j < d.length && j <= i; j += 1) s -= d[j] * p[i - j];
      p.push(s);
    }
    return p[L];
  };
  return [prev ? coeff(prev) : 0n, coeff([num, den])];
}

const closedMemo = new Map();

// eq. (4.4) term by term.  all = A(w, h) = h^w - (h-1)^w, eq. (3.1); high and
// low = P(h-1, w) and P(h-2, w); signs = high - low adds up the signs of the
// towers of height exactly h - 1, the towers of the castles of height h.  A
// castle's towers have one block fewer, so an even-block castle's sign is
// -1 and an odd-block castle's +1: all - signs counts each even-block castle
// twice and each odd-block castle not at all, all + signs the reverse.
// even = A^e(w, h) and odd = A^o(w, h) are their halves.
export function closedForm(w, h) {
  const key = `${w},${h}`;
  if (!closedMemo.has(key)) {
    if (closedMemo.size > 256) closedMemo.clear();
    const [low, high] = signedTowerPair(h - 1, w);
    const hw = BigInt(h) ** BigInt(w), h1w = BigInt(h - 1) ** BigInt(w);
    const all = hw - h1w, signs = high - low;
    const twiceEven = all - signs, twiceOdd = all + signs;
    closedMemo.set(key, { hw, h1w, all, high, low, signs, twiceEven, twiceOdd, even: twiceEven / 2n, odd: twiceOdd / 2n });
  }
  return closedMemo.get(key);
}

// A^e(w, h) = 0 exactly when h = 1, or w <= 2 and h is odd.  For w <= 2 the
// rise sum is the tallest tower, h - 1, so every castle has h blocks.  For
// w >= 3 and h >= 2, [h-1, 0, 0, ...] has h blocks and [h-1, 0, 1, 0, ...]
// has h + 1, so one of the two is an even-block castle.
export const hasEvenBlockCastles = (w, h) => w >= 1 && h >= 2 && (w >= 3 || h % 2 === 0);

// ---- rendering -------------------------------------------------------------

export function renderSVG(profile) {
  const w = profile.length;
  const h = 1 + Math.max(...profile, 0);
  const blocks = [[1, 1, w]]; // base block: [row, col0, col1]
  for (let level = 1; level < h; level += 1) {
    let start = null;
    for (let c = 0; c < w; c += 1) {
      if (profile[c] >= level) {
        if (start === null) start = c;
      } else if (start !== null) {
        blocks.push([level + 1, start + 1, c]);
        start = null;
      }
    }
    if (start !== null) blocks.push([level + 1, start + 1, w]);
  }
  const rects = blocks
    .map(([row, c0, c1]) => `<rect x="${c0 - 1}" y="${h - row}" width="${c1 - c0 + 1}" height="1"/>`)
    .join("\n");
  const CELL = 20;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * CELL}" height="${h * CELL}">\n` +
    "<style>rect{fill:#4a6fa5;stroke:#2c3e50;stroke-width:0.04;}</style>\n" +
    `${rects}\n</svg>`
  );
}

export function renderAscii(profile) {
  const h = 1 + Math.max(...profile, 0);
  const lines = [];
  for (let row = h; row >= 1; row -= 1) {
    let line = "";
    for (let c = 0; c < profile.length; c += 1) {
      line += row <= profile[c] + 1 ? "#" : ".";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

// ---- fact sheet -----------------------------------------------------------

export function factSheet(profile) {
  const w = profile.length;
  const h = 1 + Math.max(...profile, 0);
  return {
    urd: toUrd(profile),
    width: w,
    height: h,
    profile: profile.slice(),
    blocks: blockCount(profile),
    evenBlock: isEvenBlocks(profile),
    degree: degree(profile),
    valleys: numValleys(profile),
    features: {
      symmetric: isSymmetric(profile),
      convex: isConvex(profile),
      concave: isConcave(profile),
      has_valley: numValleys(profile) > 0,
    },
    nickname: nickname(profile),
    countAll: countAll(w, h),
    countEven: countEven(w, h),
    ascii: renderAscii(profile),
    svg: renderSVG(profile),
  };
}

// ---- generators -----------------------------------------------------------
//
// Both draws are uniform: towers are drawn in [0, h-1] and the profile is kept
// once it reaches h - 1, so every castle of width w and height h, of either
// parity, is equally likely.

export function randomCastle(w, h, rng = Math.random) {
  for (;;) {
    const profile = Array.from({ length: w }, () => Math.floor(rng() * h));
    if (Math.max(...profile) === h - 1) return profile;
  }
}

// A symmetric castle is fixed by its left half (the middle column included),
// so a uniform half, mirrored, is a uniform symmetric castle.
export function randomSymmetric(w, h, rng = Math.random) {
  const k = Math.ceil(w / 2);
  for (;;) {
    const half = Array.from({ length: k }, () => Math.floor(rng() * h));
    if (Math.max(...half) === h - 1) return half.concat(half.slice(0, w - k).reverse());
  }
}

export const tallest = (w, h) => [h - 1, ...Array(w - 1).fill(0)];
export const widest = (w, h) => Array(w).fill(h - 1);
