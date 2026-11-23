const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApp() {
  const elements = new Map();
  const makeElement = () => ({
    style: {}, children: [], hidden: true,
    append(...children) { this.children.push(...children); },
    listeners: {},
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    removeAttribute() {}, classList: { toggle() {} },
  });
  const context = vm.createContext({
    Blob, TextEncoder, Uint8Array, setTimeout,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: {
      createElement: makeElement, createDocumentFragment: makeElement,
      querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        value: ({ '#margin': '0.2', '#spacing': '0', '#renderDpi': '600' })[selector] || '1',
        ...makeElement(), checked: true, textContent: 'Generate PDF',
      });
      return elements.get(selector);
    } },
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
    .replace(/\}\)\(\);\s*$/, `globalThis.app = {
      packLayout, readQuantity, handleGeneratePdf,
      applyProjectSettings, makeProjectData, readSettings,
      resetPdfLink, refreshLayoutPreview, loadProjectFile, clearAllItems, state, els,
      setRenderer(renderer) { renderPartForPdf = renderer; }
    }; })();`);
  vm.runInContext(source, context);
  return context.app;
}

const settings = { page: { width: 8.27, height: 11.69 }, margin: 0.2, spacing: 0.3, allowRotate: true };
function item(id, width, ratio, quantity = 1) {
  return { id: String(id), fileName: `creature-${id}.png`, widthInches: width,
    naturalWidth: 100, naturalHeight: ratio * 100, quantity, scalePercent: 100 };
}

test('packed pieces respect page boundaries and requested spacing', () => {
  const app = loadApp();
  let seed = 42;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  for (let trial = 0; trial < 150; trial++) {
    const items = Array.from({ length: 12 }, (_, id) => item(id, [0.5, 1, 2, 3, 4][Math.floor(random() * 5)], 0.4 + random() * 1.4));
    const trialSettings = {
      ...settings, spacing: [0, 0.01, 0.3, 0.5][trial % 4],
      allowRotate: trial % 2 === 0, margin: [0, 0.2, 1.5][trial % 3],
    };
    const layout = app.packLayout(items, trialSettings);
    assert.equal(layout.ok, true);
    for (const page of layout.pages) {
      page.placements.forEach((a, index) => {
        assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.usableWidth + 1e-6 && a.y + a.height <= layout.usableHeight + 1e-6);
        for (const b of page.placements.slice(index + 1)) {
          const gapX = Math.max(b.x - a.x - a.width, a.x - b.x - b.width);
          const gapY = Math.max(b.y - a.y - a.height, a.y - b.y - b.height);
          assert.ok(Math.max(gapX, gapY) >= trialSettings.spacing - 1e-6, `Insufficient spacing: ${gapX}, ${gapY}`);
        }
      });
    }
  }
});

test('omitted quantity restores one copy; zero stays explicit', () => {
  const app = loadApp();
  assert.equal(app.readQuantity(undefined), 1);
  assert.equal(app.readQuantity(null), 1);
  assert.equal(app.readQuantity(''), 1);
  assert.equal(app.readQuantity(0), 0);
});

test('empty layouts cannot generate a zero-page PDF', () => {
  const app = loadApp();
  assert.equal(app.packLayout([], settings).ok, false);
  assert.equal(app.packLayout([item(1, 1, 100, 0)], settings).ok, false);
});

test('PDF generation rejects stale output and prevents concurrent runs', async () => {
  const app = loadApp();
  app.state.items = [item(1, 1, 1)];
  let release;
  let calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  app.setRenderer(() => { calls++; return pending; });
  const generating = app.handleGeneratePdf();
  const concurrent = app.handleGeneratePdf();
  const concurrentCalls = calls;
  app.resetPdfLink();
  release({ widthPixels: 1, heightPixels: 1, bytes: new Uint8Array([1]) });
  await Promise.all([generating, concurrent]);
  assert.equal(concurrentCalls, 1);
  assert.equal(app.els.downloadLink.hidden, true);
  assert.equal(app.state.pdfUrl, '');
  assert.equal(app.els.generatePdf.textContent, 'Generate PDF');
});


test('successful PDF generation exposes the download', async () => {
  const app = loadApp();
  app.state.items = [item(1, 1, 1)];
  app.setRenderer(async () => ({ widthPixels: 1, heightPixels: 1, bytes: new Uint8Array([1, 2, 3]) }));
  await app.handleGeneratePdf();
  assert.equal(app.els.downloadLink.hidden, false);
  assert.equal(app.els.generatePdf.disabled, false);
  assert.match(app.els.status.textContent, /PDF ready/);
});

