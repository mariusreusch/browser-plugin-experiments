import { GROUP_COLORS, originOf } from '../lib/geometry.js';
import { layoutSummary, request, setStatus } from '../lib/messaging.js';
import { getLayouts, onLayoutsChanged } from '../lib/storage.js';

const $ = (id) => document.getElementById(id);
const status = $('status');

const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
const origin = originOf(activeTab?.url);

function openOptions(forOrigin) {
  const url = chrome.runtime.getURL('options/options.html') + (forOrigin ? `#${encodeURIComponent(forOrigin)}` : '');
  chrome.tabs.create({ url });
  window.close();
}

async function run(label, message) {
  setStatus(status, `${label}…`);
  try {
    await request(message);
    setStatus(status, `${label} done.`, 'ok');
  } catch (e) {
    setStatus(status, e.message, 'error');
  }
}

function render(layouts) {
  const current = origin ? layouts[origin] : null;
  $('origin').textContent = origin || 'This page has no web origin';
  $('summary').textContent = !origin
    ? 'Open a http(s) page to save its layout.'
    : current
      ? `Saved: ${layoutSummary(current)}`
      : 'No layout saved for this site yet.';
  $('capture').disabled = !origin;
  $('restore').disabled = !current;
  $('edit').disabled = !origin;

  const list = $('list');
  list.replaceChildren();
  const all = Object.values(layouts).sort((a, b) => a.name.localeCompare(b.name));
  $('empty').hidden = all.length > 0;
  for (const layout of all) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = layout.name || layout.origin;
    name.title = `${layout.origin} — ${layoutSummary(layout)}`;

    const swatches = document.createElement('span');
    swatches.className = 'swatches';
    for (const win of layout.windows) {
      const dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = GROUP_COLORS[win.color] || 'transparent';
      swatches.append(dot);
    }

    const restore = document.createElement('button');
    restore.textContent = 'Restore';
    restore.addEventListener('click', () => run('Restore', { type: 'restore', origin: layout.origin }));

    const edit = document.createElement('button');
    edit.className = 'link';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openOptions(layout.origin));

    li.append(name, swatches, restore, edit);
    list.append(li);
  }
}

$('capture').addEventListener('click', () => run('Save', { type: 'capture', origin }));
$('restore').addEventListener('click', () => run('Restore', { type: 'restore', origin }));
$('edit').addEventListener('click', () => openOptions(origin));
$('manage').addEventListener('click', () => openOptions());

render(await getLayouts());
onLayoutsChanged(render);
