/** Sends a request to the background service worker and unwraps its response. */
export async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Unknown error');
  return response.result;
}

export function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

export function layoutSummary(layout) {
  const windows = layout.windows.length;
  const tabs = layout.windows.reduce((n, w) => n + w.tabs.length, 0);
  return `${windows} window${windows === 1 ? '' : 's'}, ${tabs} tab${tabs === 1 ? '' : 's'}`;
}
