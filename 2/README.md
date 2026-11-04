# Fibonacci Castles

An explorer and parity tracker for castles of height 2, companion to
technical report PE502-2, *Fibonacci Castles*. Draw a castle on the field or
press a generator; the console lights its families and parity and reads out
its blocks, the castle counts at its width and its Zeckendorf rank. The
Parity tracker counts the Fibonacci castles exactly at widths far past
drawing.

## Notation

The notation is PE502-2's. A castle may have an even or an odd number of
blocks. A(w, 2) counts the castles of width w and height 2, A_F(w) the
Fibonacci castles (no two neighboring columns of height 2), A^e_F(w) and
A^o_F(w) the even-block and odd-block ones, and S_F(w) = A^e_F(w) − A^o_F(w).
A ridge castle has no two neighboring columns of height 1. Parity and family
are notifications, in amber; neither parity and neither family is a fault.

## The console

Two pages, picked with the keys at the top or <kbd>1</kbd> and <kbd>2</kbd>.

* **Explorer**: one castle of height 2 at a time, widths 1 to 40, drawn on a
  cell grid, each block one brick (<kbd>B</kbd> shows the cells). Click or
  drag to switch columns between heights 1 and 2; with the field focused,
  <kbd>←</kbd> <kbd>→</kbd> pick a column and <kbd>↑</kbd> <kbd>↓</kbd> set
  its height. Cells where the Fibonacci or ridge rule breaks are tinted amber.
  Above the field an annunciator lights Fibonacci castle, Ridge castle,
  Even-block castle or Odd-block castle while the castle on the field is one.
  Beside the controls, as in `1/`: the blocks with their parity, and the
  castle counts A(w, 2), A^e(w, 2) and A^o(w, 2), with a lamp on each count
  the castle is part of. Under the generators, the Zeckendorf rank of PE502-2
  Proposition 13 (<kbd>[</kbd> <kbd>]</kbd> step it). Generators draw
  uniformly from all castles of height 2, the Fibonacci castles or the ridge
  castles; Exchange (<kbd>X</kbd>) swaps heights 1 and 2 (PE502-2 Figure 5).
  Up to width 10 a catalog draws every Fibonacci castle, split by parity.
* **Parity tracker**: no drawing, only exact counts, at widths 1 to 100,000
  (A_F(100,000) has 20,899 digits): A_F(w), A^e_F(w), A^o_F(w), and S_F(w)
  beside the six values of its period (PE502-2 Theorem 3), with a waveform of
  S_F over the last 36 widths. Jumps of ±6 and ×10, and an auto-step
  (<kbd>W</kbd>).
* **Exact counts**: `castles.js` computes every count in BigInt twice, from
  the closed forms of PE502-2 Theorem 2 and eq. (4.4) and from the transfer
  matrix of eq. (3.2) with the blocks kept, which uses neither the Fibonacci
  numbers nor the period.
* **Address**: `#p=explorer&c=2,1,2,1,2,1,2,1&w=36` holds the page, the
  explorer's skyline and the tracker's width, so a link reopens them.
* **Header plate**: pe502.com's masthead: PE502, "Castle polyominoes, after
  Project Euler problem 502", with pe502.com's castle seal.

Keys: <kbd>1</kbd> <kbd>2</kbd> pages, <kbd>B</kbd> bricks, <kbd>X</kbd>
exchange, <kbd>[</kbd> <kbd>]</kbd> rank, <kbd>W</kbd> auto-step,
<kbd>M</kbd> motion.

## Files

| File | Contents |
|------|----------|
| `index.html` | The console |
| `app.js` | Explorer, annunciator, catalog, parity tracker, waveform |
| `castles.js` | Exact counts, closed forms, transfer matrix, Zeckendorf rank |
| `style.css` | Console styling |
| `fonts.css` | Michroma, Chakra Petch and Share Tech Mono, embedded |
| `LICENSE-FONTS.txt` | SIL Open Font License 1.1 for the fonts |

## Running it

Serve the repo root and open `2/` (ES modules need http, not `file://`):

```bash
python3 -m http.server 8000 --protocol HTTP/1.1
# open http://localhost:8000/2/
```
