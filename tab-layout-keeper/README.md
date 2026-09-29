# Tab Layout Keeper

A Chrome extension (Manifest V3) that remembers **where the tabs of a site live on your displays** and puts them back there on demand.

For every origin (e.g. `https://mail.example.com`) you can save a layout made of one or more windows. For each window it stores:

- **Display**: which monitor it belongs to.
- **Position and size**, relative to that display's usable area, plus the state (normal, maximized or fullscreen).
- **Tabs**: the exact URL of every tab, in order, and whether it is pinned.
- **Window color and label**: the tabs are put into a colored, optionally labeled tab group.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `tab-layout-keeper/` folder.
3. Pin the extension to the toolbar.

## Usage

- **Save**: arrange the site's tabs across windows and displays the way you like, open the popup on one of them and click **Save current arrangement**. Every window that has a tab of that origin is captured.
- **Restore**: use the popup's **Restore** button, the page or toolbar-icon context menu, or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> saves. You can change the shortcuts at `chrome://extensions/shortcuts`.
- **Edit**: the options page (**Manage layouts** in the popup) lets you change the display, position, size and state of each window. You can also set its color and label, and add, remove, reorder or pin tabs and change their URLs. You can add windows, or add a site by typing its origin. **Use this window's position** copies the geometry of the window the options page is in, so you can drag that window where you want it and then click the button. Changes save automatically.
- **Auto restore**: when this is on for a layout, it is restored each time Chrome starts.
- **Reuse open tabs** (on by default): open tabs with exactly the same URL are moved into place instead of being opened again.
- **Export / import**: layouts can be backed up or moved between machines as JSON.

The toolbar icon shows a blue dot when the current site has a saved layout.

## How multiple displays are handled

Displays come from `chrome.system.display`. Positions are stored relative to the display's work area, so a layout keeps working if you rearrange your monitors. When restoring, the saved display is looked up by id, then by name, then by its geometry. If none of these match (for example, the monitor is unplugged), the primary display is used. Windows are clamped so they always fit on the target display. Maximized and fullscreen windows are first created on the target display and then maximized there.

## About the window color

Extensions **cannot change the color of a single window's frame or title bar**. The only frame color an extension can set is through a static theme, which applies to every window and cannot be combined with an extension like this one. The closest per-window option is a **tab group color**, which colors the group chip and the tab outlines. The extension groups the window's (unpinned) tabs and gives the group the chosen color and label. Pinned tabs cannot be in a group, so they are left uncolored. Choose "no color" (the crossed-out swatch) to leave tabs ungrouped.

## Development

```
tab-layout-keeper/
├── manifest.json
├── background.js        # service worker: restore/capture, context menus, shortcuts, startup, badge
├── lib/
│   ├── geometry.js      # pure helpers: display matching, relative <-> absolute bounds, origins
│   ├── layout.js        # capture & restore using chrome.windows / tabs / tabGroups
│   ├── storage.js       # chrome.storage.local persistence + data model
│   └── messaging.js
├── popup/               # toolbar popup
└── options/             # layout editor
```

Run the unit tests (Node 20+) with:

```sh
cd tab-layout-keeper && npm test
```
