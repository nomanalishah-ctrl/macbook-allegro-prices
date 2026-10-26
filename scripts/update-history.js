// Appends today's aggregate price data from data/prices.json to data/history.json.
// Run:  node scripts/update-history.js
// Needs "updated": "YYYY-MM-DD" in data/prices.json. Running it again for the same date replaces that day's entry.
const fs = require('fs');

const PRICES = 'data/prices.json';
const HISTORY = 'data/history.json';

const prices = JSON.parse(fs.readFileSync(PRICES, 'utf8'));
let history = { entries: [] };
try { history = JSON.parse(fs.readFileSync(HISTORY, 'utf8')); } catch (e) { /* first run */ }
if (!Array.isArray(history.entries)) history.entries = [];

const date = prices.updated;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
  console.log('data/prices.json needs an "updated" date like 2026-10-26. Nothing recorded.');
  process.exit(0);
}

const groups = {};
(prices.offers || []).forEach((o) => {
  const price = Number(o.price);
  if (!o.model || !o.part || !isFinite(price)) return;
  const delivery = Number(o.delivery) || 0;
  const total = Math.round((price + delivery) * 100) / 100;
  const model = String(o.model).toUpperCase();
  const part = String(o.part).toLowerCase();
  const key = model + '|' + part;
  const g = groups[key] || (groups[key] = { model, part, sum: 0, n: 0, min: Infinity, low: null });
  g.sum += total;
  g.n += 1;
  if (total < g.min) {
    g.min = total;
    g.low = { seller: o.seller || '', condition: o.condition || '', price, delivery, url: o.url || '' };
  }
});

const fresh = Object.keys(groups).map((k) => {
  const g = groups[k];
  return { model: g.model, part: g.part, d: date, min: g.min, sum: Math.round(g.sum * 100) / 100, n: g.n, low: g.low };
});

const replaced = new Set(fresh.map((e) => e.model + '|' + e.part + '|' + e.d));
history.entries = history.entries
  .filter((e) => !replaced.has(String(e.model).toUpperCase() + '|' + String(e.part).toLowerCase() + '|' + e.d))
  .concat(fresh)
  .sort((a, b) => a.d.localeCompare(b.d) || a.model.localeCompare(b.model) || a.part.localeCompare(b.part));

fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2) + '\n');
console.log('Recorded ' + fresh.length + ' model/part group(s) for ' + date + '.');
