(() => {
  "use strict";

  const A4_PAGE = { key: "a4", label: "A4", width: 8.27, height: 11.69 };

  const WIDTH_OPTIONS = [
    { value: 0.5, label: "1/2 inch" },
    { value: 1, label: "1 inch" },
    { value: 2, label: "2 inches" },
    { value: 3, label: "3 inches" },
    { value: 4, label: "4 inches" },
  ];

  const EPS = 1e-6;

  const state = {
    items: [],
    nextId: 1,
    pdfUrl: "",
  };

  const els = {
    imageInput: document.querySelector("#imageInput"),
    chooseFiles: document.querySelector("#chooseFiles"),
    generatePdf: document.querySelector("#generatePdf"),
    itemCount: document.querySelector("#itemCount"),
    defaultWidth: document.querySelector("#defaultWidth"),
    margin: document.querySelector("#margin"),
    spacing: document.querySelector("#spacing"),
    renderDpi: document.querySelector("#renderDpi"),
    allowRotate: document.querySelector("#allowRotate"),
    drawGuides: document.querySelector("#drawGuides"),
    applyWidth: document.querySelector("#applyWidth"),
    clearAll: document.querySelector("#clearAll"),
    dropZone: document.querySelector("#dropZone"),
    itemList: document.querySelector("#itemList"),
    status: document.querySelector("#status"),
    layoutSummary: document.querySelector("#layoutSummary"),
    pagePreview: document.querySelector("#pagePreview"),
    downloadLink: document.querySelector("#downloadLink"),
  };

  els.chooseFiles.addEventListener("click", () => els.imageInput.click());
  els.imageInput.addEventListener("change", handleFilesChosen);
  els.dropZone.addEventListener("click", () => els.imageInput.click());
  els.dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    els.imageInput.click();
  });
  els.dropZone.addEventListener("dragenter", handleDragEnter);
  els.dropZone.addEventListener("dragover", handleDragOver);
  els.dropZone.addEventListener("dragleave", handleDragLeave);
  els.dropZone.addEventListener("drop", handleDrop);
  els.generatePdf.addEventListener("click", handleGeneratePdf);
  els.applyWidth.addEventListener("click", applyDefaultWidthToAll);
  els.clearAll.addEventListener("click", clearAllItems);

  els.itemList.addEventListener("change", (event) => {
    const select = event.target.closest("[data-width-select]");
    if (select) {
      const item = findItem(select.dataset.itemId);
      if (!item) return;
      item.widthInches = Number(select.value);
      resetPdfLink();
      render();
      return;
    }

    const quantityInput = event.target.closest("[data-quantity-input]");
    if (!quantityInput) return;
    const item = findItem(quantityInput.dataset.itemId);
    if (!item) return;
    const quantity = readQuantity(quantityInput.value);
    if (quantity === 0) {
      removeItem(item.id);
      return;
    }
    item.quantity = quantity;
    resetPdfLink();
    render();
  });

  els.itemList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-item]");
    if (!button) return;
    removeItem(button.dataset.removeItem);
  });

  [els.margin, els.spacing, els.allowRotate, els.drawGuides].forEach((control) => {
    control.addEventListener("change", () => {
      resetPdfLink();
      render();
    });
  });

  els.renderDpi.addEventListener("change", () => {
    resetPdfLink();
    refreshLayoutPreview();
  });

  render();

  async function handleFilesChosen(event) {
    await addFiles(event.target.files || []);
    event.target.value = "";
  }

  async function handleDrop(event) {
    event.preventDefault();
    setDropActive(false);
    await addFiles(event.dataTransfer ? event.dataTransfer.files : []);
  }

  function handleDragEnter(event) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    setDropActive(true);
  }

  function handleDragOver(event) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  }

  function handleDragLeave(event) {
    if (els.dropZone.contains(event.relatedTarget)) return;
    setDropActive(false);
  }

  function hasFileDrag(event) {
    return Array.from(event.dataTransfer ? event.dataTransfer.types : []).includes("Files");
  }

  function setDropActive(active) {
    els.dropZone.classList.toggle("is-dragging", active);
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const files = incoming.filter((file) => file.type.startsWith("image/"));
    if (incoming.length > 0 && files.length === 0) {
      setStatus(`Skipped ${incoming.length} file(s). Add image files only.`, "error");
      return;
    }
    if (files.length === 0) return;

    resetPdfLink();
    setStatus(`Loading ${files.length} ${files.length === 1 ? "image" : "images"}...`);

    const failures = [];
    for (const file of files) {
      try {
        const item = await loadImageFile(file);
        state.items.push(item);
      } catch (error) {
        failures.push(`${file.name}: ${error.message}`);
      }
    }

    render();
    const skipped = incoming.length - files.length + failures.length;
    if (skipped > 0) {
      const decodeFailures = failures.length > 0 ? ` ${failures.join(" ")}` : "";
      setStatus(`Skipped ${skipped} file(s).${decodeFailures}`, "error");
    }
  }

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = "async";

      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) {
          URL.revokeObjectURL(url);
          reject(new Error("the image has no readable dimensions"));
          return;
        }

        resolve({
          id: String(state.nextId++),
          file,
          fileName: file.name,
          url,
          image,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          widthInches: Number(els.defaultWidth.value),
          quantity: 1,
        });
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("the browser could not decode it"));
      };

      image.src = url;
    });
  }

  function clearAllItems() {
    for (const item of state.items) {
      URL.revokeObjectURL(item.url);
    }
    state.items = [];
    resetPdfLink();
    render();
  }

  function removeItem(itemId) {
    const index = state.items.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    URL.revokeObjectURL(state.items[index].url);
    state.items.splice(index, 1);
    resetPdfLink();
    render();
  }

  function applyDefaultWidthToAll() {
    if (state.items.length === 0) return;
    const width = Number(els.defaultWidth.value);
    for (const item of state.items) {
      item.widthInches = width;
    }
    resetPdfLink();
    render();
  }

  function findItem(itemId) {
    return state.items.find((item) => item.id === itemId);
  }

  function getQuantity(item) {
    return readQuantity(item.quantity);
  }

  function readQuantity(value) {
    const quantity = Math.floor(Number(value));
    if (!Number.isFinite(quantity) || quantity < 0) return 1;
    return Math.min(quantity, 999);
  }

  function getTotalQuantity() {
    return state.items.reduce((total, item) => total + getQuantity(item), 0);
  }

  function render() {
    els.itemCount.textContent = `${state.items.length} ${state.items.length === 1 ? "image" : "images"}`;
    els.clearAll.disabled = state.items.length === 0;
    renderItemList();
    refreshLayoutPreview();
  }

  function renderItemList() {
    els.itemList.textContent = "";

    if (state.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Add images to begin.";
      els.itemList.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of state.items) {
      const metrics = getMetrics(item);
      const card = document.createElement("article");
      card.className = "item-card";

      const preview = document.createElement("div");
      preview.className = "item-preview";
      const canvas = document.createElement("canvas");
      preview.append(canvas);
      renderPreviewCanvas(item, canvas, els.drawGuides.checked);

      const details = document.createElement("div");
      details.className = "item-details";

      const titleRow = document.createElement("div");
      titleRow.className = "item-title-row";

      const name = document.createElement("div");
      name.className = "item-name";
      name.title = item.fileName;
      name.textContent = item.fileName;

      const remove = document.createElement("button");
      remove.className = "remove-button";
      remove.type = "button";
      remove.dataset.removeItem = item.id;
      remove.setAttribute("aria-label", `Remove ${item.fileName}`);
      remove.textContent = "x";

      titleRow.append(name, remove);

      const meta = document.createElement("div");
      meta.className = "meta";
      appendLine(meta, `${item.naturalWidth} x ${item.naturalHeight} px source`);
      appendLine(meta, `${formatInches(metrics.imageHeight)} image height`);

      const widthRow = document.createElement("div");
      widthRow.className = "width-row";

      const widthLabel = document.createElement("label");
      const widthText = document.createElement("span");
      widthText.textContent = "Output width";
      const widthSelect = document.createElement("select");
      widthSelect.dataset.widthSelect = "true";
      widthSelect.dataset.itemId = item.id;
      for (const option of WIDTH_OPTIONS) {
        const optionEl = document.createElement("option");
        optionEl.value = String(option.value);
        optionEl.textContent = option.label;
        widthSelect.append(optionEl);
      }
      widthSelect.value = String(item.widthInches);
      widthLabel.append(widthText, widthSelect);

      const size = document.createElement("div");
      size.className = "size-pill";
      size.textContent = `${formatInches(metrics.width)} x ${formatInches(metrics.totalHeight)} final`;

      const quantityLabel = document.createElement("label");
      const quantityText = document.createElement("span");
      quantityText.textContent = "Quantity";
      const quantityInput = document.createElement("input");
      quantityInput.type = "number";
      quantityInput.min = "0";
      quantityInput.max = "999";
      quantityInput.step = "1";
      quantityInput.value = String(getQuantity(item));
      quantityInput.dataset.quantityInput = "true";
      quantityInput.dataset.itemId = item.id;
      quantityLabel.append(quantityText, quantityInput);

      widthRow.append(widthLabel, quantityLabel, size);
      details.append(titleRow, meta, widthRow);
      card.append(preview, details);
      fragment.append(card);
    }

    els.itemList.append(fragment);
  }

  function appendLine(parent, text) {
    const line = document.createElement("span");
    line.textContent = text;
    parent.append(line);
  }

  function refreshLayoutPreview() {
    const settings = readSettings();
    const layout = packLayout(state.items, settings);

    els.pagePreview.textContent = "";
    els.layoutSummary.textContent = "";
    els.generatePdf.disabled = true;

    if (state.items.length === 0) {
      setStatus("No images loaded.");
      return;
    }

    if (!layout.ok) {
      setStatus(layout.message, "error");
      renderImpossibleList(layout);
      return;
    }

    els.generatePdf.disabled = false;
    const pieceCount = getTotalQuantity();
    const pieceWord = pieceCount === 1 ? "piece" : "pieces";
    const pageWord = layout.pages.length === 1 ? "page" : "pages";
    setStatus(`${pieceCount} ${pieceWord} packed on ${layout.pages.length} ${pageWord}.`);
    els.layoutSummary.textContent =
      `Printable area: ${formatInches(layout.usableWidth)} x ${formatInches(layout.usableHeight)}. ` +
      `Render: ${settings.renderDpi} DPI.`;

    renderPagePreview(layout, settings);
  }

  function renderImpossibleList(layout) {
    const details = document.createElement("div");
    details.className = "empty-state";

    if (layout.impossible.length === 0) {
      details.textContent = layout.message;
      els.pagePreview.append(details);
      return;
    }

    const text = layout.impossible
      .slice(0, 5)
      .map((box) => `${box.item.fileName} (${formatInches(box.width)} x ${formatInches(box.height)})`)
      .join("; ");
    const extra = layout.impossible.length > 5 ? `; ${layout.impossible.length - 5} more` : "";
    details.textContent = `${text}${extra}`;
    els.pagePreview.append(details);
  }

  function renderPagePreview(layout, settings) {
    const page = settings.page;
    const fragment = document.createDocumentFragment();

    layout.pages.forEach((pageLayout, pageIndex) => {
      const sheet = document.createElement("div");
      sheet.className = "page-sheet";
      sheet.style.aspectRatio = `${page.width} / ${page.height}`;
      sheet.title = `Page ${pageIndex + 1}`;

      const printable = document.createElement("div");
      printable.className = "printable-area";
      printable.style.left = `${(settings.margin / page.width) * 100}%`;
      printable.style.top = `${(settings.margin / page.height) * 100}%`;
      printable.style.width = `${(layout.usableWidth / page.width) * 100}%`;
      printable.style.height = `${(layout.usableHeight / page.height) * 100}%`;
      sheet.append(printable);

      for (const placement of pageLayout.placements) {
        const itemIndex = state.items.indexOf(placement.item) + 1;
        const box = document.createElement("div");
        box.className = "layout-box";
        box.style.left = `${((settings.margin + placement.x) / page.width) * 100}%`;
        box.style.top = `${((settings.margin + placement.y) / page.height) * 100}%`;
        box.style.width = `${(placement.width / page.width) * 100}%`;
        box.style.height = `${(placement.height / page.height) * 100}%`;
        const label = document.createElement("span");
        const copyLabel =
          getQuantity(placement.item) > 1 ? `${itemIndex}.${placement.copyNumber}` : String(itemIndex);
        label.textContent = placement.rotated ? `${copyLabel} R` : copyLabel;
        box.append(label);
        sheet.append(box);
      }

      fragment.append(sheet);
    });

    els.pagePreview.append(fragment);
  }

  async function handleGeneratePdf() {
    resetPdfLink();
    const settings = readSettings();
    const layout = packLayout(state.items, settings);

    if (!layout.ok) {
      refreshLayoutPreview();
      return;
    }

    const previousLabel = els.generatePdf.textContent;
    els.generatePdf.disabled = true;
    els.generatePdf.textContent = "Generating...";

    try {
      const rendered = new Map();
      const uniqueItems = collectUniqueItems(layout);

      for (let index = 0; index < uniqueItems.length; index += 1) {
        const item = uniqueItems[index];
        setStatus(`Rendering ${index + 1} of ${uniqueItems.length}: ${item.fileName}`);
        rendered.set(item.id, await renderItemForPdf(item, settings.renderDpi, settings.drawGuides));
      }

      setStatus("Writing PDF...");
      const pdfBlob = createPdfBlob(layout, rendered, settings);
      state.pdfUrl = URL.createObjectURL(pdfBlob);
      els.downloadLink.href = state.pdfUrl;
      els.downloadLink.download = makePdfFileName(settings);
      els.downloadLink.hidden = false;
      setStatus(`PDF ready: ${formatBytes(pdfBlob.size)}.`);
    } catch (error) {
      setStatus(`Could not create PDF: ${error.message}`, "error");
    } finally {
      els.generatePdf.textContent = previousLabel;
      els.generatePdf.disabled = !packLayout(state.items, readSettings()).ok;
    }
  }

  function collectUniqueItems(layout) {
    const seen = new Set();
    const items = [];
    for (const page of layout.pages) {
      for (const placement of page.placements) {
        if (seen.has(placement.item.id)) continue;
        seen.add(placement.item.id);
        items.push(placement.item);
      }
    }
    return items;
  }

  function readSettings() {
    return {
      page: A4_PAGE,
      margin: clamp(readNumber(els.margin, 0.25), 0, 1.5),
      spacing: clamp(readNumber(els.spacing, 0.05), 0, 0.5),
      renderDpi: clamp(Math.round(readNumber(els.renderDpi, 225)), 72, 600),
      allowRotate: els.allowRotate.checked,
      drawGuides: els.drawGuides.checked,
    };
  }

  function readNumber(input, fallback) {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function getMetrics(item) {
    const width = item.widthInches;
    const imageHeight = width * (item.naturalHeight / item.naturalWidth);
    const innerFlap = width / 2;
    const outerFlap = Math.min(0.5, width / 4);
    const totalHeight = outerFlap + innerFlap + imageHeight + imageHeight + innerFlap + outerFlap;

    return {
      width,
      imageHeight,
      innerFlap,
      outerFlap,
      totalHeight,
      copyY: outerFlap + innerFlap,
      originalY: outerFlap + innerFlap + imageHeight,
      bottomInnerY: outerFlap + innerFlap + imageHeight + imageHeight,
      bottomOuterY: outerFlap + innerFlap + imageHeight + imageHeight + innerFlap,
    };
  }

  function renderPreviewCanvas(item, canvas, guides) {
    const metrics = getMetrics(item);
    const maxCssWidth = 106;
    const maxCssHeight = 260;
    const cssPixelsPerInch = Math.max(
      8,
      Math.min(maxCssWidth / metrics.width, maxCssHeight / metrics.totalHeight)
    );
    const ratio = window.devicePixelRatio || 1;
    const renderPixelsPerInch = cssPixelsPerInch * ratio;

    renderStandeeCanvas(item, canvas, renderPixelsPerInch, guides);
    canvas.style.width = `${Math.max(1, Math.round(metrics.width * cssPixelsPerInch))}px`;
    canvas.style.height = `${Math.max(1, Math.round(metrics.totalHeight * cssPixelsPerInch))}px`;
  }

  function renderStandeeCanvas(item, canvas, pixelsPerInch, guides) {
    const metrics = getMetrics(item);
    const pixelWidth = Math.max(1, Math.ceil(metrics.width * pixelsPerInch));
    const pixelHeight = Math.max(1, Math.ceil(metrics.totalHeight * pixelsPerInch));

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.setTransform(pixelsPerInch, 0, 0, pixelsPerInch, 0, 0);
    drawStandee(ctx, item, metrics, guides, pixelsPerInch);
  }

  function drawStandee(ctx, item, metrics, guides, pixelsPerInch) {
    const width = metrics.width;
    const imageHeight = metrics.imageHeight;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, metrics.totalHeight);

    ctx.save();
    ctx.translate(width, metrics.copyY + imageHeight);
    ctx.rotate(Math.PI);
    ctx.drawImage(item.image, 0, 0, width, imageHeight);
    ctx.restore();

    ctx.drawImage(item.image, 0, metrics.originalY, width, imageHeight);

    if (guides) {
      drawGuides(ctx, metrics, pixelsPerInch);
    }

    ctx.restore();
  }

  function drawGuides(ctx, metrics, pixelsPerInch) {
    const lineWidth = Math.max(1 / pixelsPerInch, 0.0035);
    const inset = lineWidth / 2;

    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = "#171f1d";
    ctx.setLineDash([]);
    ctx.strokeRect(inset, inset, metrics.width - lineWidth, metrics.totalHeight - lineWidth);

    ctx.strokeStyle = "#6f7a76";
    ctx.setLineDash([0.075, 0.045]);
    [
      metrics.outerFlap,
      metrics.outerFlap + metrics.innerFlap,
      metrics.originalY,
      metrics.bottomInnerY,
      metrics.bottomOuterY,
    ].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(metrics.width, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  async function renderItemForPdf(item, dpi, guides) {
    const canvas = document.createElement("canvas");
    renderStandeeCanvas(item, canvas, dpi, guides);

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const rendered = {
      widthPixels: canvas.width,
      heightPixels: canvas.height,
      bytes,
    };

    canvas.width = 1;
    canvas.height = 1;
    return rendered;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("canvas export failed"));
          }
        },
        type,
        quality
      );
    });
  }

  function packLayout(items, settings) {
    const usableWidth = settings.page.width - settings.margin * 2;
    const usableHeight = settings.page.height - settings.margin * 2;

    if (usableWidth <= EPS || usableHeight <= EPS) {
      return {
        ok: false,
        message: "Margins leave no printable area.",
        impossible: [],
        pages: [],
        usableWidth: Math.max(0, usableWidth),
        usableHeight: Math.max(0, usableHeight),
      };
    }

    const boxes = [];
    items.forEach((item, index) => {
      const metrics = getMetrics(item);
      const quantity = getQuantity(item);
      for (let copyIndex = 0; copyIndex < quantity; copyIndex += 1) {
        boxes.push({
          item,
          index,
          copyNumber: copyIndex + 1,
          width: metrics.width,
          height: metrics.totalHeight,
          area: metrics.width * metrics.totalHeight,
        });
      }
    });

    const impossible = boxes.filter((box) => {
      const normal = box.width <= usableWidth + EPS && box.height <= usableHeight + EPS;
      const rotated =
        settings.allowRotate && box.height <= usableWidth + EPS && box.width <= usableHeight + EPS;
      return !normal && !rotated;
    });

    if (impossible.length > 0) {
      const rotateHint = settings.allowRotate ? "" : " Enable rotation or";
      return {
        ok: false,
        message:
          `${impossible.length} piece(s) do not fit inside the ${formatInches(usableWidth)} x ` +
          `${formatInches(usableHeight)} printable area.${rotateHint} reduce width or margin.`,
        impossible,
        pages: [],
        usableWidth,
        usableHeight,
      };
    }

    boxes.sort((a, b) => b.area - a.area || b.height - a.height || a.index - b.index);

    const pages = [];
    for (const box of boxes) {
      let best = null;

      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const candidate = findBestPlacement(pages[pageIndex], box, settings.allowRotate);
        if (!candidate) continue;
        candidate.pageIndex = pageIndex;
        if (!best || compareScores(candidate.score, best.score) < 0) {
          best = candidate;
        }
      }

      if (!best) {
        const page = {
          free: [{ x: 0, y: 0, width: usableWidth, height: usableHeight }],
          placements: [],
        };
        pages.push(page);
        best = findBestPlacement(page, box, settings.allowRotate);
        best.pageIndex = pages.length - 1;
      }

      placeBox(pages[best.pageIndex], box, best, settings.spacing, usableWidth, usableHeight);
    }

    return {
      ok: true,
      pages,
      usableWidth,
      usableHeight,
      page: settings.page,
    };
  }

  function findBestPlacement(page, box, allowRotate) {
    let best = null;

    for (let freeIndex = 0; freeIndex < page.free.length; freeIndex += 1) {
      const free = page.free[freeIndex];
      const orientations = [{ rotated: false, width: box.width, height: box.height }];
      if (allowRotate && Math.abs(box.width - box.height) > EPS) {
        orientations.push({ rotated: true, width: box.height, height: box.width });
      }

      for (const orientation of orientations) {
        if (orientation.width > free.width + EPS || orientation.height > free.height + EPS) {
          continue;
        }

        const leftoverWidth = free.width - orientation.width;
        const leftoverHeight = free.height - orientation.height;
        const score = [
          Math.min(leftoverWidth, leftoverHeight),
          Math.max(leftoverWidth, leftoverHeight),
          free.width * free.height - orientation.width * orientation.height,
          free.y,
          free.x,
        ];

        if (!best || compareScores(score, best.score) < 0) {
          best = {
            freeIndex,
            x: free.x,
            y: free.y,
            width: orientation.width,
            height: orientation.height,
            rotated: orientation.rotated,
            score,
          };
        }
      }
    }

    return best;
  }

  function compareScores(a, b) {
    for (let index = 0; index < a.length; index += 1) {
      if (Math.abs(a[index] - b[index]) <= EPS) continue;
      return a[index] < b[index] ? -1 : 1;
    }
    return 0;
  }

  function placeBox(page, box, placement, spacing, usableWidth, usableHeight) {
    const occupied = {
      x: placement.x,
      y: placement.y,
      width: Math.min(placement.width + spacing, usableWidth - placement.x),
      height: Math.min(placement.height + spacing, usableHeight - placement.y),
    };

    const nextFree = [];
    for (const rect of page.free) {
      splitFreeRect(rect, occupied, nextFree);
    }

    page.free = pruneFreeRects(nextFree);
    page.placements.push({
      item: box.item,
      copyNumber: box.copyNumber,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotated: placement.rotated,
    });
  }

  function splitFreeRect(free, used, output) {
    if (!rectsOverlap(free, used)) {
      output.push(free);
      return;
    }

    const freeRight = free.x + free.width;
    const freeBottom = free.y + free.height;
    const usedRight = used.x + used.width;
    const usedBottom = used.y + used.height;

    if (used.x > free.x + EPS) {
      output.push({
        x: free.x,
        y: free.y,
        width: used.x - free.x,
        height: free.height,
      });
    }

    if (usedRight < freeRight - EPS) {
      output.push({
        x: usedRight,
        y: free.y,
        width: freeRight - usedRight,
        height: free.height,
      });
    }

    if (used.y > free.y + EPS) {
      output.push({
        x: free.x,
        y: free.y,
        width: free.width,
        height: used.y - free.y,
      });
    }

    if (usedBottom < freeBottom - EPS) {
      output.push({
        x: free.x,
        y: usedBottom,
        width: free.width,
        height: freeBottom - usedBottom,
      });
    }
  }

  function pruneFreeRects(rects) {
    const clean = rects.filter((rect) => rect.width > EPS && rect.height > EPS);
    const result = [];

    for (let index = 0; index < clean.length; index += 1) {
      const rect = clean[index];
      let contained = false;

      for (let otherIndex = 0; otherIndex < clean.length; otherIndex += 1) {
        if (index === otherIndex) continue;
        if (containsRect(clean[otherIndex], rect)) {
          contained = true;
          break;
        }
      }

      if (!contained) result.push(rect);
    }

    return result;
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width - EPS &&
      a.x + a.width > b.x + EPS &&
      a.y < b.y + b.height - EPS &&
      a.y + a.height > b.y + EPS
    );
  }

  function containsRect(outer, inner) {
    return (
      inner.x >= outer.x - EPS &&
      inner.y >= outer.y - EPS &&
      inner.x + inner.width <= outer.x + outer.width + EPS &&
      inner.y + inner.height <= outer.y + outer.height + EPS
    );
  }

  function createPdfBlob(layout, rendered, settings) {
    const writer = new PdfWriter();
    const catalogId = writer.reserveObject();
    const pagesId = writer.reserveObject();
    const usedItems = collectUniqueItems(layout);
    const imageObjectIds = new Map();

    for (const item of usedItems) {
      imageObjectIds.set(item.id, writer.reserveObject());
    }

    const pageRecords = layout.pages.map(() => ({
      pageId: writer.reserveObject(),
      contentId: writer.reserveObject(),
    }));

    writer.writeHeader();

    for (const item of usedItems) {
      const image = rendered.get(item.id);
      const imageId = imageObjectIds.get(item.id);
      writer.writeObject(imageId, [
        `<< /Type /XObject /Subtype /Image /Width ${image.widthPixels} /Height ${image.heightPixels} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Interpolate true ` +
          `/Length ${image.bytes.length} >>\nstream\n`,
        image.bytes,
        "\nendstream",
      ]);
    }

    layout.pages.forEach((pageLayout, pageIndex) => {
      const pageRecord = pageRecords[pageIndex];
      const aliases = new Map();
      const xObjects = [];

      pageLayout.placements.forEach((placement, index) => {
        const alias = `Im${index}`;
        aliases.set(placement, alias);
        xObjects.push(`/${alias} ${imageObjectIds.get(placement.item.id)} 0 R`);
      });

      const content = pageLayout.placements
        .map((placement) => makeImageCommand(placement, aliases.get(placement), settings))
        .join("");
      const contentBytes = PdfWriter.encode(content);

      writer.writeObject(pageRecord.contentId, [
        `<< /Length ${contentBytes.length} >>\nstream\n`,
        contentBytes,
        "\nendstream",
      ]);

      writer.writeObject(
        pageRecord.pageId,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${fmt(
          settings.page.width * 72
        )} ${fmt(settings.page.height * 72)}] ` +
          `/Resources << /ProcSet [/PDF /ImageC] /XObject << ${xObjects.join(" ")} >> >> ` +
          `/Contents ${pageRecord.contentId} 0 R >>`
      );
    });

    writer.writeObject(
      pagesId,
      `<< /Type /Pages /Count ${pageRecords.length} /Kids [${pageRecords
        .map((record) => `${record.pageId} 0 R`)
        .join(" ")}] >>`
    );

    writer.writeObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    return writer.finish(catalogId);
  }

  function makeImageCommand(placement, alias, settings) {
    const pageHeightPoints = settings.page.height * 72;
    const metrics = getMetrics(placement.item);
    const originalWidthPoints = metrics.width * 72;
    const originalHeightPoints = metrics.totalHeight * 72;
    const x = (settings.margin + placement.x) * 72;
    const topY = settings.margin + placement.y;
    const y = pageHeightPoints - (topY + placement.height) * 72;

    if (placement.rotated) {
      return (
        "q\n" +
        `${fmt(0)} ${fmt(-originalWidthPoints)} ${fmt(originalHeightPoints)} ${fmt(0)} ` +
        `${fmt(x)} ${fmt(y + originalWidthPoints)} cm\n` +
        `/${alias} Do\nQ\n`
      );
    }

    return (
      "q\n" +
      `${fmt(originalWidthPoints)} 0 0 ${fmt(originalHeightPoints)} ${fmt(x)} ${fmt(y)} cm\n` +
      `/${alias} Do\nQ\n`
    );
  }

  class PdfWriter {
    constructor() {
      this.encoder = new TextEncoder();
      this.chunks = [];
      this.offset = 0;
      this.nextObjectId = 1;
      this.offsets = [0];
    }

    static encode(text) {
      return new TextEncoder().encode(text);
    }

    reserveObject() {
      const id = this.nextObjectId;
      this.nextObjectId += 1;
      return id;
    }

    writeHeader() {
      this.appendBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]));
      this.appendBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    }

    writeObject(id, parts) {
      this.offsets[id] = this.offset;
      this.appendText(`${id} 0 obj\n`);
      const normalizedParts = Array.isArray(parts) ? parts : [parts];
      for (const part of normalizedParts) {
        if (typeof part === "string") {
          this.appendText(part);
        } else {
          this.appendBytes(part);
        }
      }
      this.appendText("\nendobj\n");
    }

    appendText(text) {
      this.appendBytes(this.encoder.encode(text));
    }

    appendBytes(bytes) {
      this.chunks.push(bytes);
      this.offset += bytes.length;
    }

    finish(rootObjectId) {
      const xrefOffset = this.offset;
      const maxObjectId = this.nextObjectId - 1;
      let xref = `xref\n0 ${maxObjectId + 1}\n0000000000 65535 f \n`;

      for (let id = 1; id <= maxObjectId; id += 1) {
        const offset = this.offsets[id];
        if (!Number.isFinite(offset)) {
          throw new Error(`PDF object ${id} was reserved but not written`);
        }
        xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
      }

      xref +=
        `trailer\n<< /Size ${maxObjectId + 1} /Root ${rootObjectId} 0 R >>\n` +
        `startxref\n${xrefOffset}\n%%EOF\n`;
      this.appendText(xref);
      return new Blob(this.chunks, { type: "application/pdf" });
    }
  }

  function resetPdfLink() {
    if (state.pdfUrl) {
      URL.revokeObjectURL(state.pdfUrl);
      state.pdfUrl = "";
    }
    els.downloadLink.hidden = true;
    els.downloadLink.removeAttribute("href");
  }

  function setStatus(message, type = "") {
    els.status.textContent = message;
    els.status.classList.toggle("error", type === "error");
  }

  function makePdfFileName(settings) {
    const date = new Date().toISOString().slice(0, 10);
    return `standees-${settings.page.key}-${date}.pdf`;
  }

  function formatInches(value) {
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - 0.5) < EPS) return "1/2 in";
    if (Math.abs(rounded - 1) < EPS) return "1 in";
    return `${formatNumber(rounded)} in`;
  }

  function formatNumber(value) {
    return Number(value.toFixed(2)).toString();
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fmt(value) {
    if (Math.abs(value) < 0.00001) return "0";
    return Number(value.toFixed(4)).toString();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
