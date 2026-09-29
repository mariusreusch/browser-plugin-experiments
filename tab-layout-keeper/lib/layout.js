import {
  displayRef,
  findDisplayForBounds,
  isValidTabUrl,
  matchDisplay,
  originOf,
  toAbsolute,
  toRelative,
} from './geometry.js';
import { getLayout, newLayout, saveLayout } from './storage.js';

const tabUrl = (tab) => tab.url || tab.pendingUrl || '';

function normalizeUrl(url) {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/**
 * Captures every normal window that currently shows a tab of `origin`: its display,
 * position, size and state, plus the URLs of that origin's tabs in order.
 * Settings the user configured before (name, flags, colors) are preserved.
 */
export async function captureLayout(origin) {
  const [displays, windows, existing] = await Promise.all([
    chrome.system.display.getInfo(),
    chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }),
    getLayout(origin),
  ]);
  const layout = existing ? { ...existing } : newLayout(origin);
  const previous = existing?.windows || [];

  const captured = [];
  for (const win of windows) {
    if (win.incognito) continue;
    const tabs = win.tabs.filter((t) => originOf(tabUrl(t)) === origin);
    if (!tabs.length) continue;

    const display = findDisplayForBounds(displays, win);
    const groupIds = [...new Set(tabs.map((t) => t.groupId).filter((g) => g !== -1))];
    let group = null;
    if (groupIds.length === 1) group = await chrome.tabGroups.get(groupIds[0]).catch(() => null);

    captured.push({
      display: displayRef(display),
      bounds: toRelative(win, display),
      state: win.state === 'maximized' || win.state === 'fullscreen' ? win.state : 'normal',
      group,
      tabs: tabs.map((t) => ({ url: tabUrl(t), pinned: t.pinned })),
      sortKey: [displays.indexOf(display), win.left, win.top],
    });
  }

  captured.sort((a, b) => {
    for (let i = 0; i < a.sortKey.length; i++) {
      if (a.sortKey[i] !== b.sortKey[i]) return a.sortKey[i] - b.sortKey[i];
    }
    return 0;
  });

  layout.windows = captured.map(({ group, sortKey, ...win }, i) => {
    // Keep the configured color/title unless the tabs are grouped differently now.
    const prev = previous[i] || {};
    return {
      id: prev.id || crypto.randomUUID(),
      ...win,
      color: group ? group.color : prev.color || 'none',
      title: group ? group.title || '' : prev.title || '',
    };
  });

  return saveLayout(layout);
}

/**
 * Opens (or re-arranges) the windows described by a layout.
 * With `reuseExistingTabs`, already open tabs with the exact same URL are moved
 * into place instead of opening duplicates.
 */
export async function restoreLayout(layout) {
  const displays = await chrome.system.display.getInfo();
  const openTabs = layout.reuseExistingTabs
    ? (await chrome.tabs.query({ windowType: 'normal' })).filter((t) => !t.incognito)
    : [];
  const claimed = new Set();
  const created = [];

  for (const win of layout.windows) {
    const tabs = (win.tabs || []).filter((t) => isValidTabUrl(t.url));
    if (!tabs.length) continue;

    const sources = tabs.map((config) => {
      const target = normalizeUrl(config.url);
      const existing = openTabs.find((t) => !claimed.has(t.id) && normalizeUrl(tabUrl(t)) === target);
      if (existing) claimed.add(existing.id);
      return { config, existingId: existing?.id };
    });

    const display = matchDisplay(displays, win.display);
    const bounds = toAbsolute(win.bounds || {}, display);

    const [first, ...rest] = sources;
    const createProps = { ...bounds, focused: true, type: 'normal' };
    if (first.existingId != null) createProps.tabId = first.existingId;
    else createProps.url = first.config.url;
    const window = await chrome.windows.create(createProps);

    const tabIds = [window.tabs[0].id];
    for (const source of rest) {
      if (source.existingId != null) {
        await chrome.tabs.move(source.existingId, { windowId: window.id, index: -1 });
        tabIds.push(source.existingId);
      } else {
        const tab = await chrome.tabs.create({ windowId: window.id, url: source.config.url, active: false });
        tabIds.push(tab.id);
      }
    }

    await applyPinningAndGroup(window.id, tabIds, sources, win);
    await chrome.tabs.update(tabIds[0], { active: true });

    // Windows must be created in the normal state at the target bounds first so that
    // maximize / fullscreen happens on the right display.
    if (win.state === 'maximized' || win.state === 'fullscreen') {
      await chrome.windows.update(window.id, { state: win.state });
    }
    created.push(window.id);
  }
  return created;
}

async function applyPinningAndGroup(windowId, tabIds, sources, win) {
  const unpinned = [];
  for (let i = 0; i < tabIds.length; i++) {
    const pinned = !!sources[i].config.pinned;
    await chrome.tabs.update(tabIds[i], { pinned });
    if (!pinned) unpinned.push(tabIds[i]);
  }
  if (!unpinned.length) return;

  if (win.color && win.color !== 'none') {
    const groupId = await chrome.tabs.group({ tabIds: unpinned, createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { color: win.color, title: win.title || '' });
  } else {
    // Tabs reused from elsewhere may still belong to a group; the layout says "no color".
    const tabs = await Promise.all(unpinned.map((id) => chrome.tabs.get(id)));
    const grouped = tabs.filter((t) => t.groupId !== -1).map((t) => t.id);
    if (grouped.length) await chrome.tabs.ungroup(grouped);
  }
}
