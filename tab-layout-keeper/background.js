import { originOf } from './lib/geometry.js';
import { captureLayout, restoreLayout } from './lib/layout.js';
import { getLayout, getLayouts, onLayoutsChanged } from './lib/storage.js';

const STARTUP_DELAY_MS = 2000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'capture-layout',
      title: 'Save tab layout for this site',
      contexts: ['page', 'action'],
    });
    chrome.contextMenus.create({
      id: 'restore-layout',
      title: 'Restore tab layout for this site',
      contexts: ['page', 'action'],
    });
  });
  refreshBadges();
});

chrome.runtime.onStartup.addListener(async () => {
  // Give Chrome's own session restore a moment so existing tabs can be reused.
  await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS));
  const layouts = Object.values(await getLayouts()).filter((l) => l.autoRestoreOnStartup);
  for (const layout of layouts) {
    await restoreLayout(layout).catch((e) => console.error('Auto restore failed', layout.origin, e));
  }
  refreshBadges();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const origin = originOf(tab?.url || info.pageUrl);
  if (!origin) return;
  if (info.menuItemId === 'capture-layout') handle({ type: 'capture', origin });
  if (info.menuItemId === 'restore-layout') handle({ type: 'restore', origin });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  const origin = originOf(tab?.url);
  if (!origin) return;
  if (command === 'capture-layout') handle({ type: 'capture', origin });
  if (command === 'restore-layout') handle({ type: 'restore', origin });
});

// Popup / options pages delegate the work here: the popup closes as soon as a new
// window gets focus, which would abort a restore running inside the popup itself.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message).then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: String(error?.message || error) }),
  );
  return true;
});

async function handle(message) {
  switch (message.type) {
    case 'capture':
      return captureLayout(message.origin);
    case 'restore': {
      const layout = message.layout || (await getLayout(message.origin));
      if (!layout) throw new Error(`No saved layout for ${message.origin}`);
      return restoreLayout(layout);
    }
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// Badge: a dot on the toolbar icon when the active site has a saved layout.
async function updateBadge(tab) {
  if (!tab?.id) return;
  const layout = await getLayout(originOf(tab.url));
  await chrome.action.setBadgeText({ tabId: tab.id, text: layout ? '●' : '' }).catch(() => {});
  if (layout) await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#1a73e8' }).catch(() => {});
}

async function refreshBadges() {
  const tabs = await chrome.tabs.query({ active: true });
  await Promise.all(tabs.map(updateBadge));
}

chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId).then(updateBadge, () => {}));
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.url || change.status === 'complete') updateBadge(tab);
});
onLayoutsChanged(refreshBadges);
