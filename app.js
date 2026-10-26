(function () {
  var PARTS = ['Battery', 'Display', 'Keyboard', 'Trackpad', 'Charger', 'SSD'];
  var STORE_KEY = 'macbook-allegro-tracker-v1';
  var MAX_HISTORY = 400;
  var RANGES = [
    { label: '30 days', days: 30 },
    { label: '3 months', months: 3 },
    { label: '6 months', months: 6 },
    { label: '1 year', months: 12 }
  ];
  var $ = function (id) { return document.getElementById(id); };

  var offers = [];
  var updated = null;
  var loadError = false;
  var storageOk = true;
  var tracked = [];
  var sharedHistory = [];

  var nf = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function pln(n) { return nf.format(n) + ' PLN'; }
  function total(o) { return (Number(o.price) || 0) + (Number(o.delivery) || 0); }
  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function allegroUrl(q) { return 'https://allegro.pl/listing?string=' + encodeURIComponent(q); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function isDate(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function rangeStart(r) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    if (r.days) d.setDate(d.getDate() - r.days); else d.setMonth(d.getMonth() - r.months);
    return fmtDate(d);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function cell(text, cls) { return el('td', cls, text); }

  /* ---------- offers ---------- */
  function matches(model, part) {
    var m = String(model || '').trim().toLowerCase();
    var p = String(part || '').trim().toLowerCase();
    return offers.filter(function (o) {
      var om = String(o.model || '').toLowerCase();
      var op = String(o.part || '').toLowerCase();
      return (!m || om === m) && (!p || op.indexOf(p) !== -1);
    }).map(function (o) { o._total = total(o); return o; })
      .sort(function (a, b) { return a._total - b._total; });
  }

  /* ---------- tracker storage ---------- */
  function validItem(x) {
    return x && typeof x.id === 'string' && typeof x.model === 'string' &&
      typeof x.part === 'string' && Array.isArray(x.history);
  }
  function loadTracked() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(validItem) : [];
    } catch (e) { storageOk = false; return []; }
  }
  function saveTracked() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(tracked)); }
    catch (e) { storageOk = false; }
  }
  function makeId(model, part) { return model.toUpperCase() + '|' + part.toLowerCase(); }

  // Record today's aggregate for every tracked item (one entry per data date):
  // lowest total + the listing it came from, and sum/count of all listing totals (for averages).
  function recordSnapshots() {
    var key = isDate(updated) ? updated : today();
    tracked.forEach(function (item) {
      var list = matches(item.model, item.part);
      if (!list.length) return;
      var cheapest = list[0];
      var entry = {
        d: key,
        min: cheapest._total,
        sum: list.reduce(function (a, o) { return a + o._total; }, 0),
        n: list.length,
        low: {
          seller: cheapest.seller || '', condition: cheapest.condition || '',
          price: Number(cheapest.price) || 0, delivery: Number(cheapest.delivery) || 0,
          url: cheapest.url || ''
        }
      };
      var last = item.history[item.history.length - 1];
      if (last && last.d === key) { item.history[item.history.length - 1] = entry; }
      else { item.history.push(entry); }
      if (item.history.length > MAX_HISTORY) item.history = item.history.slice(-MAX_HISTORY);
    });
    saveTracked();
  }

  /* ---------- history (shared file + this browser) ---------- */
  function entryOf(h) {
    var min = Number(h.min);
    return {
      d: h.d, min: min,
      sum: isFinite(h.sum) && h.sum !== null ? Number(h.sum) : min,
      n: h.n > 0 ? Number(h.n) : 1,
      low: h.low || null
    };
  }
  function mergedHistory(item) {
    var byDate = {};
    sharedHistory.forEach(function (e) {
      if (!e || !isDate(e.d) || !isFinite(e.min)) return;
      if (String(e.model || '').toUpperCase() !== item.model) return;
      if (String(e.part || '').toLowerCase().indexOf(item.part) === -1) return;
      var ne = entryOf(e);
      var c = byDate[e.d];
      if (!c) { byDate[e.d] = ne; }
      else {
        c.sum += ne.sum; c.n += ne.n;
        if (ne.min < c.min) { c.min = ne.min; c.low = ne.low; }
      }
    });
    item.history.forEach(function (h) {
      if (h && isDate(h.d) && isFinite(h.min) && !byDate[h.d]) byDate[h.d] = entryOf(h);
    });
    return Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
  }
  function windowAvg(hist, r) {
    var start = rangeStart(r);
    var sel = hist.filter(function (e) { return e.d >= start; });
    if (!sel.length) return null;
    var sum = 0, n = 0;
    sel.forEach(function (e) { sum += e.sum; n += e.n; });
    return { avg: sum / n, n: n, k: sel.length, partial: hist[0].d > start, since: hist[0].d };
  }
  function allTimeLow(hist) {
    var best = null;
    hist.forEach(function (e) { if (!best || e.min < best.min) best = e; });
    return best;
  }

  function setStatus(msg) { $('trackStatus').textContent = msg; }

  function addTracked() {
    var model = $('model').value.trim();
    var part = $('part').value.trim();
    if (!model || !part) { setStatus('Enter both an A-model and a part name to track it.'); return; }
    var id = makeId(model, part);
    if (tracked.some(function (t) { return t.id === id; })) {
      setStatus(model.toUpperCase() + ' ' + part.toLowerCase() + ' is already tracked.');
      return;
    }
    tracked.push({ id: id, model: model.toUpperCase(), part: part.toLowerCase(), added: today(), history: [] });
    recordSnapshots();
    renderTracker();
    setStatus('Now tracking ' + model.toUpperCase() + ' ' + part.toLowerCase() + '.');
  }

  function removeTracked(id) {
    var item = tracked.filter(function (t) { return t.id === id; })[0];
    tracked = tracked.filter(function (t) { return t.id !== id; });
    saveTracked();
    renderTracker();
    if (item) setStatus('Removed ' + item.model + ' ' + item.part + ' from the tracker.');
    $('trackerTitle').focus();
  }

  /* ---------- tracker UI ---------- */
  function sparkline(history) {
    var NS = 'http://www.w3.org/2000/svg';
    var W = 140, H = 36, PAD = 4;
    var vals = history.map(function (h) { return h.min; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = hi - lo || 1;
    var pts = vals.map(function (v, i) {
      var x = PAD + (i * (W - 2 * PAD)) / (vals.length - 1);
      var y = H - PAD - ((v - lo) / span) * (H - 2 * PAD);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('class', 'spark');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Price history: ' + vals.length + ' checks, from ' + pln(vals[0]) + ' to ' + pln(vals[vals.length - 1]));
    var line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', pts.join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#14171A');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
    var lastPt = pts[pts.length - 1].split(',');
    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', lastPt[0]);
    dot.setAttribute('cy', lastPt[1]);
    dot.setAttribute('r', '3.5');
    dot.setAttribute('fill', '#FF6A1A');
    dot.setAttribute('stroke', '#14171A');
    dot.setAttribute('stroke-width', '1.5');
    svg.appendChild(dot);
    return svg;
  }

  function listingLink(low, item) {
    var href = String((low && low.url) || '');
    var ok = /^https:\/\/(www\.)?allegro\.pl\//.test(href);
    var a = el('a', 'stat-link', ok ? 'Open listing' : 'Search on Allegro');
    a.target = '_blank';
    a.rel = 'noopener';
    a.href = ok ? href : allegroUrl(item.model + ' ' + item.part);
    return a;
  }
  function stat(label, value, lines, linkEl) {
    var d = el('div', 'stat-block');
    d.appendChild(el('div', 'stat-label', label));
    d.appendChild(el('div', 'stat-value', value));
    lines.forEach(function (t) { d.appendChild(el('div', 'stat-sub', t)); });
    if (linkEl) d.appendChild(linkEl);
    return d;
  }
  function sellerLine(o) {
    var bits = [];
    if (o.seller) bits.push(o.seller);
    if (o.condition) bits.push(o.condition);
    return bits.join(' · ');
  }

  function renderTracker() {
    var list = $('trackerList');
    list.textContent = '';
    $('trackerCount').textContent = tracked.length ? '(' + tracked.length + ')' : '';
    $('trackerEmpty').hidden = tracked.length > 0;

    tracked.forEach(function (item) {
      var li = el('li', 'card track-card');
      var h = mergedHistory(item);
      var live = matches(item.model, item.part);

      var top = el('div', 'track-top');
      var name = el('div', 'track-name');
      name.appendChild(el('span', 'track-model', item.model));
      name.appendChild(el('span', 'track-part', item.part));
      top.appendChild(name);
      li.appendChild(top);

      /* current lowest + all-time low */
      var grid = el('div', 'stat-grid');
      if (live.length) {
        var c = live[0];
        grid.appendChild(stat('Current lowest', pln(c._total),
          [sellerLine(c) || 'Seller not named',
           'Item ' + pln(Number(c.price) || 0) + ' + delivery ' + pln(Number(c.delivery) || 0),
           'Lowest of ' + live.length + (live.length === 1 ? ' listing' : ' listings')],
          listingLink(c, item)));
      } else if (h.length) {
        var lastE = h[h.length - 1];
        grid.appendChild(stat('Last seen lowest', pln(lastE.min),
          ['No current offers in data', 'Seen on ' + lastE.d], null));
      } else {
        grid.appendChild(stat('Current lowest', '–',
          ['No offers for this part in data/prices.json yet'], null));
      }

      var atl = allTimeLow(h);
      if (atl) {
        var lines = [atl.d];
        var who = atl.low ? sellerLine(atl.low) : '';
        lines.push(who || 'Listing details not recorded');
        grid.appendChild(stat('All-time low', pln(atl.min), lines, atl.low ? listingLink(atl.low, item) : null));
      } else {
        grid.appendChild(stat('All-time low', '–', ['Recorded once prices are available'], null));
      }
      li.appendChild(grid);

      /* change vs previous check + sparkline */
      if (h.length >= 2) {
        var last = h[h.length - 1], prev = h[h.length - 2];
        var diff = last.min - prev.min;
        var ch;
        if (Math.abs(diff) < 0.005) ch = el('div', 'track-change flat', '= Lowest price unchanged since ' + prev.d);
        else if (diff < 0) ch = el('div', 'track-change down', '▼ Lowest price ' + pln(-diff) + ' lower since ' + prev.d);
        else ch = el('div', 'track-change up', '▲ Lowest price ' + pln(diff) + ' higher since ' + prev.d);
        li.appendChild(ch);
        li.appendChild(sparkline(h));
      }

      /* averages */
      var avgWrap = el('div', 'avg-wrap');
      avgWrap.appendChild(el('div', 'avg-title', 'Average price across all listings'));
      var avgGrid = el('div', 'avg-grid');
      RANGES.forEach(function (r) {
        var w = h.length ? windowAvg(h, r) : null;
        var cellDiv = el('div', 'avg-cell');
        cellDiv.appendChild(el('div', 'stat-label', r.label));
        if (!w) {
          cellDiv.appendChild(el('div', 'avg-value', '–'));
          cellDiv.appendChild(el('div', 'stat-sub', 'No data in range'));
        } else {
          cellDiv.appendChild(el('div', 'avg-value', pln(w.avg)));
          cellDiv.appendChild(el('div', 'stat-sub', w.n + (w.n === 1 ? ' listing' : ' listings') + ' · ' + w.k + (w.k === 1 ? ' check' : ' checks')));
          if (w.partial) cellDiv.appendChild(el('div', 'stat-sub', 'Partial: data since ' + w.since));
        }
        avgGrid.appendChild(cellDiv);
      });
      avgWrap.appendChild(avgGrid);
      li.appendChild(avgWrap);

      li.appendChild(el('div', 'track-meta', 'Tracking since ' + item.added + '. All prices are item + delivery in PLN.'));

      var actions = el('div', 'track-actions');
      var show = el('button', null, 'Show offers');
      show.type = 'button';
      show.setAttribute('aria-label', 'Show offers for ' + item.model + ' ' + item.part);
      show.addEventListener('click', function () {
        $('model').value = item.model;
        $('part').value = item.part;
        renderResults();
        $('queryLabel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      var rm = el('button', 'remove', 'Remove');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + item.model + ' ' + item.part + ' from tracker');
      rm.addEventListener('click', function () { removeTracked(item.id); });
      actions.appendChild(show);
      actions.appendChild(rm);
      li.appendChild(actions);

      list.appendChild(li);
    });

    $('trackerNote').textContent = storageOk
      ? 'Averages use every listing recorded in data/history.json (shared, kept in the repository) plus the checks saved in this browser. Ranges with less data than requested are marked “Partial”.'
      : 'Your browser is blocking storage, so only the shared data/history.json is used and tracked parts are lost when you close this page.';
  }

  /* ---------- results ---------- */
  function renderResults() {
    var model = $('model').value.trim();
    var part = $('part').value.trim();
    var q = (model + ' ' + part).trim();

    $('queryLabel').textContent = q || '[A-model] [part]';
    $('allegroLink').href = allegroUrl(q);

    var list = matches(model, part);
    var tbody = $('rows');
    tbody.textContent = '';

    if (!list.length) {
      var tr = el('tr');
      var td = el('td', 'empty', loadError
        ? 'Could not load data/prices.json. Open the site from GitHub Pages or a local web server, not as a file.'
        : 'No saved prices for this model and part yet. Use “Compare on Allegro” to see live listings.');
      td.colSpan = 6;
      tr.appendChild(td);
      tbody.appendChild(tr);
      $('statMin').textContent = $('statMed').textContent = $('statMax').textContent = '–';
    } else {
      list.forEach(function (o) {
        var tr = el('tr');
        tr.appendChild(cell(o.seller || '–'));
        tr.appendChild(cell(o.condition || '–'));
        tr.appendChild(cell(pln(Number(o.price) || 0), 'num'));
        tr.appendChild(cell(pln(Number(o.delivery) || 0), 'num'));
        tr.appendChild(cell(pln(o._total), 'num total'));
        var td = el('td');
        var a = el('a', null, 'Open on Allegro');
        a.target = '_blank';
        a.rel = 'noopener';
        var href = String(o.url || '');
        a.href = /^https:\/\/(www\.)?allegro\.pl\//.test(href) ? href : allegroUrl(q);
        a.style.fontWeight = '600';
        td.appendChild(a);
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
      var totals = list.map(function (o) { return o._total; });
      $('statMin').textContent = pln(Math.min.apply(null, totals));
      $('statMed').textContent = pln(median(totals));
      $('statMax').textContent = pln(Math.max.apply(null, totals));
    }

    $('updated').textContent = updated ? 'Prices last updated: ' + updated : '';
    $('note').textContent = 'Saved prices come from data/prices.json in this repository. Always confirm the current price on Allegro before buying.';
  }

  /* ---------- init ---------- */
  function init() {
    var chips = $('chips');
    PARTS.forEach(function (name) {
      var b = el('button', null, name);
      b.type = 'button';
      b.addEventListener('click', function () { $('part').value = name.toLowerCase(); renderResults(); });
      chips.appendChild(b);
    });
    $('model').addEventListener('input', renderResults);
    $('part').addEventListener('input', renderResults);
    $('trackBtn').addEventListener('click', addTracked);

    tracked = loadTracked();
    renderTracker();
    renderResults();

    function getJson(url) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
    }
    getJson('data/prices.json')
      .then(function (d) { offers = d.offers || []; updated = d.updated || null; })
      .catch(function () { loadError = true; })
      .then(function () { return getJson('data/history.json'); })
      .then(function (d) { sharedHistory = Array.isArray(d.entries) ? d.entries : []; })
      .catch(function () { sharedHistory = []; })
      .then(function () { recordSnapshots(); renderResults(); renderTracker(); });
  }
  init();
})();
