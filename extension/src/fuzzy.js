// Small fuzzy matcher. Every whitespace-separated token must match; a
// contiguous match beats a scattered one and word starts beat mid-word hits.

const BOUNDARY = /[\s\-_/.:@#?&=+()[\]]/;

function isBoundary(text, index) {
  if (index === 0) return true;
  const prev = text[index - 1];
  if (BOUNDARY.test(prev)) return true;
  const cur = text[index];
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase() && cur === cur.toUpperCase();
}

function substring(token, text) {
  const lower = text.toLowerCase();
  let at = -1;
  let best = -1;
  // Prefer a hit that starts a word.
  while ((at = lower.indexOf(token, at + 1)) !== -1) {
    if (best === -1) best = at;
    if (isBoundary(text, at)) {
      best = at;
      break;
    }
  }
  if (best === -1) return null;
  const positions = [];
  for (let i = 0; i < token.length; i++) positions.push(best + i);
  const score = 100 + token.length * 4 + (isBoundary(text, best) ? 40 : 0) - Math.min(best, 30);
  return { score, positions };
}

// In-order letters, e.g. "bkm" for "Bookmark Manager". The letters must sit
// close together, or every long string would match every short query.
function subsequence(token, text) {
  const lower = text.toLowerCase();
  const positions = [];
  let score = 20;
  let from = 0;
  let last = -2;
  for (const ch of token) {
    const found = lower.indexOf(ch, from);
    if (found === -1) return null;
    if (isBoundary(text, found)) score += 8;
    if (found === last + 1) score += 6;
    else if (last >= 0) score -= Math.min(found - last - 1, 6);
    positions.push(found);
    last = found;
    from = found + 1;
  }
  const span = positions.at(-1) - positions[0] + 1;
  if (span > token.length * 2 + 2) return null;
  return { score, positions };
}

export function matchToken(token, text) {
  return substring(token, text) || subsequence(token, text);
}

export function matchText(tokens, text) {
  if (!text) return null;
  let score = 0;
  const positions = new Set();
  for (const token of tokens) {
    const hit = matchToken(token, text);
    if (!hit) return null;
    score += hit.score;
    for (const p of hit.positions) positions.add(p);
  }
  return { score, positions: [...positions].sort((a, b) => a - b) };
}

export function tokenize(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

// Scores one item. Every token must hit the title, or appear verbatim in the
// subtitle or keywords. Hits outside the title count for less and highlight nothing.
export function scoreItem(tokens, item) {
  let score = 0;
  const positions = new Set();
  for (const token of tokens) {
    const inTitle = matchToken(token, item.title);
    if (inTitle) {
      score += inTitle.score;
      for (const p of inTitle.positions) positions.add(p);
      continue;
    }
    const elsewhere = (item.subtitle && substring(token, item.subtitle)) || (item.keywords && substring(token, item.keywords));
    if (!elsewhere) return null;
    score += elsewhere.score * 0.6;
  }
  return { score, positions: [...positions].sort((a, b) => a - b) };
}

export function rank(query, items, bias = () => 0) {
  const tokens = tokenize(query);
  if (!tokens.length) return items.map((item) => ({ item, score: 0, positions: [] }));
  const out = [];
  for (const item of items) {
    const hit = scoreItem(tokens, item);
    if (hit) out.push({ item, score: hit.score + bias(item), positions: hit.positions });
  }
  return out.sort((a, b) => b.score - a.score);
}
