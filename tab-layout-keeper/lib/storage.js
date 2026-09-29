// Layouts are stored in chrome.storage.local under a single key, keyed by origin:
//
// {
//   "https://example.com": {
//     origin, name, autoRestoreOnStartup, reuseExistingTabs, updatedAt,
//     windows: [{
//       id,
//       display: { id, name, bounds },            // which display the window lives on
//       bounds: { left, top, width, height },     // relative to the display's work area
//       state: 'normal' | 'maximized' | 'fullscreen',
//       color: 'none' | 'grey' | 'blue' | ...,    // tab group color used as window color
//       title: '',                                // tab group label
//       tabs: [{ url, pinned }]
//     }]
//   }
// }

const KEY = 'layouts';

export async function getLayouts() {
  const data = await chrome.storage.local.get(KEY);
  return data[KEY] || {};
}

export async function getLayout(origin) {
  return (await getLayouts())[origin] || null;
}

export async function saveLayout(layout) {
  const layouts = await getLayouts();
  layouts[layout.origin] = { ...layout, updatedAt: Date.now() };
  await chrome.storage.local.set({ [KEY]: layouts });
  return layouts[layout.origin];
}

export async function deleteLayout(origin) {
  const layouts = await getLayouts();
  delete layouts[origin];
  await chrome.storage.local.set({ [KEY]: layouts });
}

export async function replaceAllLayouts(layouts) {
  await chrome.storage.local.set({ [KEY]: layouts });
}

export function onLayoutsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) callback(changes[KEY].newValue || {});
  });
}

export function newLayout(origin) {
  return {
    origin,
    name: new URL(origin).host,
    autoRestoreOnStartup: false,
    reuseExistingTabs: true,
    windows: [],
  };
}

export function newWindowConfig(display) {
  return {
    id: crypto.randomUUID(),
    display,
    bounds: { left: 0, top: 0, width: 1200, height: 800 },
    state: 'normal',
    color: 'none',
    title: '',
    tabs: [],
  };
}
