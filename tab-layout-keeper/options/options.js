import {
  GROUP_COLORS,
  describeDisplay,
  displayRef,
  findDisplayForBounds,
  isValidTabUrl,
  matchDisplay,
  normalizeOrigin,
  toRelative,
} from '../lib/geometry.js';
import { layoutSummary, request, setStatus } from '../lib/messaging.js';
import {
  deleteLayout,
  getLayouts,
  newLayout,
  newWindowConfig,
  onLayoutsChanged,
  replaceAllLayouts,
  saveLayout,
} from '../lib/storage.js';

const $ = (id) => document.getElementById(id);
const SAVE_DELAY_MS = 400;

let layouts = {};
let displays = [];
let selectedOrigin = null;
let draft = null;
let saveTimer = null;

const clone = (value) => structuredClone(value);
const comparable = (layout) => JSON.stringify({ ...layout, updatedAt: undefined });

// ---------------------------------------------------------------- persistence

function scheduleSave() {
  clearTimeout(saveTimer);
  setStatus($('save-status'), 'Unsaved changes…');
  saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!draft) return;
  const saved = await saveLayout(draft);
  draft.updatedAt = saved.updatedAt;
  setStatus($('save-status'), 'All changes saved', 'ok');
}

onLayoutsChanged((next) => {
  layouts = next;
  renderLayoutList();
  if (!selectedOrigin || saveTimer) return;
  const stored = layouts[selectedOrigin];
  // Reload when the layout changed elsewhere (popup capture, another options tab, import).
  if (stored && comparable(stored) !== comparable(draft)) {
    draft = clone(stored);
    renderEditor();
  }
});

// ---------------------------------------------------------------- sidebar

function renderLayoutList() {
  const list = $('layout-list');
  list.replaceChildren();
  const entries = Object.values(layouts).sort((a, b) => a.name.localeCompare(b.name));
  if (draft && !layouts[draft.origin]) entries.unshift(draft);
  for (const layout of entries) {
    const button = document.createElement('button');
    button.setAttribute('aria-current', String(layout.origin === selectedOrigin));
    const name = document.createElement('span');
    name.textContent = layout.name || layout.origin;
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = `${layout.origin} · ${layoutSummary(layout)}`;
    button.append(name, sub);
    button.addEventListener('click', () => select(layout.origin));
    const li = document.createElement('li');
    li.append(button);
    list.append(li);
  }
}

function renderDisplays() {
  const list = $('display-list');
  list.replaceChildren(
    ...displays.map((d, i) => {
      const li = document.createElement('li');
      const wa = d.workArea;
      li.textContent = `${describeDisplay(d, i)} at ${d.bounds.left},${d.bounds.top}`;
      li.title = `id ${d.id} · usable area ${wa.width}×${wa.height} at ${wa.left},${wa.top}`;
      return li;
    }),
  );
}

async function select(origin) {
  if (saveTimer) await flushSave();
  selectedOrigin = origin;
  draft = origin ? clone(layouts[origin] || newLayout(origin)) : null;
  history.replaceState(null, '', origin ? `#${encodeURIComponent(origin)}` : location.pathname);
  renderLayoutList();
  renderEditor();
}

$('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const origin = normalizeOrigin($('add-origin').value);
  if (!origin) {
    $('add-origin').classList.add('invalid');
    return;
  }
  $('add-origin').classList.remove('invalid');
  $('add-origin').value = '';
  if (!layouts[origin]) {
    const layout = newLayout(origin);
    layout.windows.push(windowWithTab(origin));
    layouts[origin] = await saveLayout(layout);
  }
  select(origin);
});

// ---------------------------------------------------------------- editor

function primaryDisplay() {
  return displays.find((d) => d.isPrimary) || displays[0];
}

function windowWithTab(origin) {
  const display = primaryDisplay();
  const win = newWindowConfig(displayRef(display));
  if (display) {
    win.bounds.width = Math.min(win.bounds.width, display.workArea.width);
    win.bounds.height = Math.min(win.bounds.height, display.workArea.height);
  }
  win.tabs.push({ url: `${origin}/`, pinned: false });
  return win;
}

