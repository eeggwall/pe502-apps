// castles.js: castles of height 2, after technical report PE502-2.
//
// A castle of width w and height 2 is a skyline c = (c_1, …, c_w) with every
// c_i in {1, 2} and some c_i = 2.  A Fibonacci castle has no two neighboring
// columns of height 2; a ridge castle has no two neighboring columns of
// height 1.  Removing the bottom row records a castle by its string
// (c_1 − 1, …, c_w − 1) of 0s and 1s.  Counts are BigInt and exact.

// ---- one skyline ---------------------------------------------------------

export const height = (c) => Math.max(0, ...c);

// Total descent of the skyline padded with c_0 = c_{w+1} = 0, PE502-2 eq. (1.2).
export function blocks(c) {
  let n = 0;
  for (let i = 0; i <= c.length; i++) {
    const a = i ? c[i - 1] : 0, b = i < c.length ? c[i] : 0;
    if (a > b) n += a - b;
  }
  return n;
}

// Neighboring pairs (i, i + 1), 0-based i, where both columns have height v.
const pairs = (c, v) => c.slice(0, -1).map((x, i) => (x === v && c[i + 1] === v ? i : -1)).filter((i) => i >= 0);
export const fibonacciBreaks = (c) => pairs(c, 2);   // a 2 × 2 square of cells
export const ridgeBreaks = (c) => pairs(c, 1);       // a notch two cells wide

export const isFibonacci = (c) => height(c) === 2 && fibonacciBreaks(c).length === 0;
export const isRidge = (c) => height(c) === 2 && ridgeBreaks(c).length === 0;

// Exchanging the heights 1 and 2, PE502-2 Figure 5.
export const exchange = (c) => c.map((x) => 3 - x);

// ---- Fibonacci numbers ---------------------------------------------------

// F_n by fast doubling: F_2k = F_k (2 F_{k+1} − F_k), F_{2k+1} = F_k² + F_{k+1}².
export function fib(n) {
  let a = 0n, b = 1n;
  for (let bit = 1 << Math.max(0, Math.floor(Math.log2(Math.max(1, n)))); bit; bit >>= 1) {
    const c = a * (2n * b - a), d = a * a + b * b;
    if (n & bit) { a = d; b = c + d; } else { a = c; b = d; }
  }
  return a;
}

const fibNum = (n) => Number(fib(n));   // exact for n ≤ 78

// ---- Zeckendorf rank, PE502-2 Proposition 13 -----------------------------

// Column i (from 1) has the weight F_{w+2−i}; the rank is the sum of the
// weights of the columns of height 2.  Exact as a Number for w ≤ 76.
export const weight = (w, i) => fibNum(w + 2 - i);
export const rank = (c) => c.reduce((r, x, i) => r + (x === 2 ? weight(c.length, i + 1) : 0), 0);

// The greedy inverse: c_i = 2 when F_{w+2−i} fits in what is left of r.
export function unrank(r, w) {
  const c = [];
  for (let i = 1; i <= w; i++) {
    const f = weight(w, i);
    if (f <= r) { c.push(2); r -= f; } else c.push(1);
  }
  return c;
}

// The Fibonacci castles of width w in lexicographic order, ranks 1 … F_{w+2} − 1.
export function fibonacciCastles(w) {
  const out = [];
  for (let r = 1, n = fibNum(w + 2); r < n; r++) out.push(unrank(r, w));
  return out;
}

// ---- random castles, every castle of the family equally likely ----------

export function randomHeight2(w, rng = Math.random) {
  for (;;) {
    const c = Array.from({ length: w }, () => (rng() < 0.5 ? 1 : 2));
    if (height(c) === 2) return c;
  }
}

export const randomFibonacci = (w, rng = Math.random) => unrank(1 + Math.floor(rng() * (fibNum(w + 2) - 1)), w);

// For w ≥ 2 the exchange takes the Fibonacci strings of length w, the
// all-zero string included, onto the ridge castles, eq. (6.1).
export function randomRidge(w, rng = Math.random) {
  if (w === 1) return [2];
  return exchange(unrank(Math.floor(rng() * fibNum(w + 2)), w));
}

// ---- closed forms --------------------------------------------------------

