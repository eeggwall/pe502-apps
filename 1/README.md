# Castle Foundry

A castle designer and counter, companion to technical report PE502-1,
*Castle Polyominoes and How to Count Them*. Draw a castle on the field or
press a generator; the console reads out its block count, the castle counts
at its width and height, and a fact sheet, and the line printer prints it in
the representation picked on the Printout panel.

## Notation

The notation is PE502-1's. A castle may have an even or an odd number of
blocks: A(w, h) counts all castles of width w and height h, A^e(w, h) the
even-block castles (the F(w, h) of Project Euler Problem 502) and A^o(w, h)
the odd-block ones. The castle's parity is a notification, in amber either
way; neither parity is a fault.

## The console

* **Castle field**: click above a tower to raise it, on a tower to lower it,
  or drag to paint; with the field focused, <kbd>←</kbd> <kbd>→</kbd> pick a
  column and <kbd>↑</kbd> <kbd>↓</kbd> raise or lower it. Each block is drawn
  as one brick, its cells joined along the row, as PE502-1 Figure 1 outlines
  them; <kbd>B</kbd> shows the cells. The Blocks readout sums the bricks row
  by row.
* **Dimensions**: width w from 1 to 200, height h from 1 to 100. The rails
  hatch the sizes where A^e(w, h) = 0: h = 1, or w ≤ 2 with h odd.
* **Exact counts**: `castles.js` computes A(w, h) = h^w − (h−1)^w and
  A^e(w, h) column by column in BigInt, exact at every size the dials allow
  (A^e(200, 100) has 400 digits).
* **Generators**: Random and Symmetric give every castle of the dialed size,
  of either parity, the same chance.
* **Line printer**: under the generators. Its base lines up with the bottom
  of the right column and its window reaches up to the generators, so it
  grows with the readouts on larger grids.
* **Printout panel**: ends the right column and picks one representation to
  print: the URD word (the default), the integer tuple, the excursion/gap
  word or the cycle forest (`representations.js`, after the castles wiki's
  castle-representations page). Every sheet ends stamped Checked: EVEN-BLOCK
  or ODD-BLOCK. A generator press, a panel button, Line feed (<kbd>L</kbd>)
  or <kbd>P</kbd> (next representation) prints line by line; drawing by hand
  reprints at once.
* **Mimic diagram**: PE502-1 eq. (4.4) laid out as a flow on lit pipes. Its
  four terms (h^w, (h−1)^w, P(h−1, w), P(h−2, w)) pair off into A(w, h) and
  the signs of the castles' towers; those two split and recombine as
  A − signs and A + signs, twice the even-block and twice the odd-block
  castles; and each halves into A^e and A^o. Boxes hold the counts, every
  number printed whole; circles on the pipes are the operations.
  `castles.js` closedForm computes P from eq. (5.3).
* **Address**: `#c=2,3,5,2,3,1,5,4&h=5&rep=urd` holds the skyline, the
  ceiling and the printout, so a link reopens the castle.
* **Header plate**: pe502.com's masthead: PE502, "Castle polyominoes, after
  Project Euler problem 502", with pe502.com's castle seal.

Keys: <kbd>B</kbd> bricks, <kbd>G</kbd> grid, <kbd>L</kbd> line feed,
<kbd>P</kbd> printout, <kbd>M</kbd> motion.

## Files

| File | Contents |
|------|----------|
| `index.html` | The console |
| `app.js` | Field, readouts, generators, line printer, mimic diagram |
| `castles.js` | Exact castle counts and the closed form |
| `representations.js` | The printout representations |
| `style.css` | Console styling |
| `fonts.css` | Michroma, Chakra Petch and Share Tech Mono, embedded |
| `LICENSE-FONTS.txt` | SIL Open Font License 1.1 for the fonts |

## Running it

Serve the repo root and open `1/` (ES modules need http, not `file://`):

```bash
python3 -m http.server 8000 --protocol HTTP/1.1
# open http://localhost:8000/1/
```
