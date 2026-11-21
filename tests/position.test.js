import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOW,
  PANEL,
  panelWidth,
  clampPanel,
  panelFractions,
  panelSpot,
  windowSpot,
  windowOffset,
} from '../extension/src/position.js';

const parent = { left: 100, top: 50, width: 1400, height: 900 };

test('with nothing saved the window is centered in the upper part of its parent', () => {
  const spot = windowSpot(parent);
  assert.equal(spot.left + WINDOW.width / 2, parent.left + parent.width / 2);
  assert.ok(spot.top >= parent.top + 60 && spot.top < parent.top + parent.height / 2);
});

test('a saved window offset is applied relative to the parent window', () => {
  assert.deepEqual(windowSpot(parent, { dx: 30, dy: 400 }), { left: 130, top: 450 });
  const moved = { ...parent, left: 600, top: 10 };
  assert.deepEqual(windowSpot(moved, { dx: 30, dy: 400 }), { left: 630, top: 410 });
});

test('window offsets round-trip', () => {
  const saved = windowOffset(parent, { left: 777, top: 333 });
  assert.deepEqual(windowSpot(parent, saved), { left: 777, top: 333 });
});

test('a damaged saved value falls back to the default', () => {
  for (const bad of [null, {}, { dx: 'a', dy: 1 }, { dx: NaN, dy: 1 }, { dx: 1 }, 'x', { dx: Infinity, dy: 0 }]) {
    assert.deepEqual(windowSpot(parent, bad), windowSpot(parent));
  }
  for (const bad of [null, {}, { x: 'a', y: 0.2 }, { x: NaN, y: 0.2 }, { x: 0.5 }, 7]) {
    assert.equal(panelSpot(bad, 1280, 800), null);
  }
});

test('the panel is narrower on a narrow viewport', () => {
  assert.equal(panelWidth(1280), PANEL.width);
  assert.equal(panelWidth(500), 500 - PANEL.gutter * 2);
});

test('the panel cannot be dragged off the viewport', () => {
  const vw = 1280;
  const vh = 800;
  assert.deepEqual(clampPanel({ left: -500, top: -500 }, vw, vh), { left: PANEL.edge, top: PANEL.edge });
  const far = clampPanel({ left: 5000, top: 5000 }, vw, vh);
  assert.equal(far.left, vw - PANEL.width - PANEL.edge);
  assert.equal(far.top, vh - PANEL.room);
  assert.deepEqual(clampPanel({ left: 200, top: 300 }, vw, vh), { left: 200, top: 300 });
});

test('a panel position survives a round trip through fractions', () => {
  const spot = { left: 123, top: 456 };
  assert.deepEqual(panelSpot(panelFractions(spot, 1280, 800), 1280, 800), spot);
});

test('a saved panel position scales with the viewport and stays inside it', () => {
  const saved = panelFractions({ left: 600, top: 500 }, 1280, 800);
  const small = panelSpot(saved, 700, 400);
  assert.ok(small.left >= PANEL.edge && small.left + panelWidth(700) <= 700 - PANEL.edge);
  assert.ok(small.top >= PANEL.edge && small.top <= 400 - PANEL.room);
});
