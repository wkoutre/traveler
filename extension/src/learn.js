// Learned ranking: which result was picked for which typed text. Pure; the
// palette page owns the saved copy (`learned` in chrome.storage.local).
//
// The model, in the order it is applied:
//   weight     every pick adds 1 to that (typed text, result) pair. A weight
//              halves every HALF_LIFE and never exceeds CAP.
//   rivals     a pick halves the other results learned for the same text, so
//              a changed habit wins after two picks however old the previous one.
//   sharing    a pair counts in part for text that is a prefix of the learned
//              text or continues it, by the share of characters in common.
//   promotion  a result whose weight for the typed text reaches PROMOTE goes
//              above every result that has not. One pick is below it; two are above.
//   boost      below that, weight only adds to the text score, and the best
//              text match keeps first place, so a single pick cannot take it.
//   prior      overall use of a result, whatever was typed, adds a small bonus.

const DAY = 24 * 60 * 60 * 1000;
export const HALF_LIFE = 30 * DAY;
export const PROMOTE = 1.2;
export const CAP = 6;
export const RIVAL = 0.5;
export const BOOST = 45;
export const PRIOR = 10;
export const FLOOR = 0.05;
export const MAX_ENTRIES = 500;
export const MAX_QUERY = 64;

const URL_KINDS = new Set(['tab', 'closed', 'bookmark', 'reading', 'history']);

export function emptyStore() {
  return { v: 1, q: {} };
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// The saved value crosses a storage boundary, so nothing in it is assumed.
export function cleanStore(saved) {
  const store = emptyStore();
  if (!isObject(saved) || saved.v !== 1 || !isObject(saved.q)) return store;
  for (const [query, entries] of Object.entries(saved.q)) {
    if (!isObject(entries)) continue;
    const kept = {};
    for (const [key, entry] of Object.entries(entries)) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [weight, time] = entry;
      if (!Number.isFinite(weight) || !Number.isFinite(time) || weight <= 0) continue;
      kept[key] = [Math.min(weight, CAP), time];
    }
    if (Object.keys(kept).length) store.q[query] = kept;
  }
  return store;
}

export function normalize(query) {
  return String(query).toLowerCase().split(/\s+/).filter(Boolean).join(' ').slice(0, MAX_QUERY);
}

// What a pick is remembered as. A page is its address, so the open tab, the
// bookmark and the history entry for one address share what was learned.
// Rows with no lasting identity (web search, confirm steps) return null.
export function keyOf(item) {
  if (URL_KINDS.has(item.kind)) return item.keywords ? `url:${item.keywords}` : null;
  if (item.kind === 'page') return item.id;
  if (item.kind === 'action' && !item.id.startsWith('confirm:')) return item.id;
  return null;
}

function decayed([weight, time], now) {
  return weight * 2 ** -(Math.max(0, now - time) / HALF_LIFE);
}

// Returns a new store with the pick added; the given store is not changed.
// A pick that cannot be learned returns the same store.
export function record(store, query, key, now) {
  const typed = normalize(query);
  if (!typed || !key) return store;
  const q = {};
  for (const [text, entries] of Object.entries(store.q)) {
    const kept = {};
    for (const [k, entry] of Object.entries(entries)) {
      let weight = decayed(entry, now);
      if (text === typed && k !== key) weight *= RIVAL;
      if (weight >= FLOOR) kept[k] = [weight, now];
    }
    if (Object.keys(kept).length) q[text] = kept;
  }
  q[typed] ??= {};
  q[typed][key] = [Math.min(CAP, (q[typed][key]?.[0] || 0) + 1), now];
  return { v: 1, q: trim(q, typed, key) };
}

function trim(q, typed, key) {
  const all = [];
  for (const [text, entries] of Object.entries(q)) {
    for (const [k, [weight]] of Object.entries(entries)) {
      if (text !== typed || k !== key) all.push({ text, k, weight });
    }
  }
  // The pick just made is never the one dropped.
  const excess = all.length + 1 - MAX_ENTRIES;
  if (excess <= 0) return q;
  all.sort((a, b) => a.weight - b.weight);
  for (const { text, k } of all.slice(0, excess)) {
    delete q[text][k];
    if (!Object.keys(q[text]).length) delete q[text];
  }
  return q;
}

function shared(typed, learned) {
  if (typed === learned) return 1;
  if (learned.startsWith(typed)) return typed.length / learned.length;
  if (typed.startsWith(learned)) return learned.length / typed.length;
  return 0;
}

// direct: weight for this typed text, per key. overall: weight for any text.
export function evidence(store, query, now) {
  const typed = normalize(query);
  const direct = new Map();
  const overall = new Map();
  for (const [text, entries] of Object.entries(store.q)) {
    const share = typed ? shared(typed, text) : 0;
    for (const [key, entry] of Object.entries(entries)) {
      const weight = decayed(entry, now);
      overall.set(key, (overall.get(key) || 0) + weight);
      if (share) direct.set(key, (direct.get(key) || 0) + share * weight);
    }
  }
  return { direct, overall };
}

// Reorders rows that `rank` scored. Returns new rows; the input is untouched.
export function arrange(rows, store, query, now) {
  if (!rows.length || !Object.keys(store.q).length) return rows.slice();
  const { direct, overall } = evidence(store, query, now);
  let anchor = 0;
  const scored = rows.map((row, index) => {
    if (row.score > rows[anchor].score) anchor = index;
    const key = keyOf(row.item);
    const weight = (key && direct.get(key)) || 0;
    const use = (key && overall.get(key)) || 0;
    return {
      row,
      index,
      weight,
      promoted: weight >= PROMOTE,
      boosted: row.score + (BOOST * Math.min(weight, PROMOTE)) / PROMOTE + (PRIOR * Math.min(use, CAP)) / CAP,
    };
  });
  // The best text match stays ahead of everything that is not promoted.
  const lead = scored[anchor];
  scored.sort((a, b) => {
    if (a.promoted !== b.promoted) return a.promoted ? -1 : 1;
    if (a.promoted && a.weight !== b.weight) return b.weight - a.weight;
    if (!a.promoted && (a === lead || b === lead)) return a === lead ? -1 : 1;
    return b.boosted - a.boosted || a.index - b.index;
  });
  return scored.map(({ row }) => ({ ...row }));
}