// S_F(w) for w = 1 … 6, eq. (1.5), and P_F(L) for L = 0 … 5, eq. (4.3).
export const SF_TABLE = [1, 2, 2, 1, 0, 0];
export const PF_TABLE = [1, 0, -1, -1, 0, 1];
export const SF = (w) => SF_TABLE[(w - 1) % 6];
export const PF = (L) => PF_TABLE[L % 6];

// Fibonacci castles of width w by Theorem 2 and eq. (4.4):
// T_F = F_{w+2} strings, P_F their signed count; removing the all-zero string
// (sign +1) leaves A_F = T_F − 1 and S_F = 1 − P_F; A^e_F = ½(A_F + S_F).
export function closedForm(w) {
  const TF = fib(w + 2), PFw = BigInt(PF(w));
  const AF = TF - 1n, SFw = 1n - PFw;
  return { TF, PF: PFw, AF, SF: SFw, twiceEven: AF + SFw, twiceOdd: AF - SFw, even: (AF + SFw) / 2n, odd: (AF - SFw) / 2n };
}

// Re((1 + i)^n): (1 + i)² = 2i, so (1 + i)^n is 2^{n/2} i^{n/2} or (1 + i) 2^k i^k.
function rePow1i(n) {
  const k = n >> 1, p = 1n << BigInt(k);
  return n % 2 === 0 ? [p, 0n, -p, 0n][k % 4] : [p, -p, -p, p][k % 4];
}

// All castles of width w and height 2, eqs. (1.1) and (4.5).
export function allHeight2(w) {
  const all = (1n << BigInt(w)) - 1n;
  const S = 1n - rePow1i(w + 1);
  return { all, S, even: (all + S) / 2n, odd: (all - S) / 2n };
}

// Ridge castles of width w and height 2, eq. (6.1).
export const ridgeCount = (w) => (w === 1 ? 1n : fib(w + 2));

// ---- transfer matrix, PE502-2 eq. (3.2), with the blocks kept ----------

// An element a + b·y of Z[y]/(y² − 1): y marks one block of the towers, so a
// counts the strings with an even number of tower blocks and b the odd.
const mul = ([a, b], [c, d]) => [a * c + b * d, a * d + b * c];
const add = ([a, b], [c, d]) => [a + c, b + d];
const matMul = (X, Y) => [0, 1].map((s) => [0, 1].map((u) => add(mul(X[s][0], Y[0][u]), mul(X[s][1], Y[1][u]))));

// Builds the strings of length w column by column, from letter s to letter u:
// a 1 after a 0 starts a new block of the towers.  The Fibonacci rule removes
// the step 1 → 1.  The castles are the strings other than the all-zero one,
// with one block more than their towers, so the even-block castles are the
// strings with an odd number of tower blocks.  This count does not use the
// Fibonacci numbers or the period, so it checks closedForm independently.
const O = [0n, 0n], ONE = [1n, 0n], Y = [0n, 1n];
const stepMatrix = (rule) => [[ONE, Y], [ONE, rule === "fibonacci" ? O : ONE]];

// The castle counts from r, the strings of one length by their last letter.
function tally(r) {
  const t = add(r[0], r[1]);
  const even = t[1], odd = t[0] - 1n;
  return { even, odd, all: even + odd, S: even - odd };
}

// r for length lo: start at 0 (weight 1) or at 1 (one block, weight y),
// then lo − 1 steps by squaring.
function startRow(lo, M) {
  let P = [[ONE, O], [O, ONE]], B = M;
  for (let e = lo - 1; e > 0; e >>= 1) {
    if (e & 1) P = matMul(P, B);
    B = matMul(B, B);
  }
  return [0, 1].map((u) => add(mul(ONE, P[0][u]), mul(Y, P[1][u])));
}

export const transfer = (w, rule) => tally(startRow(w, stepMatrix(rule)));

// The counts at every width lo … hi: one power, then one column per width.
export function transferRange(lo, hi, rule) {
  const M = stepMatrix(rule);
  let r = startRow(lo, M);
  const out = [tally(r)];
  for (let w = lo + 1; w <= hi; w++) {
    r = [0, 1].map((u) => add(mul(r[0], M[0][u]), mul(r[1], M[1][u])));
    out.push(tally(r));
  }
  return out;
}
