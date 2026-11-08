# Saturday flow prototype (throwaway)

Answers [The Saturday flow on a phone](https://github.com/Pinilla/pinillalist/issues/5). Never merge this branch.

Three layouts of the weekly order: A step by step (chosen), B one list, C tabs. Live copy: https://list.pinillaweb.org/prototypes/saturday-order.html

The household's recipe data isn't committed. To rebuild, run `python3 gen.py` (it reads `~/anylist-export/user-data.json` and the photos and writes `data.js`), then replace `/*DATA*/` in `template.html` with the contents of `data.js`. The served copy also needs a doctype, head and viewport meta added.