function renderEditor() {
  $('empty-state').hidden = !!draft;
  $('layout-editor').hidden = !draft;
  if (!draft) return;

  $('layout-name').value = draft.name || '';
  $('layout-origin').textContent = draft.origin;
  $('auto-restore').checked = !!draft.autoRestoreOnStartup;
  $('reuse-tabs').checked = !!draft.reuseExistingTabs;
  $('windows').replaceChildren(...draft.windows.map(renderWindow));
  setStatus($('save-status'), layouts[draft.origin] ? '' : 'Not saved yet — make a change to save');
}

$('layout-name').addEventListener('input', (e) => {
  draft.name = e.target.value;
  scheduleSave();
});
$('auto-restore').addEventListener('change', (e) => {
  draft.autoRestoreOnStartup = e.target.checked;
  scheduleSave();
});
$('reuse-tabs').addEventListener('change', (e) => {
  draft.reuseExistingTabs = e.target.checked;
  scheduleSave();
});

$('add-window').addEventListener('click', () => {
  draft.windows.push(windowWithTab(draft.origin));
  renderEditor();
  scheduleSave();
});

$('recapture').addEventListener('click', async () => {
  await flushSave();
  try {
    draft = clone(await request({ type: 'capture', origin: draft.origin }));
    renderEditor();
    setStatus($('save-status'), `Captured ${layoutSummary(draft)}`, 'ok');
  } catch (e) {
    setStatus($('save-status'), e.message, 'error');
  }
});

$('restore').addEventListener('click', async () => {
  await flushSave();
  try {
    await request({ type: 'restore', layout: draft });
    setStatus($('save-status'), 'Restored', 'ok');
  } catch (e) {
    setStatus($('save-status'), e.message, 'error');
  }
});

$('delete').addEventListener('click', async () => {
  if (!confirm(`Delete the layout for ${draft.origin}?`)) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const origin = draft.origin;
  draft = null;
  await deleteLayout(origin);
  select(null);
});

function move(array, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= array.length) return false;
  [array[index], array[target]] = [array[target], array[index]];
  return true;
}

function renderWindow(win, index) {
  const card = $('window-template').content.firstElementChild.cloneNode(true);
  const field = (name) => card.querySelector(`[data-field="${name}"]`);
  const colorBar = card.querySelector('.color-bar');

  const matched = matchDisplay(displays, win.display);
  const matchedIndex = displays.indexOf(matched);
  card.querySelector('.window-title').textContent =
    `Window ${index + 1}` + (matched ? ` · ${describeDisplay(matched, matchedIndex)}` : '');

  // Display
  const displaySelect = field('display');
  for (const [i, d] of displays.entries()) displaySelect.add(new Option(describeDisplay(d, i), String(d.id)));
  if (win.display && matched && win.display.id !== matched.id) {
    // The saved display is not connected (or got a new id); show what will be used instead.
    const label = `${win.display.name || 'Saved display'} (not connected → ${describeDisplay(matched, matchedIndex)})`;
    displaySelect.add(new Option(label, 'saved'), 0);
    displaySelect.value = 'saved';
  } else if (matched) {
    displaySelect.value = String(matched.id);
  }
  displaySelect.addEventListener('change', () => {
    const display = displays.find((d) => String(d.id) === displaySelect.value);
    if (!display) return;
    win.display = displayRef(display);
    renderEditor();
    scheduleSave();
  });

  // State & bounds
  field('state').value = win.state || 'normal';
  field('state').addEventListener('change', (e) => {
    win.state = e.target.value;
    scheduleSave();
  });
  for (const key of ['left', 'top', 'width', 'height']) {
    const input = field(key);
    input.value = win.bounds?.[key] ?? '';
    input.addEventListener('input', () => {
      win.bounds = { ...win.bounds, [key]: Number(input.value) || 0 };
      scheduleSave();
    });
  }

  // Color
  const colorOptions = card.querySelector('.color-options');
  const paintColor = () => {
    colorBar.style.background = GROUP_COLORS[win.color] || 'transparent';
    for (const b of colorOptions.children) b.setAttribute('aria-checked', String(b.dataset.color === (win.color || 'none')));
  };
  for (const [name, hex] of Object.entries(GROUP_COLORS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.color = name;
    button.setAttribute('role', 'radio');
    button.title = name === 'none' ? 'No color (tabs are not grouped)' : name;
    button.setAttribute('aria-label', button.title);
    if (hex) button.style.background = hex;
    else button.className = 'none';
    button.addEventListener('click', () => {
      win.color = name;
      paintColor();
      scheduleSave();
    });
    colorOptions.append(button);
  }
  paintColor();
  field('title').value = win.title || '';
  field('title').addEventListener('input', (e) => {
    win.title = e.target.value;
    scheduleSave();
  });

  // Tabs
  const tabList = card.querySelector('.tab-list');
  tabList.replaceChildren(...win.tabs.map((tab, i) => renderTab(win, tab, i)));

  card.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]');
    if (!action || action.closest('.tab-row')) return;
    switch (action.dataset.action) {
      case 'add-tab':
        win.tabs.push({ url: `${draft.origin}/`, pinned: false });
        break;
      case 'remove':
        if (win.tabs.length && !confirm(`Remove window ${index + 1} and its ${win.tabs.length} tab(s)?`)) return;
        draft.windows.splice(index, 1);
        break;
      case 'up':
      case 'down':
        if (!move(draft.windows, index, action.dataset.action === 'up' ? -1 : 1)) return;
        break;
      case 'use-current': {
        const current = await chrome.windows.getCurrent();
        const display = findDisplayForBounds(displays, current);
        win.display = displayRef(display);
        win.bounds = toRelative(current, display);
        win.state = ['maximized', 'fullscreen'].includes(current.state) ? current.state : 'normal';
        break;
      }
      default:
        return;
    }
    renderEditor();
    scheduleSave();
  });

  return card;
}