test('a failed renderer restores the generation button', async () => {
  const app = loadApp();
  app.state.items = [item(1, 1, 1)];
  app.setRenderer(async () => { throw new Error('canvas export failed'); });
  await app.handleGeneratePdf();
  assert.equal(app.els.downloadLink.hidden, true);
  assert.equal(app.els.generatePdf.disabled, false);
  assert.equal(app.state.generatingPdf, false);
  assert.match(app.els.status.textContent, /canvas export failed/);
});


test('clearing the collection cancels a pending state load', async () => {
  const app = loadApp();
  let release;
  const loading = app.loadProjectFile({
    name: 'old.json', text: () => new Promise(resolve => { release = resolve; }),
  });
  app.clearAllItems();
  release(JSON.stringify({ format: 'standee-alchemy', items: [], settings: { margin: 1 } }));
  await loading;
  assert.equal(app.els.margin.value, '0.2');
  assert.equal(app.els.status.textContent, 'No images loaded.');
});

test('a slower state load cannot overwrite a newer one', async () => {
  const app = loadApp();
  let release;
  const older = app.loadProjectFile({
    name: 'old.json', text: () => new Promise(resolve => { release = resolve; }),
  });
  await app.loadProjectFile({
    name: 'new.json', text: async () => JSON.stringify({ format: 'standee-alchemy', items: [], settings: { margin: 0.5 } }),
  });
  release(JSON.stringify({ format: 'standee-alchemy', items: [], settings: { margin: 1 } }));
  await older;
  assert.equal(app.els.margin.value, '0.5');
  assert.match(app.els.status.textContent, /new.json/);
});

// Verify that a sequence of cuts can separate every piece: each cut must span
// the current fragment and pass through no piece interior. Recursing permits
// cuts that cannot span the original page, including mixed nested subdivisions.
function canSeparateWithStraightCuts(pieces) {
  if (pieces.length <= 1) return true;
  for (const [position, size] of [['x', 'width'], ['y', 'height']]) {
    const edges = new Set(pieces.flatMap(p => [p[position], p[position] + p[size]]));
    for (const cut of edges) {
      const before = pieces.filter(p => p[position] + p[size] <= cut + 1e-6);
      const after = pieces.filter(p => p[position] >= cut - 1e-6);
      if (!before.length || !after.length || before.length + after.length !== pieces.length) continue;
      if (canSeparateWithStraightCuts(before) && canSeparateWithStraightCuts(after)) return true;
    }
  }
  return false;
}

test('paper cutter layouts allow recursive straight cuts, preserve spacing and stay on page', () => {
  const app = loadApp();
  let seed = 117;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  for (let trial = 0; trial < 100; trial++) {
    const items = Array.from({ length: 15 }, (_, id) =>
      item(id, [0.5, 1, 2, 3, 4][Math.floor(random() * 5)], 0.4 + random() * 1.4, 1 + id % 3));
    const trialSettings = { ...settings,
      spacing: [0, 0.01, 0.3, 0.5][trial % 4],
      allowRotate: trial % 2 === 0, margin: [0, 0.2, 1.5][trial % 3] };
    const layout = app.packLayout(items, trialSettings);
    assert.equal(layout.ok, true);
    for (const page of layout.pages) {
      assert.ok(canSeparateWithStraightCuts(page.placements), `Uncuttable page in trial ${trial}`);
      for (const [index, a] of page.placements.entries()) {
        assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.usableWidth + 1e-6 && a.y + a.height <= layout.usableHeight + 1e-6);
        if (!trialSettings.allowRotate) assert.equal(a.rotated, false);
        for (const b of page.placements.slice(index + 1)) {
          const gapX = Math.max(b.x - a.x - a.width, a.x - b.x - b.width);
          const gapY = Math.max(b.y - a.y - a.height, a.y - b.y - b.height);
          assert.ok(Math.max(gapX, gapY) >= trialSettings.spacing - 1e-6);
        }
      }
    }
  }
});

test('saved projects always use straight-cut packing and omit the retired preference', () => {
  const app = loadApp();
  const items = [item(1, 1, 1, 7), item(2, 2, 1.2, 3), item(3, 3, 2)];
  app.applyProjectSettings({});
  const expected = app.packLayout(items, app.readSettings());
  assert.equal(expected.ok, true);
  for (const savedValue of [undefined, false, true]) {
    app.applyProjectSettings({ optimizeForPaperCutters: savedValue });
    assert.equal(Object.hasOwn(app.readSettings(), 'optimizeForPaperCutters'), false);
    assert.equal(Object.hasOwn(app.makeProjectData().settings, 'optimizeForPaperCutters'), false);
    const layout = app.packLayout(items, app.readSettings());
    assert.deepEqual(layout, expected);
    for (const page of layout.pages) {
      assert.ok(canSeparateWithStraightCuts(page.placements));
    }
  }
});
