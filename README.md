# pe502-apps

Single-page web apps that go with the PE502 technical reports in
[pe502-pubs](https://git.charlesreid1.com/eeggwall/pe502-pubs), a series on
castle polyominoes after Project Euler Problem 502.

| App | Name | Companion to |
|-----|------|--------------|
| [`1/`](1/) | Castle Foundry | PE502-1, *Castle Polyominoes and How to Count Them* |

Each app lives in its own numbered directory and stands alone: plain HTML,
CSS and ES modules, with no build step, no dependencies, and nothing loaded
over the network (fonts are embedded). Each app's README says what it does
and which report it follows.

## Notation

The apps use the reports' notation (pe502-pubs `HOUSE_STYLE.md`, Part II).
A castle may have an even or an odd number of blocks, and both are valid
castles. A(w, h) counts all castles of width w and height h, A^e(w, h) the
even-block castles and A^o(w, h) the odd-block ones. Project Euler's
F(w, h) is A^e(w, h).

## Running an app

ES modules need http, not `file://`. Serve the repo root and open the app's
directory:

```bash
python3 -m http.server 8000 --protocol HTTP/1.1
# open http://localhost:8000/1/
```

## License

MIT; see [LICENSE](LICENSE). Fonts embedded in an app are under the SIL Open
Font License 1.1, in that app's `LICENSE-FONTS.txt`.
