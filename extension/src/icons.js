// 16px line icons, 1.5px stroke, drawn in currentColor.
const PATHS = {
  search: '<circle cx="7" cy="7" r="4.25"/><path d="m10.2 10.2 3.3 3.3"/>',
  tab: '<rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2"/><path d="M1.75 6.25h12.5"/>',
  window: '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2"/><path d="M4.5 5.5h.01M6.75 5.5h.01"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05"/>',
  bookmark: '<path d="M4.25 2.25h7.5v11.5L8 10.75l-3.75 3z"/>',
  clock: '<circle cx="8" cy="8" r="5.75"/><path d="M8 4.75V8l2.25 1.5"/>',
  undo: '<path d="M5.25 3.25 2.5 6l2.75 2.75"/><path d="M2.75 6h6.5a3.75 3.75 0 0 1 0 7.5H7"/>',
  bolt: '<path d="M8.75 1.75 3.5 9h4l-.5 5.25L12.5 7h-4z"/>',
  puzzle: '<path d="M6.25 3.25a1.5 1.5 0 0 1 3 0h3v3a1.5 1.5 0 0 1 0 3v3.5h-3.5a1.5 1.5 0 0 0-3 0H2.75v-3.5a1.5 1.5 0 0 0 0-3v-3z"/>',
  trash: '<path d="M2.75 4.25h10.5M6.25 4.25v-1.5h3.5v1.5M4.25 4.25l.5 9h6.5l.5-9"/>',
  shield: '<path d="M8 1.75 2.75 3.75v4c0 3.1 2.2 5.3 5.25 6.5 3.05-1.2 5.25-3.4 5.25-6.5v-4z"/>',
  globe: '<circle cx="8" cy="8" r="5.75"/><path d="M2.25 8h11.5M8 2.25c1.9 1.6 1.9 9.9 0 11.5M8 2.25c-1.9 1.6-1.9 9.9 0 11.5"/>',
  download: '<path d="M8 2.25v8M4.75 7.25 8 10.5l3.25-3.25M2.75 13.25h10.5"/>',
  palette: '<path d="M8 2.25a5.75 5.75 0 1 0 0 11.5c1 0 1.25-.75.9-1.5-.5-1 .1-2 1.35-2h1.5a2 2 0 0 0 2-2c0-3.2-2.55-6-5.75-6z"/><path d="M5.25 7h.01M8 5h.01M10.75 7h.01"/>',
  layers: '<path d="m8 2.25 5.75 3L8 8.25l-5.75-3z"/><path d="m2.25 8.25 5.75 3 5.75-3M2.25 11l5.75 3 5.75-3"/>',
  book: '<path d="M2.75 3.25h3.5A1.75 1.75 0 0 1 8 5v8.25a1.5 1.5 0 0 0-1.5-1.5H2.75zM13.25 3.25h-3.5A1.75 1.75 0 0 0 8 5v8.25a1.5 1.5 0 0 1 1.5-1.5h3.75z"/>',
  check: '<path d="m3.25 8.5 3 3 6.5-7"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  chevron: '<path d="m6 3.5 4.5 4.5L6 12.5"/>',
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  // Static markup from the table above; never page or user data.
  svg.innerHTML = PATHS[name] || PATHS.bolt;
  return svg;
}

export const ICON_NAMES = Object.keys(PATHS);
