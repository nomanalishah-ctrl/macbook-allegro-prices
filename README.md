# MacBook Parts Price Checker (Allegro, PLN)

A free static website. Enter a MacBook A-model (e.g. `A2338`) and a part name (e.g. `battery`).
The site shows saved Allegro offers in PLN (seller, price, delivery, total, lowest/median/highest)
and opens the matching live search on allegro.pl.

## Publish for free on GitHub Pages

1. Create a free account at https://github.com and click **New repository**.
   Name it e.g. `macbook-allegro-prices`, set it to **Public**, do not add a README.
2. Unzip this project, open a terminal in the folder, then run:

   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/macbook-allegro-prices.git
   git push -u origin main
   ```

3. In the repository on GitHub: **Settings → Pages**.
   Under **Build and deployment**, set **Source: Deploy from a branch**,
   **Branch: main**, folder **/ (root)**, then **Save**.
4. Wait about a minute. Your site is live at:
   `https://YOUR_USERNAME.github.io/macbook-allegro-prices/`

Every `git push` to `main` updates the live site automatically.

## Test locally

Opening `index.html` directly cannot load `data/prices.json`. Use a local server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000

## Price tracker

Under the search box, choose **Track this part** to add the current A-model and part to your tracker.
Track as many parts as you want and remove any with **Remove**.

Each tracked part shows, in PLN (item price + delivery):

- **Current lowest**: the cheapest listing in `data/prices.json` right now, with seller, condition and a link.
- **All-time low**: the cheapest price ever recorded, with its date, seller and listing link.
- **Average price across all listings** over the last **30 days, 3 months, 6 months and 1 year**.
  This is the mean of every listing price recorded in that window (not an average of daily minimums).
  The card also shows how many listings and checks it is based on, and marks a range as
  **Partial** when the recorded history is shorter than the range.
- The change in the lowest price since the previous check, and a small history chart.

### Where the history comes from

1. **`data/history.json` (shared, in the repo).** One entry per model, part and date, holding the lowest
   total (with its listing), plus the sum and count of all listing totals. This is what makes 6-month and
   1-year averages possible for every visitor. It is filled automatically:
   - Edit `data/prices.json` (set `"updated": "YYYY-MM-DD"`), commit and push.
   - The workflow in `.github/workflows/update-history.yml` runs `scripts/update-history.js` and commits the
     updated `data/history.json`. You can also run it by hand: `node scripts/update-history.js`.
   - To start from older data, add entries to `data/history.json` yourself (see `data/history.example.json`).
2. **This browser.** Each visit also saves a check in the visitor's own browser (localStorage). It is private to them,
   not synced between devices, and cleared if they clear site data. Shared data wins if both have the same date.

Averages need real data: with no history there is nothing to average, and a brand-new site will show
"Partial" ranges until enough days have been recorded.

## Adding prices

Edit `data/prices.json` (see `data/prices.example.json`), commit and push:

```json
{
  "updated": "2026-10-26",
  "offers": [
    { "model": "A2338", "part": "battery", "seller": "SellerName",
      "condition": "New", "price": 199.00, "delivery": 12.99,
      "url": "https://allegro.pl/oferta/..." }
  ]
}
```

- `model` must match the A-model exactly (case-insensitive).
- `part` matches by text, so `battery` also finds `battery replacement`.
- All amounts are numbers in PLN, no currency text.
- `url` must start with `https://allegro.pl/`, otherwise the link falls back to a search.

## Automatic live prices (optional, later)

A static site cannot call Allegro directly: the official Allegro REST API needs a registered app
and a client secret, which must never be put in browser code. The safe free approach:

1. Register an app at https://developer.allegro.pl and get a client ID and secret.
2. Store them in the repo under **Settings → Secrets and variables → Actions**.
3. Add a scheduled GitHub Action that calls the Allegro API, writes `data/prices.json`,
   and commits it. The site then shows fresh prices with no server.

Check Allegro's API terms before automating. Do not scrape allegro.pl.

## Files

- `index.html`, `style.css`, `app.js`: the site
- `data/prices.json`: your current offers (starts empty)
- `data/history.json`: recorded price history (starts empty, updated by the workflow)
- `scripts/update-history.js` and `.github/workflows/update-history.yml`: record history automatically
- `.nojekyll`: tells GitHub Pages to serve files as-is