function renderTab(win, tab, index) {
  const row = $('tab-template').content.firstElementChild.cloneNode(true);
  const url = row.querySelector('[data-field="url"]');
  const pinned = row.querySelector('[data-field="pinned"]');

  url.value = tab.url || '';
  const validate = () => url.classList.toggle('invalid', !isValidTabUrl(url.value));
  validate();
  url.addEventListener('input', () => {
    tab.url = url.value.trim();
    validate();
    scheduleSave();
  });

  pinned.checked = !!tab.pinned;
  pinned.addEventListener('change', () => {
    tab.pinned = pinned.checked;
    scheduleSave();
  });

  row.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'remove') win.tabs.splice(index, 1);
    else if (!move(win.tabs, index, action === 'up' ? -1 : 1)) return;
    renderEditor();
    scheduleSave();
  });
  return row;
}

// ---------------------------------------------------------------- import / export

$('export').addEventListener('click', async () => {
  await flushSave();
  const blob = new Blob([JSON.stringify(await getLayouts(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tab-layouts.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('import').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    const valid = Object.fromEntries(
      Object.values(imported)
        .filter((l) => l && normalizeOrigin(l.origin) === l.origin && Array.isArray(l.windows))
        .map((l) => [l.origin, l]),
    );
    const count = Object.keys(valid).length;
    if (!count) throw new Error('No valid layouts found in file');
    if (!confirm(`Import ${count} layout(s)? Layouts for the same sites will be replaced.`)) return;
    await flushSave();
    await replaceAllLayouts({ ...(await getLayouts()), ...valid });
  } catch (e) {
    alert(`Import failed: ${e.message}`);
  }
});

// ---------------------------------------------------------------- init

async function refreshDisplays() {
  displays = await chrome.system.display.getInfo();
  renderDisplays();
  if (draft && !saveTimer) renderEditor();
}

chrome.system.display.onDisplayChanged.addListener(refreshDisplays);

layouts = await getLayouts();
await refreshDisplays();
renderLayoutList();
const initial = decodeURIComponent(location.hash.slice(1));
select(normalizeOrigin(initial) || Object.keys(layouts)[0] || null);
