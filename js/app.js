'use strict';

const ScreenTest = (() => {
  const VENUE = { w: 3456, h: 1152, physW: 9, physH: 3, unit: 'm', ratio: '3:1' };

  let state = {
    screenW: VENUE.w, screenH: VENUE.h,
    pip: 'none',
    bg: { type: 'none', id: null },
    fg: { type: 'none', id: null },
    bgFit: 'cover', fgFit: 'contain',
    showSafeArea: false, showPipBorder: true
  };

  const blobUrls  = { bg: null, fg: null };
  const blobMeta  = { bg: null, fg: null };
  let library     = [];
  let customPips  = [];
  let brandAssets = [];
  const builder   = { fg: { left: 25, top: 25, w: 50, h: 50 }, drag: null };

  const ADMIN_CODE = 'fohp2026';
  let pipAdminUnlocked = sessionStorage.getItem('pip-admin') === '1';

  function getPipById(id) {
    const builtin = PipPresets.PRESETS.find(p => p.id === id);
    if (builtin) return builtin;
    return customPips.find(p => p.id === id) || PipPresets.PRESETS[0];
  }

  const RES_PRESETS = [
    { label: 'Full Screen — 3456×1152', w: 3456, h: 1152, venue: true },
    { label: 'PIP — 1920×1080',         w: 1920, h: 1080 }
  ];

  const HOLDINGS = [
    { id: 'test-pattern', name: 'Test Pattern',         path: './assets/holding/test-pattern.svg' },
    { id: 'align-3456',   name: 'Alignment 3456×1152', path: './assets/holding/alignment-3456.svg' },
    { id: 'align-1920',   name: 'Alignment 1920×1080', path: './assets/holding/alignment-1920.svg' },
    { id: 'live-now',        name: 'Live Now',             path: './assets/holding/live-now.svg' },
    { id: 'welcome-generic', name: 'Welcome — Timber Yard', path: './assets/holding/WELCOME SCREEN - GENERIC - LED.png' }
  ];

  const $ = id => document.getElementById(id);
  const el = {};

  // ── Init ────────────────────────────────────────────────────────
  async function init() {
    el.screenDisplay   = $('screen-display');
    el.layerBg         = $('layer-bg');
    el.layerFg         = $('layer-fg');
    el.safeOverlay     = $('safe-overlay');
    el.previewWrapper  = $('preview-wrapper');
    el.metaRes         = $('meta-res');
    el.metaScale       = $('meta-scale');
    el.metaPip         = $('meta-pip');
    el.pipGroups       = $('pip-groups');
    el.libraryGrid     = $('library-grid');
    el.bgLayerPreview  = $('bg-layer-preview');
    el.fgLayerPreview  = $('fg-layer-preview');
    el.bgHoldingGrid   = $('bg-holding-grid');
    el.fgHoldingGrid   = $('fg-holding-grid');
    el.bgFitCtrl       = $('bg-fit-ctrl');
    el.fgFitCtrl       = $('fg-fit-ctrl');
    el.safeAreaToggle  = $('safe-area-toggle');
    el.pipBorderToggle = $('pip-border-toggle');
    el.layerFg2        = $('layer-fg2');
    el.fullscreenOverlay = $('fullscreen-overlay');
    el.fsScreen        = $('fs-screen');
    el.resPresets      = $('res-presets');
    el.customW         = $('custom-w');
    el.customH         = $('custom-h');
    el.metaPhys        = $('meta-phys');
    el.metaPhysChip    = $('meta-phys-chip');

    try { await ScreenTestDB.open(); } catch (e) { toast('Media library unavailable in this browser', 'error'); }

    await loadState();
    await loadCustomPips();
    renderResPresets();
    renderPipGrid();
    renderHoldingGrids();
    await refreshLibrary();
    await loadBrandAssets();
    applyStateToUI();
    initBuilderEvents();

    const ro = new ResizeObserver(updatePreviewSize);
    ro.observe(el.previewWrapper);
    updatePreviewSize();
    bindEvents();
  }

  // ── State persistence ────────────────────────────────────────────
  async function loadState() {
    try { const s = await ScreenTestDB.getSetting('appState'); if (s) Object.assign(state, s); } catch (e) {}
  }

  function saveState() {
    ScreenTestDB.saveSetting('appState', { ...state }).catch(() => {});
  }

  function applyStateToUI() {
    el.customW.value = state.screenW;
    el.customH.value = state.screenH;
    document.querySelectorAll('.res-chip').forEach(c =>
      c.classList.toggle('active', +c.dataset.w === state.screenW && +c.dataset.h === state.screenH));
    document.querySelectorAll('.pip-card').forEach(c =>
      c.classList.toggle('active', c.dataset.pip === state.pip));
    setActiveSegment(el.bgFitCtrl, state.bgFit);
    setActiveSegment(el.fgFitCtrl, state.fgFit);
    el.safeAreaToggle.checked = state.showSafeArea;
    el.safeOverlay.classList.toggle('hidden', !state.showSafeArea);
    el.pipBorderToggle.checked = state.showPipBorder;
    applyLayerMedia('bg');
    applyLayerMedia('fg');
    updatePipLayout();
    updateMetaPip();
  }

  // ── Resolution ───────────────────────────────────────────────────
  function renderResPresets() {
    el.resPresets.innerHTML = '';
    RES_PRESETS.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'res-chip' + (p.w === state.screenW && p.h === state.screenH ? ' active' : '');
      btn.textContent = p.label;
      btn.dataset.w = p.w; btn.dataset.h = p.h;
      btn.onclick = () => setResolution(p.w, p.h);
      el.resPresets.appendChild(btn);
    });
  }

  function setResolution(w, h) {
    state.screenW = w; state.screenH = h;
    el.customW.value = w; el.customH.value = h;
    document.querySelectorAll('.res-chip').forEach(c =>
      c.classList.toggle('active', +c.dataset.w === w && +c.dataset.h === h));
    updatePreviewSize();
    saveState();
  }

  function updatePreviewSize() {
    if (!el.previewWrapper) return;
    const maxW = el.previewWrapper.clientWidth - 48;
    const maxH = el.previewWrapper.clientHeight - 48;
    const scale = Math.min(maxW / state.screenW, maxH / state.screenH, 1);
    el.screenDisplay.style.width  = Math.round(state.screenW * scale) + 'px';
    el.screenDisplay.style.height = Math.round(state.screenH * scale) + 'px';
    el.metaRes.textContent   = state.screenW + ' × ' + state.screenH;
    el.metaScale.textContent = Math.round(scale * 100) + '%';
    const isVenue = state.screenW === VENUE.w && state.screenH === VENUE.h;
    el.metaPhys.textContent = isVenue ? `${VENUE.physW}m × ${VENUE.physH}m (${VENUE.ratio})` : '—';
    el.metaPhysChip.style.display = isVenue ? '' : 'none';
  }

  // ── PIP ──────────────────────────────────────────────────────────
  function renderPipGrid() {
    el.pipGroups.innerHTML = '';
    Object.entries(PipPresets.grouped()).forEach(([groupName, pips]) => {
      const wrap = document.createElement('div');
      wrap.className = 'pip-group';
      wrap.innerHTML = `<div class="pip-group-label">${groupName}</div>`;
      const grid = document.createElement('div');
      grid.className = 'pip-grid';
      pips.forEach(pip => {
        const card = document.createElement('div');
        card.className = 'pip-card' + (pip.id === state.pip ? ' active' : '');
        card.dataset.pip = pip.id;
        card.title = pip.name;
        card.innerHTML = `<div class="pip-thumb">${PipPresets.thumbnail(pip)}</div><div class="pip-name">${pip.name}</div>`;
        card.onclick = () => selectPip(pip.id);
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
      el.pipGroups.appendChild(wrap);
    });
    renderCustomPipGroup();
  }

  function selectPip(id) {
    const FADE = 1000;
    const wasVisible = el.layerFg.style.display !== 'none';

    const doApply = () => {
      state.pip = id;
      document.querySelectorAll('.pip-card').forEach(c =>
        c.classList.toggle('active', c.dataset.pip === id));
      updatePipLayout();
      syncFg2();
      updateMetaPip();
      saveState();
    };

    const fadeIn = () => {
      requestAnimationFrame(() => {
        if (el.layerFg.style.display  !== 'none') el.layerFg.style.opacity  = '';
        if (el.layerFg2.style.display !== 'none') el.layerFg2.style.opacity = '';
      });
    };

    if (wasVisible) {
      // Fade out, then reposition instantly, then fade in
      el.layerFg.style.opacity  = '0';
      el.layerFg2.style.opacity = '0';
      setTimeout(() => { doApply(); fadeIn(); }, FADE);
    } else {
      // Not visible — set to transparent, apply new position, then fade in
      el.layerFg.style.opacity  = '0';
      el.layerFg2.style.opacity = '0';
      doApply();
      requestAnimationFrame(() => fadeIn());
    }
  }

  function updatePipLayout() {
    const pip = getPipById(state.pip);
    if (PipPresets.isDual(pip)) {
      // Dual PIP: two slots
      [el.layerFg, el.layerFg2].forEach((div, i) => {
        const slot  = pip.slots[i];
        const style = PipPresets.toStyle(slot);
        div.style.display = '';
        Object.assign(div.style, { top: 'auto', left: 'auto', right: 'auto', bottom: 'auto', width: '', height: '' });
        Object.assign(div.style, style);
        div.classList.toggle('show-border', state.showPipBorder);
      });
    } else {
      // Hide slot 2 always for non-dual presets
      el.layerFg2.style.display = 'none';
      const style = PipPresets.toStyle(pip.fg);
      if (!style) { el.layerFg.style.display = 'none'; return; }
      el.layerFg.style.display = '';
      Object.assign(el.layerFg.style, { top: 'auto', left: 'auto', right: 'auto', bottom: 'auto', width: '', height: '' });
      Object.assign(el.layerFg.style, style);
      el.layerFg.classList.toggle('show-border', state.showPipBorder);
    }
  }

  function updateMetaPip() {
    el.metaPip.textContent = getPipById(state.pip).name;
  }

  // ── Holding images ───────────────────────────────────────────────
  function renderHoldingGrids() {
    ['bg', 'fg'].forEach(layer => {
      const grid = layer === 'bg' ? el.bgHoldingGrid : el.fgHoldingGrid;
      grid.innerHTML = '';
      HOLDINGS.forEach(h => {
        const card = document.createElement('div');
        card.className = 'holding-card' + (state[layer].type === 'holding' && state[layer].id === h.id ? ' active' : '');
        card.title = h.name;
        card.innerHTML = `<img src="${h.path}" alt="${h.name}" loading="lazy"><div class="holding-card-name">${h.name}</div>`;
        card.onclick = () => setLayerSource(layer, 'holding', h.id);
        grid.appendChild(card);
      });
    });
  }

  // ── Layer media ──────────────────────────────────────────────────
  async function setLayerSource(layer, type, id) {
    state[layer] = { type, id };
    // If FG is being set but pip is currently Background Only, switch to Foreground Full so it's visible
    if (layer === 'fg' && type !== 'none' && state.pip === 'none') {
      selectPip('fg-full');
    }
    await applyLayerMedia(layer);
    updateLayerPreview(layer);
    refreshHoldingActive(layer);
    refreshLibraryActive();
    saveState();
  }

  async function applyLayerMedia(layer) {
    const src = state[layer];
    const div = layer === 'bg' ? el.layerBg : el.layerFg;
    const fit = layer === 'bg' ? state.bgFit : state.fgFit;

    if (blobUrls[layer]) { URL.revokeObjectURL(blobUrls[layer]); blobUrls[layer] = null; }
    div.innerHTML = '';

    if (src.type === 'none') {
      div.innerHTML = `<div class="layer-placeholder"><div class="layer-placeholder-icon">${layer === 'bg' ? '🖥' : '📺'}</div><div>No ${layer === 'bg' ? 'Background' : 'Foreground'} Media</div></div>`;
      syncFg2();
      return;
    }
    if (src.type === 'holding') {
      const h = HOLDINGS.find(x => x.id === src.id);
      if (!h) return;
      const img = document.createElement('img');
      img.src = h.path; img.style.objectFit = fit;
      div.appendChild(img);
      syncFg2();
      return;
    }
    if (src.type === 'library') {
      const item = await ScreenTestDB.getMedia(src.id).catch(() => null);
      if (!item) return;
      const url = URL.createObjectURL(item.blob);
      blobUrls[layer] = url;
      blobMeta[layer] = item.meta;
      const isVideo = item.meta.type && item.meta.type.startsWith('video/');
      let media;
      if (isVideo) {
        media = document.createElement('video');
        media.src = url;
        media.autoplay = media.loop = media.muted = media.playsInline = true;
      } else {
        media = document.createElement('img');
        media.src = url;
      }
      media.style.objectFit = fit;
      div.appendChild(media);
      syncFg2();
    }
  }

  // Mirror the foreground content into slot 2 for dual PIP presets
  function syncFg2() {
    const pip = getPipById(state.pip);
    if (!PipPresets.isDual(pip)) { el.layerFg2.innerHTML = ''; return; }
    el.layerFg2.innerHTML = '';
    const m = el.layerFg.querySelector('img, video');
    if (!m) return;
    const clone = m.tagName === 'VIDEO'
      ? Object.assign(document.createElement('video'), { src: m.src, autoplay: true, loop: true, muted: true, playsInline: true })
      : Object.assign(document.createElement('img'), { src: m.src });
    clone.style.objectFit = state.fgFit;
    el.layerFg2.appendChild(clone);
  }

  function updateLayerPreview(layer) {
    const previewDiv = layer === 'bg' ? el.bgLayerPreview : el.fgLayerPreview;
    const inner = previewDiv && previewDiv.querySelector('.layer-preview-inner');
    if (!inner) return;
    inner.innerHTML = '';
    const src = state[layer];
    if (src.type === 'none') { inner.innerHTML = '<div class="layer-empty-hint">No media selected</div>'; return; }
    if (src.type === 'holding') {
      const h = HOLDINGS.find(x => x.id === src.id);
      if (h) { const img = document.createElement('img'); img.src = h.path; inner.appendChild(img); }
      return;
    }
    if (src.type === 'library' && blobUrls[layer]) {
      const meta = blobMeta[layer] || (library.find(x => x.id === src.id) || {}).meta || {};
      const isVideo = meta.type && meta.type.startsWith('video/');
      const m = isVideo ? Object.assign(document.createElement('video'), { src: blobUrls[layer], muted: true, autoplay: true, loop: true, playsInline: true })
                        : Object.assign(document.createElement('img'),   { src: blobUrls[layer] });
      inner.appendChild(m);
    }
  }

  function updateLayerFit(layer) {
    const div = layer === 'bg' ? el.layerBg : el.layerFg;
    const fit = layer === 'bg' ? state.bgFit : state.fgFit;
    const m = div.querySelector('img, video');
    if (m) m.style.objectFit = fit;
    // Keep slot 2 in sync
    if (layer === 'fg') {
      const m2 = el.layerFg2.querySelector('img, video');
      if (m2) m2.style.objectFit = fit;
    }
  }

  function refreshHoldingActive(layer) {
    const grid = layer === 'bg' ? el.bgHoldingGrid : el.fgHoldingGrid;
    const src = state[layer];
    grid.querySelectorAll('.holding-card').forEach((c, i) =>
      c.classList.toggle('active', src.type === 'holding' && src.id === HOLDINGS[i].id));
  }

  // ── Upload ───────────────────────────────────────────────────────
  function handleUpload(layer, file) {
    if (!file) return;
    if (!['image/', 'video/'].some(t => file.type.startsWith(t))) { toast('Only image and video files are supported', 'error'); return; }
    if (file.size > 500 * 1024 * 1024) { toast('File too large (max 500MB)', 'error'); return; }
    const id = 'media_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    ScreenTestDB.saveMedia(id, file, { name: file.name, type: file.type, size: file.size })
      .then(() => { toast('Saved: ' + file.name, 'success'); return setLayerSource(layer, 'library', id); })
      .then(() => refreshLibrary())
      .catch(e => toast('Save failed: ' + e.message, 'error'));
  }

  // ── Library ──────────────────────────────────────────────────────
  async function refreshLibrary() {
    try { library = await ScreenTestDB.listMedia(); } catch (e) { library = []; }
    renderLibrary();
    refreshLibraryActive();
    updateLayerPreview('bg');
    updateLayerPreview('fg');
  }

  function renderLibrary() {
    el.libraryGrid.innerHTML = '';
    if (!library.length) {
      el.libraryGrid.innerHTML = '<div class="library-empty">No media saved yet.<br>Upload images or videos above.</div>';
      return;
    }
    [...library].reverse().forEach(item => {
      const isVideo = item.meta.type && item.meta.type.startsWith('video/');
      const card = document.createElement('div');
      card.className = 'lib-card'; card.dataset.id = item.id;

      card.innerHTML = `
        <div class="lib-card-thumb">
          <span class="lib-card-type-badge">${isVideo ? '▶ VID' : 'IMG'} · ${fmtSize(item.meta.size)}</span>
        </div>
        <div class="lib-card-bar">
          <span class="lib-card-bar-name" title="${item.meta.name || ''}">${item.meta.name || item.id}</span>
          <button class="lib-btn lib-btn-bg" title="Set as Background">BG</button>
          <button class="lib-btn lib-btn-fg" title="Set as Foreground">FG</button>
          <button class="lib-btn lib-btn-del" title="Delete">✕</button>
        </div>`;

      const thumbUrl = URL.createObjectURL(item.blob);
      const thumb = isVideo
        ? Object.assign(document.createElement('video'), { src: thumbUrl, muted: true })
        : Object.assign(document.createElement('img'), { src: thumbUrl });
      thumb.className = 'lib-card-media';
      card.querySelector('.lib-card-thumb').appendChild(thumb);

      card.querySelector('.lib-btn-bg').onclick  = e => { e.stopPropagation(); setLayerSource('bg', 'library', item.id); };
      card.querySelector('.lib-btn-fg').onclick  = e => { e.stopPropagation(); setLayerSource('fg', 'library', item.id); };
      card.querySelector('.lib-btn-del').onclick = e => { e.stopPropagation(); deleteMedia(item.id); };
      el.libraryGrid.appendChild(card);
    });
  }

  function refreshLibraryActive() {
    document.querySelectorAll('.lib-card').forEach(c => {
      c.classList.toggle('active-bg', state.bg.type === 'library' && state.bg.id === c.dataset.id);
      c.classList.toggle('active-fg', state.fg.type === 'library' && state.fg.id === c.dataset.id);
    });
  }

  async function deleteMedia(id) {
    if (state.bg.id === id) { state.bg = { type: 'none', id: null }; await applyLayerMedia('bg'); updateLayerPreview('bg'); }
    if (state.fg.id === id) { state.fg = { type: 'none', id: null }; await applyLayerMedia('fg'); updateLayerPreview('fg'); }
    await ScreenTestDB.deleteMedia(id);
    saveState(); toast('Deleted', 'success'); refreshLibrary();
  }

  // ── Export Template ─────────────────────────────────────────────
  function exportTemplate() {
    const TW = 3456, TH = 1152;
    const PHYS_W = 9, PHYS_H = 3;
    const pip = getPipById(state.pip);
    const canvas = document.createElement('canvas');
    canvas.width = TW; canvas.height = TH;
    const ctx = canvas.getContext('2d');

    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const aspectRatio = (w, h) => {
      const rw = Math.round(w), rh = Math.round(h), g = gcd(rw, rh);
      return `${rw / g}:${rh / g}`;
    };
    const toM = (px, axis) => (px / (axis === 'x' ? TW : TH) * (axis === 'x' ? PHYS_W : PHYS_H)).toFixed(2) + 'm';

    // Background + grid
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, TW, TH);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= TW; x += 144) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TH); ctx.stroke(); }
    for (let y = 0; y <= TH; y += 144) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TW, y); ctx.stroke(); }

    const dashedRect = (x, y, w, h, color, lw = 4) => {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.setLineDash([20, 10]);
      ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
      ctx.restore();
    };

    const HEADER_H = 76, FOOTER_H = 44;

    const drawZone = (x, y, w, h, color, title) => {
      const fromRight  = TW - x - w;
      const fromBottom = TH - y - h;
      const ar = aspectRatio(w, h);
      const pctW = (w / TW * 100).toFixed(1);
      const pctH = (h / TH * 100).toFixed(1);

      // Tinted fill
      ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h); ctx.restore();

      // Border
      dashedRect(x, y, w, h, color);

      // Zone title — always below the header strip, clamped by zone width
      const titleSize = Math.max(22, Math.min(54, h / 9, w / 11));
      const titleY = Math.max(y + 28, HEADER_H + 12);
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `700 ${titleSize}px Barlow, Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(title, x + w / 2, titleY, w - 48);
      ctx.restore();

      // Data rows
      const rows = [
        ['PIXEL SIZE',           `${Math.round(w)} × ${Math.round(h)} px`,      true],
        ['ASPECT RATIO',         ar,                                              false],
        ['% OF SCREEN',          `${pctW}% wide  ×  ${pctH}% tall`,             false],
        ['FROM LEFT / TOP',      `${Math.round(x)} px  /  ${Math.round(y)} px`, false],
        ['FROM RIGHT / BOTTOM',  `${Math.round(fromRight)} px  /  ${Math.round(fromBottom)} px`, false],
      ];

      const pad        = Math.min(40, w * 0.055);
      const innerW     = w - pad * 2;
      // Panel must stay below the title and above the footer
      const panelBottom = Math.min(y + h - 8, TH - FOOTER_H - 8);
      const maxPanelH  = panelBottom - (titleY + titleSize + 20);
      const lineH      = Math.min(50, Math.max(26, (maxPanelH - 24) / rows.length));
      const panelH     = rows.length * lineH + 24;
      const panelY     = panelBottom - panelH;

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(x + 8, panelY, w - 16, panelH);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.setLineDash([]); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(x + 8, panelY); ctx.lineTo(x + w - 8, panelY); ctx.stroke();
      ctx.restore();

      const valSize = Math.max(14, Math.min(34, lineH * 0.64, w / 16));
      const lblSize = Math.max(11, Math.min(24, lineH * 0.46, w / 22));
      rows.forEach(([label, val, highlight], i) => {
        const ry = panelY + 12 + i * lineH + lineH / 2;
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `400 ${lblSize}px Barlow, Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(label, x + pad, ry, innerW * 0.44);
        ctx.fillStyle = highlight ? color : 'rgba(255,255,255,0.88)';
        ctx.font = `${highlight ? '700' : '500'} ${valSize}px Barlow, Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(val, x + w - pad, ry, innerW * 0.54);
        ctx.restore();
      });
    };

    const safeName = (pip.name || 'None').replace(/[^a-zA-Z0-9_-]/g, '-');

    // ── Draw zones first, then chrome on top ─────────────────────────
    if (PipPresets.isDual(pip)) {
      pip.slots.forEach((slot, i) => {
        const px = PipPresets.toPixels(slot, TW, TH);
        drawZone(px.x, px.y, px.w, px.h, '#00d47a', `FOREGROUND — SLOT ${i + 1}`);
      });
    } else if (pip.fg) {
      const px = PipPresets.toPixels(pip.fg, TW, TH);
      drawZone(px.x, px.y, px.w, px.h, '#00d47a', 'FOREGROUND LAYER');
    } else {
      ctx.save();
      ctx.fillStyle = '#4da6ff';
      ctx.font = '700 80px Barlow, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BACKGROUND ONLY', TW / 2, TH / 2 - 60);
      ctx.font = '500 52px Barlow, Arial, sans-serif';
      ctx.fillText(`${TW} × ${TH} px`, TW / 2, TH / 2 + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '400 38px Barlow, Arial, sans-serif';
      ctx.fillText(`${PHYS_W}m × ${PHYS_H}m  ·  ${aspectRatio(TW, TH)} aspect ratio`, TW / 2, TH / 2 + 72);
      ctx.restore();
    }

    // BG border — drawn over zones so it's always crisp
    dashedRect(0, 0, TW, TH, '#4da6ff', 4);

    // Header strip — always on top
    const headerMid = TW / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, TW, HEADER_H);
    ctx.fillStyle = '#4da6ff';
    ctx.font = '600 28px Barlow, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`BACKGROUND  —  ${TW} × ${TH} px  ·  ${aspectRatio(TW, TH)} aspect`, 40, HEADER_H / 2, headerMid - 80);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(pip.name.toUpperCase(), TW - 40, HEADER_H / 2, headerMid - 80);
    ctx.restore();

    // Footer — always on top
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, TH - FOOTER_H, TW, FOOTER_H);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = '400 22px Barlow, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`FOHP AUSTRALIA  ·  SCREENTEST LAYOUT TEMPLATE  ·  ${pip.name.toUpperCase()}  ·  SCREEN: ${TW} × ${TH} px  /  ${PHYS_W}m × ${PHYS_H}m`, TW / 2, TH - FOOTER_H / 2, TW - 80);
    ctx.restore();

    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'FOHP-Template-' + safeName + '.png';
      a.click();
      toast('Template exported!', 'success');
    }, 'image/png');
  }

  // ── Screenshot ───────────────────────────────────────────────────
  async function takeScreenshot() {
    const canvas = document.createElement('canvas');
    canvas.width = state.screenW; canvas.height = state.screenH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgMedia = el.layerBg.querySelector('img, video');
    if (bgMedia) drawFitted(ctx, bgMedia, 0, 0, state.screenW, state.screenH, state.bgFit);

    const pip = getPipById(state.pip);
    if (PipPresets.isDual(pip)) {
      // Draw both slots with the same foreground media source
      const fgMedia = el.layerFg.querySelector('img, video');
      if (fgMedia) {
        pip.slots.forEach(slot => {
          const px = PipPresets.toPixels(slot, state.screenW, state.screenH);
          drawFitted(ctx, fgMedia, px.x, px.y, px.w, px.h, state.fgFit);
        });
      }
    } else if (pip.fg && el.layerFg.style.display !== 'none') {
      const fgMedia = el.layerFg.querySelector('img, video');
      if (fgMedia) {
        const px = PipPresets.toPixels(pip.fg, state.screenW, state.screenH);
        drawFitted(ctx, fgMedia, px.x, px.y, px.w, px.h, state.fgFit);
      }
    }

    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `preview-${state.screenW}x${state.screenH}-${Date.now()}.png`;
      a.click(); toast('Screenshot downloaded!', 'success');
    }, 'image/png');
  }

  function drawFitted(ctx, media, x, y, w, h, fit) {
    const mW = media.videoWidth || media.naturalWidth || w;
    const mH = media.videoHeight || media.naturalHeight || h;
    if (fit === 'fill') { ctx.drawImage(media, x, y, w, h); return; }
    const cAR = w / h, mAR = mW / mH;
    if (fit === 'cover') {
      let sx = 0, sy = 0, sw = mW, sh = mH;
      if (mAR > cAR) { sw = mH * cAR; sx = (mW - sw) / 2; }
      else            { sh = mW / cAR; sy = (mH - sh) / 2; }
      ctx.drawImage(media, sx, sy, sw, sh, x, y, w, h);
    } else {
      let dw, dh;
      if (mAR > cAR) { dw = w; dh = w / mAR; } else { dh = h; dw = h * mAR; }
      ctx.drawImage(media, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
  }

  // ── Fullscreen ───────────────────────────────────────────────────
  function openFullscreen() {
    el.fullscreenOverlay.classList.add('active');
    el.fsScreen.innerHTML = '';
    const bgDiv = document.createElement('div'); bgDiv.className = 'layer layer-bg';
    cloneLayer(el.layerBg, bgDiv, state.bgFit, 100);
    el.fsScreen.appendChild(bgDiv);

    const pip = getPipById(state.pip);
    if (PipPresets.isDual(pip)) {
      pip.slots.forEach((slot, i) => {
        const ps = PipPresets.toStyle(slot);
        const div = document.createElement('div');
        div.className = 'layer layer-fg pip-slot';
        Object.assign(div.style, { top: 'auto', left: 'auto', right: 'auto', bottom: 'auto' }, ps);
        div.classList.toggle('show-border', state.showPipBorder);
        cloneLayer(el.layerFg, div, state.fgFit);
        el.fsScreen.appendChild(div);
      });
    } else {
      const fgDiv = document.createElement('div'); fgDiv.className = 'layer layer-fg';
      const ps = PipPresets.toStyle(pip.fg);
      if (!ps) { fgDiv.style.display = 'none'; }
      else { Object.assign(fgDiv.style, { top: 'auto', left: 'auto', right: 'auto', bottom: 'auto' }, ps); }
      fgDiv.classList.toggle('show-border', state.showPipBorder);
      cloneLayer(el.layerFg, fgDiv, state.fgFit);
      el.fsScreen.appendChild(fgDiv);
    }
  }

  function cloneLayer(src, dest, fit) {
    const m = src.querySelector('img, video');
    if (!m) return;
    const clone = m.tagName === 'VIDEO'
      ? Object.assign(document.createElement('video'), { src: m.src, autoplay: true, loop: true, muted: true, playsInline: true })
      : Object.assign(document.createElement('img'), { src: m.src });
    clone.style.cssText = `width:100%;height:100%;object-fit:${fit}`;
    dest.appendChild(clone);
  }

  function closeFullscreen() {
    el.fullscreenOverlay.classList.remove('active');
    el.fsScreen.innerHTML = '';
  }

  // ── Events ───────────────────────────────────────────────────────
  function bindEvents() {
    document.querySelectorAll('.panel-header').forEach(h =>
      h.addEventListener('click', () => h.closest('.panel').classList.toggle('collapsed')));
    document.querySelectorAll('.sub-section-hd').forEach(h =>
      h.addEventListener('click', () => h.closest('.sub-section').classList.toggle('collapsed')));

    bindDropZone($('bg-drop-zone'), 'bg');
    bindDropZone($('fg-drop-zone'), 'fg');
    bindBrandDropZone($('brand-drop-zone'));

    $('btn-clear-bg').onclick = () => clearLayer('bg');
    $('btn-clear-fg').onclick = () => clearLayer('fg');

    el.bgFitCtrl.querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
      state.bgFit = b.dataset.val; setActiveSegment(el.bgFitCtrl, state.bgFit); updateLayerFit('bg'); saveState();
    });
    el.fgFitCtrl.querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
      state.fgFit = b.dataset.val; setActiveSegment(el.fgFitCtrl, state.fgFit); updateLayerFit('fg'); saveState();
    });

    el.safeAreaToggle.onchange  = () => { state.showSafeArea  = el.safeAreaToggle.checked;  el.safeOverlay.classList.toggle('hidden', !state.showSafeArea); saveState(); };
    el.pipBorderToggle.onchange = () => {
      state.showPipBorder = el.pipBorderToggle.checked;
      el.layerFg.classList.toggle('show-border', state.showPipBorder);
      el.layerFg2.classList.toggle('show-border', state.showPipBorder);
      saveState();
    };

    const applyRes = () => { const w = +el.customW.value, h = +el.customH.value; if (w > 0 && h > 0) setResolution(w, h); };
    el.customW.addEventListener('change', applyRes);
    el.customH.addEventListener('change', applyRes);

    $('btn-export-template').onclick = exportTemplate;
    $('btn-screenshot').onclick = takeScreenshot;
    $('btn-fullscreen').onclick = openFullscreen;
    el.fullscreenOverlay.onclick = closeFullscreen;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFullscreen(); });
  }

  function clearLayer(layer) {
    state[layer] = { type: 'none', id: null };
    applyLayerMedia(layer); updateLayerPreview(layer);
    refreshHoldingActive(layer); refreshLibraryActive(); saveState();
  }

  function bindDropZone(zone, layer) {
    zone.onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*,video/*';
      inp.onchange = () => handleUpload(layer, inp.files[0]);
      inp.click();
    };
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop',      e => { e.preventDefault(); zone.classList.remove('drag-over'); handleUpload(layer, e.dataTransfer.files[0]); });
  }

  function setActiveSegment(ctrl, val) {
    ctrl.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === val));
  }

  function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function fmtSize(b) {
    if (!b) return '';
    return b < 1048576 ? Math.round(b / 1024) + 'KB' : (b / 1048576).toFixed(1) + 'MB';
  }

  // ── Custom PIPs ──────────────────────────────────────────────────
  async function loadCustomPips() {
    let filePips = null;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch('/custom-pips.json', { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) filePips = await res.json();
    } catch (e) { /* file:// or server unavailable — fall through */ }

    const dbPips = await ScreenTestDB.getSetting('customPips', []);

    if (filePips !== null && Array.isArray(filePips)) {
      // Merge: file PIPs first (marked as remote), then any locally-created ones not in the file
      const fileIds = new Set(filePips.map(p => p.id));
      const localOnly = dbPips.filter(p => !fileIds.has(p.id));
      customPips = [
        ...filePips.map(p => ({ ...p, _fromFile: true })),
        ...localOnly
      ];
    } else {
      // Fallback: load from IndexedDB (file:// local use)
      customPips = dbPips;
    }
    // Save combined array as backup
    ScreenTestDB.saveSetting('customPips', customPips).catch(() => {});
  }

  function saveCustomPips() {
    ScreenTestDB.saveSetting('customPips', customPips).catch(() => {});
  }

  function renderCustomPipGroup() {
    const existing = el.pipGroups.querySelector('.pip-group-custom');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'pip-group pip-group-custom';

    // Label + lock toggle
    const labelEl = document.createElement('div');
    labelEl.className = 'pip-group-label';
    labelEl.textContent = 'Custom Presets';
    const lockBtn = document.createElement('button');
    lockBtn.className = 'pip-admin-lock-btn';
    lockBtn.title = pipAdminUnlocked ? 'Lock admin mode' : 'Unlock admin mode';
    lockBtn.textContent = pipAdminUnlocked ? '🔓' : '🔒';
    lockBtn.onclick = () => {
      if (pipAdminUnlocked) {
        pipAdminUnlocked = false;
        sessionStorage.removeItem('pip-admin');
        renderCustomPipGroup();
      } else {
        const code = prompt('Enter admin code:');
        if (code === null) return;
        if (code === ADMIN_CODE) {
          pipAdminUnlocked = true;
          sessionStorage.setItem('pip-admin', '1');
          renderCustomPipGroup();
          toast('Admin mode unlocked', 'success');
        } else {
          toast('Incorrect code', 'error');
        }
      }
    };
    labelEl.appendChild(lockBtn);
    wrap.appendChild(labelEl);

    const grid = document.createElement('div');
    grid.className = 'pip-grid';

    customPips.forEach(pip => {
      const card = document.createElement('div');
      card.className = 'pip-card' + (pip.id === state.pip ? ' active' : '');
      card.dataset.pip = pip.id;
      card.title = pip.name;
      card.innerHTML = `<div class="pip-thumb">${PipPresets.thumbnail(pip)}</div><div class="pip-name">${pip.name}</div>`;
      card.onclick = () => selectPip(pip.id);

      if (pipAdminUnlocked) {
        const edit = document.createElement('button');
        edit.className = 'pip-card-edit';
        edit.title = 'Edit preset';
        edit.textContent = '✎';
        edit.onclick = (e) => { e.stopPropagation(); openPipBuilderForEdit(pip); };
        card.appendChild(edit);

        if (!pip._fromFile) {
          const del = document.createElement('button');
          del.className = 'pip-card-del';
          del.title = 'Delete preset';
          del.textContent = '×';
          del.onclick = (e) => { e.stopPropagation(); deleteCustomPip(pip.id); };
          card.appendChild(del);
        }
      }
      grid.appendChild(card);
    });

    wrap.appendChild(grid);

    if (pipAdminUnlocked) {
      const toolbar = document.createElement('div');
      toolbar.className = 'pip-custom-toolbar';

      const btnAdd = document.createElement('button');
      btnAdd.className = 'btn-primary';
      btnAdd.textContent = '+ New PIP';
      btnAdd.onclick = openPipBuilder;

      const btnExport = document.createElement('button');
      btnExport.className = 'btn-secondary';
      btnExport.textContent = 'Export PIPs';
      btnExport.onclick = () => {
        const data = JSON.stringify(customPips.map(({ _fromFile, ...p }) => p), null, 2);
        const a = document.createElement('a');
        a.href = 'data:application/json,' + encodeURIComponent(data);
        a.download = 'custom-pips.json';
        a.click();
      };

      const btnImport = document.createElement('button');
      btnImport.className = 'btn-secondary';
      btnImport.textContent = 'Import PIPs';
      btnImport.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
          try {
            const text = await input.files[0].text();
            const imported = JSON.parse(text);
            if (!Array.isArray(imported)) throw new Error('Expected array');
            const existingIds = new Set(customPips.map(p => p.id));
            const newPips = imported.filter(p => p.id && !existingIds.has(p.id));
            customPips = [...customPips, ...newPips];
            saveCustomPips();
            renderCustomPipGroup();
            toast(`Imported ${newPips.length} preset(s)`, 'success');
          } catch (e) {
            toast('Import failed: invalid JSON file', 'error');
          }
        };
        input.click();
      };

      toolbar.appendChild(btnAdd);
      toolbar.appendChild(btnExport);
      toolbar.appendChild(btnImport);
      wrap.appendChild(toolbar);
    }

    el.pipGroups.appendChild(wrap);
  }

  function deleteCustomPip(id) {
    if (state.pip === id) selectPip('none');
    customPips = customPips.filter(p => p.id !== id);
    saveCustomPips();
    renderCustomPipGroup();
    toast('Preset deleted', 'success');
  }

  // ── PIP Builder ──────────────────────────────────────────────────
  function openPipBuilder() {
    builder.fg         = { left: 5,  top: 10, w: 40, h: 80 };
    builder.fg2        = { left: 55, top: 10, w: 40, h: 80 };
    builder.isDual     = false;
    builder.activeSlot = 1;
    builder.editId     = null;
    $('pip-dual-toggle').checked = false;
    $('pip-builder-box2').style.display = 'none';
    $('pip-builder-name').value = '';
    $('pip-builder-modal').classList.add('active');
    updateBuilderBox();
  }

  function openPipBuilderForEdit(pip) {
    const dual = PipPresets.isDual(pip);
    builder.fg         = dual ? { ...pip.slots[0] } : { ...pip.fg };
    builder.fg2        = dual ? { ...pip.slots[1] } : { left: 55, top: 10, w: 40, h: 80 };
    builder.isDual     = dual;
    builder.activeSlot = 1;
    builder.editId     = pip.id;
    builder.ratio      = null;
    builder.lockRatio  = false;
    $('pip-dual-toggle').checked  = dual;
    $('pip-builder-box2').style.display = dual ? '' : 'none';
    $('pip-builder-name').value   = pip.name;
    $('pip-res-w').value = '';
    $('pip-res-h').value = '';
    $('pip-ratio-display').style.display = 'none';
    $('pip-lock-ratio').checked = false;
    $('pip-builder-modal').classList.add('active');
    updateBuilderBox();
  }

  function closePipBuilder() {
    $('pip-builder-modal').classList.remove('active');
    builder.drag = null;
  }

  function updateBuilderBox() {
    const b1 = builder.fg;
    const box1 = $('pip-builder-box');
    box1.style.left = b1.left + '%'; box1.style.top    = b1.top  + '%';
    box1.style.width = b1.w  + '%'; box1.style.height  = b1.h   + '%';

    if (builder.isDual) {
      const b2 = builder.fg2;
      const box2 = $('pip-builder-box2');
      box2.style.left = b2.left + '%'; box2.style.top   = b2.top + '%';
      box2.style.width = b2.w  + '%'; box2.style.height = b2.h  + '%';
    }

    const info = builder.activeSlot === 2 ? builder.fg2 : builder.fg;
    const { left, top, w, h } = info;
    $('pbi-w').textContent  = w.toFixed(1)    + '%';
    $('pbi-h').textContent  = h.toFixed(1)    + '%';
    $('pbi-l').textContent  = left.toFixed(1) + '%';
    $('pbi-t').textContent  = top.toFixed(1)  + '%';
    $('pbi-wm').textContent = (w    / 100 * VENUE.physW).toFixed(2) + 'm';
    $('pbi-hm').textContent = (h    / 100 * VENUE.physH).toFixed(2) + 'm';
    $('pbi-lm').textContent = (left / 100 * VENUE.physW).toFixed(2) + 'm';
    $('pbi-tm').textContent = (top  / 100 * VENUE.physH).toFixed(2) + 'm';
  }

  function initBuilderEvents() {
    const screen  = $('pip-builder-screen');
    const box     = $('pip-builder-box');
    const resW    = $('pip-res-w');
    const resH    = $('pip-res-h');
    const lockChk = $('pip-lock-ratio');
    const ratioLbl= $('pip-ratio-display');
    const MIN     = 2;
    const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // Ratio helpers — ratio is stored in pixel space (w÷h of the content)
    // In %-of-screen space: hPct = wPct * (screenW/screenH) / pixelRatio
    const toH = (wPct) => wPct * (VENUE.w / VENUE.h) / builder.ratio;
    const toW = (hPct) => hPct * builder.ratio / (VENUE.w / VENUE.h);

    function applyRatioToBox() {
      if (!builder.ratio) return;
      const screenAspect = VENUE.w / VENUE.h;
      const src = builder.activeSlot === 2 ? builder.fg2 : builder.fg;
      let { left, top, w } = src;
      let newH = w * screenAspect / builder.ratio;
      if (newH > 100 - top) {
        newH = 100 - top;
        w = clamp(newH * builder.ratio / screenAspect, MIN, 100 - left);
        newH = w * screenAspect / builder.ratio;
      }
      const result = { left, top, w, h: Math.max(MIN, newH) };
      if (builder.activeSlot === 2) builder.fg2 = result; else builder.fg = result;
      updateBuilderBox();
    }

    function updateRatioLabel() {
      const rw = parseInt(resW.value), rh = parseInt(resH.value);
      if (rw > 0 && rh > 0) {
        builder.ratio = rw / rh;
        const g = (a, b) => b ? g(b, a % b) : a;
        const d = g(rw, rh);
        ratioLbl.textContent = (rw/d) + ':' + (rh/d);
        ratioLbl.style.display = '';
        applyRatioToBox();
      } else {
        builder.ratio = null;
        ratioLbl.style.display = 'none';
      }
    }

    resW.addEventListener('input', updateRatioLabel);
    resH.addEventListener('input', updateRatioLabel);
    lockChk.addEventListener('change', () => { builder.lockRatio = lockChk.checked; });

    $('pip-dual-toggle').addEventListener('change', e => {
      builder.isDual = e.target.checked;
      $('pip-builder-box2').style.display = builder.isDual ? '' : 'none';
      if (builder.isDual) builder.activeSlot = 1;
      updateBuilderBox();
    });

    function setupBoxDrag(boxEl, slot) {
      boxEl.addEventListener('mousedown', e => {
        if (e.target.dataset.h) return;
        e.preventDefault();
        builder.activeSlot = slot;
        const fg = slot === 2 ? builder.fg2 : builder.fg;
        builder.drag = { slot, mode: 'move', sx: e.clientX, sy: e.clientY, sf: { ...fg } };
      });
      boxEl.querySelectorAll('.pip-handle').forEach(h => {
        h.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation();
          builder.activeSlot = slot;
          const fg = slot === 2 ? builder.fg2 : builder.fg;
          builder.drag = { slot, mode: e.target.dataset.h, sx: e.clientX, sy: e.clientY, sf: { ...fg } };
        });
      });
    }
    setupBoxDrag($('pip-builder-box'),  1);
    setupBoxDrag($('pip-builder-box2'), 2);

    document.addEventListener('mousemove', e => {
      if (!builder.drag) return;
      const rect   = screen.getBoundingClientRect();
      const dx     = (e.clientX - builder.drag.sx) / rect.width  * 100;
      const dy     = (e.clientY - builder.drag.sy) / rect.height * 100;
      const sf     = builder.drag.sf;
      const locked = builder.lockRatio && builder.ratio;
      let { left, top, w, h } = sf;

      const fitW = (nw, maxW, maxH) => {
        nw = clamp(nw, MIN, maxW);
        if (!locked) return { w: nw, h: null };
        let nh = toH(nw);
        if (nh > maxH) { nh = maxH; nw = toW(nh); nw = clamp(nw, MIN, maxW); nh = toH(nw); }
        return { w: nw, h: Math.max(MIN, nh) };
      };
      const fitH = (nh, maxH, maxW) => {
        nh = clamp(nh, MIN, maxH);
        if (!locked) return { h: nh, w: null };
        let nw = toW(nh);
        if (nw > maxW) { nw = maxW; nh = toH(nw); nh = clamp(nh, MIN, maxH); }
        return { h: Math.max(MIN, nh), w: nw };
      };

      switch (builder.drag.mode) {
        case 'move':
          left = clamp(sf.left+dx, 0, 100-sf.w);
          top  = clamp(sf.top+dy,  0, 100-sf.h);
          break;
        case 'se': { const r=fitW(sf.w+dx,100-sf.left,100-sf.top); w=r.w; if(locked)h=r.h; else h=clamp(sf.h+dy,MIN,100-sf.top); break; }
        case 'sw': { const r=fitW(sf.w-dx,sf.left+sf.w,100-sf.top); left=sf.left+sf.w-r.w; w=r.w; if(locked)h=r.h; else h=clamp(sf.h+dy,MIN,100-sf.top); break; }
        case 'ne': { const r=fitW(sf.w+dx,100-sf.left,sf.top+sf.h); w=r.w; if(locked){h=r.h;top=sf.top+sf.h-h;}else{const rh=fitH(sf.h-dy,sf.top+sf.h,100-sf.left);h=rh.h;top=sf.top+sf.h-h;} break; }
        case 'nw': { const r=fitW(sf.w-dx,sf.left+sf.w,sf.top+sf.h); left=sf.left+sf.w-r.w; w=r.w; if(locked){h=r.h;top=sf.top+sf.h-h;}else{const rh=fitH(sf.h-dy,sf.top+sf.h,100-sf.left);h=rh.h;top=sf.top+sf.h-h;} break; }
        case 'e':  { const r=fitW(sf.w+dx,100-sf.left,100-sf.top); w=r.w; if(locked)h=r.h; break; }
        case 'w':  { const r=fitW(sf.w-dx,sf.left+sf.w,100-sf.top); left=sf.left+sf.w-r.w; w=r.w; if(locked)h=r.h; break; }
        case 's':  { const r=fitH(sf.h+dy,100-sf.top,100-sf.left); h=r.h; if(locked)w=r.w; break; }
        case 'n':  { const r=fitH(sf.h-dy,sf.top+sf.h,100-sf.left); h=r.h; top=sf.top+sf.h-h; if(locked)w=r.w; break; }
      }
      const result = { left, top, w, h };
      if (builder.drag.slot === 2) builder.fg2 = result; else builder.fg = result;
      updateBuilderBox();
    });

    document.addEventListener('mouseup', () => { builder.drag = null; });

    // Arrow-key nudge: 0.5% per press, 0.1% with Shift held
    document.addEventListener('keydown', e => {
      const modal = $('pip-builder-modal');
      if (!modal.classList.contains('active')) return;
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      const focused = document.activeElement;
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : 0.5;
      const fg = builder.activeSlot === 2 ? builder.fg2 : builder.fg;
      let { left, top, w, h } = fg;
      if (e.key === 'ArrowLeft')  left = clamp(left - step, 0, 100 - w);
      if (e.key === 'ArrowRight') left = clamp(left + step, 0, 100 - w);
      if (e.key === 'ArrowUp')    top  = clamp(top  - step, 0, 100 - h);
      if (e.key === 'ArrowDown')  top  = clamp(top  + step, 0, 100 - h);
      const result = { left, top, w, h };
      if (builder.activeSlot === 2) builder.fg2 = result; else builder.fg = result;
      updateBuilderBox();
    });

    $('pip-builder-save').onclick = () => {
      const name = $('pip-builder-name').value.trim();
      if (!name) { toast('Please enter a preset name', 'error'); $('pip-builder-name').focus(); return; }
      const round = fg => ({ left: Math.round(fg.left*10)/10, top: Math.round(fg.top*10)/10, w: Math.round(fg.w*10)/10, h: Math.round(fg.h*10)/10 });
      const layout = builder.isDual
        ? { slots: [round(builder.fg), round(builder.fg2)] }
        : { fg: round(builder.fg) };
      if (builder.editId) {
        const idx = customPips.findIndex(p => p.id === builder.editId);
        if (idx !== -1) {
          const old = customPips[idx];
          customPips[idx] = { id: old.id, name, group: old.group || 'Custom', ...layout };
          if (old._fromFile) customPips[idx]._fromFile = true;
        }
      } else {
        customPips.push({ id: 'custom_' + Date.now(), name, group: 'Custom', ...layout });
      }
      saveCustomPips();
      renderCustomPipGroup();
      closePipBuilder();
      toast((builder.editId ? 'Preset updated: ' : 'Preset saved: ') + name, 'success');
    };

    $('pip-builder-cancel').onclick = closePipBuilder;
    $('pip-builder-close').onclick  = closePipBuilder;
    $('pip-builder-modal').addEventListener('click', e => { if (e.target === $('pip-builder-modal')) closePipBuilder(); });
  }

  // ── Brand Assets ─────────────────────────────────────────────────
  async function loadBrandAssets() {
    const all = await ScreenTestDB.listMedia().catch(() => []);
    brandAssets = all.filter(x => x.meta && x.meta.brand);
    renderBrandGrid();
  }

  function renderBrandGrid() {
    const grid = $('brand-grid');
    grid.innerHTML = '';
    if (!brandAssets.length) {
      grid.innerHTML = '<div class="library-empty">No brand assets yet.<br>Upload your logo above.</div>';
      return;
    }
    brandAssets.forEach(item => {
      const url = URL.createObjectURL(item.blob);
      const card = document.createElement('div');
      card.className = 'brand-card';
      card.innerHTML = `
        <img src="${url}" alt="${item.meta.name}">
        <div class="brand-card-overlay">
          <button class="lib-btn lib-btn-bg">Set as BG</button>
          <button class="lib-btn lib-btn-fg">Set as FG</button>
          <button class="lib-btn lib-btn-del">Remove</button>
        </div>
        <div class="brand-card-name">${item.meta.name}</div>`;
      card.querySelector('.lib-btn-bg').onclick  = () => setLayerSource('bg', 'library', item.id);
      card.querySelector('.lib-btn-fg').onclick  = () => setLayerSource('fg', 'library', item.id);
      card.querySelector('.lib-btn-del').onclick = async () => {
        await ScreenTestDB.deleteMedia(item.id);
        loadBrandAssets();
        refreshLibrary();
        toast('Brand asset removed', 'success');
      };
      grid.appendChild(card);
    });
  }

  function bindBrandDropZone(zone) {
    zone.onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => handleBrandUpload(inp.files[0]);
      inp.click();
    };
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop',      e => { e.preventDefault(); zone.classList.remove('drag-over'); handleBrandUpload(e.dataTransfer.files[0]); });
  }

  function handleBrandUpload(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Brand assets must be image files', 'error'); return; }
    const id = 'brand_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    ScreenTestDB.saveMedia(id, file, { name: file.name, type: file.type, size: file.size, brand: true })
      .then(() => { toast('Brand asset saved: ' + file.name, 'success'); loadBrandAssets(); refreshLibrary(); })
      .catch(e => toast('Save failed: ' + e.message, 'error'));
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => ScreenTest.init());
