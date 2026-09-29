import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findDisplayForBounds,
  isValidTabUrl,
  matchDisplay,
  normalizeOrigin,
  originOf,
  toAbsolute,
  toRelative,
} from '../lib/geometry.js';

const left = {
  id: '1',
  name: 'Built-in',
  isPrimary: true,
  bounds: { left: 0, top: 0, width: 1920, height: 1080 },
  workArea: { left: 0, top: 25, width: 1920, height: 1055 },
};
const right = {
  id: '2',
  name: 'DELL U2720Q',
  isPrimary: false,
  bounds: { left: 1920, top: -200, width: 2560, height: 1440 },
  workArea: { left: 1920, top: -200, width: 2560, height: 1400 },
};
const displays = [left, right];

test('originOf only accepts http(s)', () => {
  assert.equal(originOf('https://mail.example.com/a?b#c'), 'https://mail.example.com');
  assert.equal(originOf('http://localhost:3000/x'), 'http://localhost:3000');
  assert.equal(originOf('chrome://extensions'), null);
  assert.equal(originOf('not a url'), null);
});

test('normalizeOrigin adds https and strips paths', () => {
  assert.equal(normalizeOrigin('example.com/foo'), 'https://example.com');
  assert.equal(normalizeOrigin(' http://example.com:8080 '), 'http://example.com:8080');
  assert.equal(normalizeOrigin(''), null);
});

test('isValidTabUrl', () => {
  assert.ok(isValidTabUrl('https://example.com/x'));
  assert.ok(!isValidTabUrl('example.com'));
  assert.ok(!isValidTabUrl('javascript:alert(1)'));
});

test('findDisplayForBounds uses the window center', () => {
  assert.equal(findDisplayForBounds(displays, { left: 1800, top: 0, width: 800, height: 600 }), right);
  assert.equal(findDisplayForBounds(displays, { left: 100, top: 100, width: 800, height: 600 }), left);
  // Center off-screen: nearest display wins.
  assert.equal(findDisplayForBounds(displays, { left: 5000, top: 0, width: 400, height: 400 }), right);
});

test('matchDisplay falls back from id to name to geometry to primary', () => {
  assert.equal(matchDisplay(displays, { id: '2' }), right);
  assert.equal(matchDisplay(displays, { id: '99', name: 'DELL U2720Q' }), right);
  assert.equal(matchDisplay(displays, { id: '99', name: 'x', bounds: { ...right.bounds } }), right);
  assert.equal(matchDisplay(displays, { id: '99', name: 'Gone' }), left);
  assert.equal(matchDisplay(displays, null), left);
});

test('relative/absolute round trip', () => {
  const abs = { left: 2020, top: -100, width: 1200, height: 900 };
  const rel = toRelative(abs, right);
  assert.deepEqual(rel, { left: 100, top: 100, width: 1200, height: 900 });
  assert.deepEqual(toAbsolute(rel, right), abs);
});

test('toAbsolute clamps windows onto the display', () => {
  assert.deepEqual(toAbsolute({ left: 1500, top: 900, width: 3000, height: 800 }, left), {
    left: 0,
    top: 25 + 255,
    width: 1920,
    height: 800,
  });
  assert.deepEqual(toAbsolute({ left: -50, top: -50, width: 10, height: 10 }, left), {
    left: 0,
    top: 25,
    width: 200,
    height: 150,
  });
});
