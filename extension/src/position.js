// Where the palette sits. Pure, so the service worker, the palette page and
// the Node tests share one definition of "centered" and "inside the screen".

export const WINDOW = { width: 680, height: 520 };
// width and gutter mirror .panel and .scrim in palette.css. edge is the gap
// kept to the viewport; room is the height that must stay visible below the top.
export const PANEL = { width: 640, gutter: 16, edge: 8, room: 220 };

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// ---- The palette's own window: an offset from the browser window ---------

export function windowSpot(parent, saved) {
  if (saved && finite(saved.dx) && finite(saved.dy)) {
    return { left: Math.round(parent.left + saved.dx), top: Math.round(parent.top + saved.dy) };
  }
  return {
    left: Math.round(parent.left + (parent.width - WINDOW.width) / 2),
    top: Math.round(parent.top + Math.max(60, (parent.height - WINDOW.height) * 0.3)),
  };
}

export function windowOffset(parent, bounds) {
  return { dx: bounds.left - parent.left, dy: bounds.top - parent.top };
}

// ---- The overlay panel: fractions of the viewport -------------------------

export function panelWidth(vw) {
  return Math.max(0, Math.min(PANEL.width, vw - PANEL.gutter * 2));
}

export function clampPanel(spot, vw, vh) {
  const maxLeft = Math.max(PANEL.edge, vw - panelWidth(vw) - PANEL.edge);
  const maxTop = Math.max(PANEL.edge, vh - PANEL.room);
  return {
    left: Math.round(clamp(spot.left, PANEL.edge, maxLeft)),
    top: Math.round(clamp(spot.top, PANEL.edge, maxTop)),
  };
}

// x is the panel's center and y its top edge, so it keeps its place when the viewport changes size.
export function panelFractions(spot, vw, vh) {
  return { x: (spot.left + panelWidth(vw) / 2) / vw, y: spot.top / vh };
}

export function panelSpot(saved, vw, vh) {
  if (!saved || !finite(saved.x) || !finite(saved.y)) return null;
  return clampPanel({ left: saved.x * vw - panelWidth(vw) / 2, top: saved.y * vh }, vw, vh);
}
