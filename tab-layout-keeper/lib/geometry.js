// Pure helpers without any chrome.* dependency so they can be unit tested in Node.

export const WINDOW_STATES = ['normal', 'maximized', 'fullscreen'];

// Colors supported by chrome.tabGroups, with approximate swatch colors for the UI.
export const GROUP_COLORS = {
  none: null,
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#188038',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#fa903e',
};

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;

/** Returns the http(s) origin of a URL, or null for anything else. */
export function originOf(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Normalizes user input like "example.com" into "https://example.com". */
export function normalizeOrigin(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  return originOf(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
}

export function isValidTabUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:', 'file:', 'chrome:', 'about:'].includes(u.protocol);
  } catch {
    return false;
  }
}

function contains(rect, x, y) {
  return x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;
}

function distanceSq(rect, x, y) {
  const dx = Math.max(rect.left - x, 0, x - (rect.left + rect.width));
  const dy = Math.max(rect.top - y, 0, y - (rect.top + rect.height));
  return dx * dx + dy * dy;
}

/** Finds the display a window belongs to, based on the window's center point. */
export function findDisplayForBounds(displays, bounds) {
  if (!displays.length) return null;
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  const hit = displays.find((d) => contains(d.bounds, cx, cy));
  if (hit) return hit;
  return displays.reduce((best, d) =>
    distanceSq(d.bounds, cx, cy) < distanceSq(best.bounds, cx, cy) ? d : best,
  );
}

function sameRect(a, b) {
  return !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/**
 * Finds the connected display matching a saved display reference. Display ids are
 * not guaranteed to be stable across reboots / reconnects, so fall back to the
 * name, then the geometry, then the primary display.
 */
export function matchDisplay(displays, saved) {
  if (!displays.length) return null;
  const primary = displays.find((d) => d.isPrimary) || displays[0];
  if (!saved) return primary;
  return (
    displays.find((d) => d.id === saved.id) ||
    (saved.name && displays.filter((d) => d.name === saved.name).length === 1
      ? displays.find((d) => d.name === saved.name)
      : null) ||
    displays.find((d) => sameRect(d.bounds, saved.bounds)) ||
    primary
  );
}

/** Snapshot of a display as stored in a layout. */
export function displayRef(display) {
  if (!display) return null;
  return {
    id: display.id,
    name: display.name || '',
    bounds: { ...display.bounds },
  };
}

/** Absolute screen bounds -> bounds relative to the display's work area. */
export function toRelative(bounds, display) {
  const wa = display ? display.workArea : { left: 0, top: 0 };
  return {
    left: Math.round(bounds.left - wa.left),
    top: Math.round(bounds.top - wa.top),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
}

/** Relative bounds -> absolute screen bounds, clamped so the window fits on the display. */
export function toAbsolute(rel, display) {
  const wa = display
    ? display.workArea
    : { left: 0, top: 0, width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER };
  const width = clamp(Math.round(rel.width) || wa.width, MIN_WIDTH, wa.width);
  const height = clamp(Math.round(rel.height) || wa.height, MIN_HEIGHT, wa.height);
  const left = clamp(Math.round(rel.left) || 0, 0, Math.max(0, wa.width - width));
  const top = clamp(Math.round(rel.top) || 0, 0, Math.max(0, wa.height - height));
  return { left: wa.left + left, top: wa.top + top, width, height };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function describeDisplay(display, index) {
  const name = display.name || `Display ${index + 1}`;
  const { width, height } = display.bounds;
  return `${name} (${width}×${height})${display.isPrimary ? ' · primary' : ''}`;
}
