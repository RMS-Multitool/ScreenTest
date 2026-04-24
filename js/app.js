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

  const blobUrls          = { bg: null, fg: null };
  const blobMeta          = { bg: null, fg: null };
  const webcamStreams      = { bg: null, fg: null };
  const screenShareStreams = { bg: null, fg: null };
  let library     = [];
  let customPips  = [];
  let brandAssets = [];
  const builder   = { fg: { left: 25, top: 25, w: 50, h: 50 }, drag: null };

  const ADMIN_CODE = 'fohp2026';
  let pipAdminUnlocked = sessionStorage.getItem('pip-admin') === '1';

  let venueModalOpen      = false;
  let venueDragHandle     = null;
  let venuePhotoBlobUrl   = null;
  let venueAdminUnlocked  = false;
  let venueDefaultConfig  = null;
  let venueCorners = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 }
  ];

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

    // Load venue default config committed to the repo (silent fail if absent)
    try {
      const r = await fetch('./assets/venue/config.json', { cache: 'no-cache' });
      if (r.ok) venueDefaultConfig = await r.json();
    } catch (e) {}

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
    initVenueEvents();
    initTour();
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
      if (venueModalOpen) refreshVenueScreen();
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
      // Webcam card
      const wcCard = document.createElement('div');
      wcCard.className = 'holding-card holding-card-webcam' + (state[layer].type === 'webcam' ? ' active' : '');
      wcCard.title = 'Live Webcam';
      wcCard.innerHTML = `<div class="webcam-card-icon">📷</div><div class="holding-card-name">Live Webcam</div>`;
      wcCard.onclick = () => setLayerSource(layer, 'webcam', 'webcam');
      grid.appendChild(wcCard);
      // Screen share card
      const ssCard = document.createElement('div');
      ssCard.className = 'holding-card holding-card-screenshare' + (state[layer].type === 'screenshare' ? ' active' : '');
      ssCard.title = 'Share a window or screen (PowerPoint, Canva, etc.)';
      ssCard.innerHTML = `<div class="webcam-card-icon">🖥</div><div class="holding-card-name">Screen Share</div>`;
      ssCard.onclick = () => setLayerSource(layer, 'screenshare', 'screenshare');
      grid.appendChild(ssCard);
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
    if (webcamStreams[layer]) { webcamStreams[layer].getTracks().forEach(t => t.stop()); webcamStreams[layer] = null; }
    if (screenShareStreams[layer]) { screenShareStreams[layer].getTracks().forEach(t => t.stop()); screenShareStreams[layer] = null; }
    div.innerHTML = '';

    if (src.type === 'none') {
      div.innerHTML = `<div class="layer-placeholder"><div class="layer-placeholder-icon">${layer === 'bg' ? '🖥' : '📺'}</div><div>No ${layer === 'bg' ? 'Background' : 'Foreground'} Media</div></div>`;
      syncFg2();
      if (venueModalOpen) refreshVenueScreen();
      return;
    }
    if (src.type === 'holding') {
      const h = HOLDINGS.find(x => x.id === src.id);
      if (!h) return;
      const img = document.createElement('img');
      img.src = h.path; img.style.objectFit = fit;
      div.appendChild(img);
      syncFg2();
      if (venueModalOpen) refreshVenueScreen();
      return;
    }
    if (src.type === 'webcam') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Webcam not supported in this browser', 'error'); return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        webcamStreams[layer] = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = video.muted = video.playsInline = true;
        video.style.objectFit = fit;
        div.appendChild(video);
        syncFg2();
        if (venueModalOpen) refreshVenueScreen();
      } catch (err) {
        toast('Webcam access denied or unavailable', 'error');
        state[layer] = { type: 'none', id: null };
        div.innerHTML = `<div class="layer-placeholder"><div class="layer-placeholder-icon">${layer === 'bg' ? '🖥' : '📺'}</div><div>No ${layer === 'bg' ? 'Background' : 'Foreground'} Media</div></div>`;
        syncFg2();
      }
      return;
    }
    if (src.type === 'screenshare') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast('Screen capture not supported in this browser', 'error'); return;
      }
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
        screenShareStreams[layer] = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = video.muted = video.playsInline = true;
        video.style.objectFit = fit;
        div.appendChild(video);
        // Auto-clear when user stops sharing via browser UI
        stream.getVideoTracks()[0].addEventListener('ended', () => clearLayer(layer));
        syncFg2();
        if (venueModalOpen) refreshVenueScreen();
      } catch (err) {
        if (err.name !== 'NotAllowedError') toast('Screen capture failed: ' + err.message, 'error');
        state[layer] = { type: 'none', id: null };
        div.innerHTML = `<div class="layer-placeholder"><div class="layer-placeholder-icon">${layer === 'bg' ? '🖥' : '📺'}</div><div>No ${layer === 'bg' ? 'Background' : 'Foreground'} Media</div></div>`;
        syncFg2();
      }
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
      if (venueModalOpen) refreshVenueScreen();
    }
  }

  // Mirror the foreground content into slot 2 for dual PIP presets
  function syncFg2() {
    const pip = getPipById(state.pip);
    if (!PipPresets.isDual(pip)) { el.layerFg2.innerHTML = ''; return; }
    el.layerFg2.innerHTML = '';
    const m = el.layerFg.querySelector('img, video');
    if (!m) return;
    let clone;
    if (m.tagName === 'VIDEO' && m.srcObject) {
      // Webcam — share the same MediaStream
      clone = document.createElement('video');
      clone.srcObject = m.srcObject;
      clone.autoplay = clone.muted = clone.playsInline = true;
    } else if (m.tagName === 'VIDEO') {
      clone = Object.assign(document.createElement('video'), { src: m.src, autoplay: true, loop: true, muted: true, playsInline: true });
    } else {
      clone = Object.assign(document.createElement('img'), { src: m.src });
    }
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
    if (src.type === 'webcam') {
      inner.innerHTML = '<div class="layer-empty-hint">📷 Live Webcam</div>';
      return;
    }
    if (src.type === 'screenshare') {
      inner.innerHTML = '<div class="layer-empty-hint">🖥 Screen Share</div>';
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
    if (venueModalOpen) refreshVenueScreen();
  }

  function refreshHoldingActive(layer) {
    const grid = layer === 'bg' ? el.bgHoldingGrid : el.fgHoldingGrid;
    const src = state[layer];
    grid.querySelectorAll('.holding-card').forEach(c => {
      if (c.classList.contains('holding-card-webcam')) {
        c.classList.toggle('active', src.type === 'webcam');
      } else if (c.classList.contains('holding-card-screenshare')) {
        c.classList.toggle('active', src.type === 'screenshare');
      } else {
        const imgEl = c.querySelector('img');
        const id = imgEl ? HOLDINGS.find(h => imgEl.alt === h.name)?.id : null;
        c.classList.toggle('active', src.type === 'holding' && src.id === id);
      }
    });
  }

  // ── Upload ───────────────────────────────────────────────────────
  function handleUpload(layer, file) {
    if (!file) return;
    if (!['image/', 'video/'].some(t => file.type.startsWith(t))) { toast('Only image and video files are supported', 'error'); return; }
    if (file.type === 'image/webp') { toast('WebP is not supported. Please use JPG, PNG, GIF, MP4, or WebM.', 'error'); return; }
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
    let clone;
    if (m.tagName === 'VIDEO' && m.srcObject) {
      clone = document.createElement('video');
      clone.srcObject = m.srcObject;
      clone.autoplay = clone.muted = clone.playsInline = true;
    } else if (m.tagName === 'VIDEO') {
      clone = Object.assign(document.createElement('video'), { src: m.src, autoplay: true, loop: true, muted: true, playsInline: true });
    } else {
      clone = Object.assign(document.createElement('img'), { src: m.src });
    }
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
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !venueModalOpen) closeFullscreen(); });

    bindPreviewDrop();
  }

  function clearLayer(layer) {
    if (webcamStreams[layer]) { webcamStreams[layer].getTracks().forEach(t => t.stop()); webcamStreams[layer] = null; }
    if (screenShareStreams[layer]) { screenShareStreams[layer].getTracks().forEach(t => t.stop()); screenShareStreams[layer] = null; }
    state[layer] = { type: 'none', id: null };
    applyLayerMedia(layer); updateLayerPreview(layer);
    refreshHoldingActive(layer); refreshLibraryActive(); saveState();
  }

  function bindDropZone(zone, layer) {
    zone.onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/gif,video/mp4,video/webm';
      inp.onchange = () => handleUpload(layer, inp.files[0]);
      inp.click();
    };
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop',      e => { e.preventDefault(); zone.classList.remove('drag-over'); handleUpload(layer, e.dataTransfer.files[0]); });
  }

  function bindPreviewDrop() {
    const display = el.screenDisplay;

    function resolveDropLayer(e) {
      // Check if the cursor is over a visible foreground layer
      const fgEl = e.target.closest('.layer-fg');
      if (fgEl && fgEl.style.display !== 'none') return 'fg';
      return 'bg';
    }

    function clearDragState() {
      el.layerBg.classList.remove('preview-drag-over', 'preview-drag-over-fg');
      el.layerFg.classList.remove('preview-drag-over', 'preview-drag-over-fg');
      el.layerFg2.classList.remove('preview-drag-over', 'preview-drag-over-fg');
      delete display.dataset.dropTarget;
    }

    display.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      const layer = resolveDropLayer(e);
      display.dataset.dropTarget = layer;
      if (layer === 'fg') {
        el.layerBg.classList.remove('preview-drag-over');
        el.layerFg.classList.add('preview-drag-over');
        el.layerFg2.classList.add('preview-drag-over');
      } else {
        el.layerFg.classList.remove('preview-drag-over');
        el.layerFg2.classList.remove('preview-drag-over');
        el.layerBg.classList.add('preview-drag-over');
      }
    });

    display.addEventListener('dragleave', e => {
      if (!display.contains(e.relatedTarget)) clearDragState();
    });

    display.addEventListener('drop', e => {
      e.preventDefault();
      const layer = display.dataset.dropTarget || 'bg';
      clearDragState();
      handleUpload(layer, e.dataTransfer.files[0]);
    });
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
    const pxW = Math.round(w    / 100 * VENUE.w);
    const pxH = Math.round(h    / 100 * VENUE.h);
    const pxL = Math.round(left / 100 * VENUE.w);
    const pxT = Math.round(top  / 100 * VENUE.h);
    $('pbi-w').textContent  = pxW + ' px';
    $('pbi-h').textContent  = pxH + ' px';
    $('pbi-l').textContent  = pxL + ' px';
    $('pbi-t').textContent  = pxT + ' px';
    $('pbi-wm').textContent = w.toFixed(1)    + '%';
    $('pbi-hm').textContent = h.toFixed(1)    + '%';
    $('pbi-lm').textContent = left.toFixed(1) + '%';
    $('pbi-tm').textContent = top.toFixed(1)  + '%';
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
      const rw = parseInt(resW.value), rh = parseInt(resH.value);
      if (!rw || !rh) return;
      const src = builder.activeSlot === 2 ? builder.fg2 : builder.fg;
      const { left, top } = src;
      const newW = clamp(rw / VENUE.w * 100, MIN, 100 - left);
      const newH = clamp(rh / VENUE.h * 100, MIN, 100 - top);
      const result = { left, top, w: newW, h: newH };
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
      inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/gif,image/svg+xml';
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
    if (file.type === 'image/webp') { toast('WebP is not supported. Please use JPG, PNG, or SVG.', 'error'); return; }
    const id = 'brand_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    ScreenTestDB.saveMedia(id, file, { name: file.name, type: file.type, size: file.size, brand: true })
      .then(() => { toast('Brand asset saved: ' + file.name, 'success'); loadBrandAssets(); refreshLibrary(); })
      .catch(e => toast('Save failed: ' + e.message, 'error'));
  }

  // ── Tour ────────────────────────────────────────────────────────
  const TOUR_STEPS = [
    {
      target: null,
      title: 'Welcome to ScreenTest',
      body: 'A live preview tool for the FOHP 9m × 3m LED screen. This short tour covers the key features — it only takes a minute.',
    },
    {
      target: '#preview-wrapper',
      title: 'Screen Preview',
      body: 'Your live screen preview — updates in real time as you make changes. You can also drag image or video files directly onto it to load them instantly.',
      position: 'left',
    },
    {
      target: '#panel-bg',
      title: 'Background Layer',
      body: 'Upload an image or video to fill the full 9m × 3m screen. Holding Images gives you test patterns plus live options like webcam and screen share.',
      position: 'right',
    },
    {
      target: '#panel-pip',
      title: 'PIP / Overlay Layout',
      body: 'Choose how your foreground content is positioned on screen. Select a preset to instantly change where the PIP zone appears.',
      position: 'right',
    },
    {
      target: '#panel-fg',
      title: 'Foreground Content',
      body: 'Load the content that plays inside your PIP zone — a camera feed, sponsor graphic, or secondary video. Supports images, video, webcam, and screen share.',
      position: 'right',
    },
    {
      target: '#btn-venue',
      title: 'Venue Preview',
      body: 'See how your content looks on the actual physical screen. Upload a photo of the venue and the app overlays your content onto the LED screen at the correct perspective angle.',
      position: 'bottom',
    },
    {
      target: '.header-actions',
      title: 'Export & Screenshot',
      body: 'Export Template creates a layout document with exact pixel dimensions for your design crew. Screenshot captures the full 3456 × 1152 px preview as a PNG.',
      position: 'bottom',
    },
    {
      target: null,
      title: "You're all set!",
      body: 'Tap ? Help at any time for the full user guide, or click ▶ Tour in the header to replay this walkthrough.',
    },
  ];

  let tourStep = 0;

  function initTour() {
    $('btn-tour').onclick = startTour;
    $('tour-skip').onclick = endTour;
    $('tour-btn-prev').onclick = () => advanceTour(-1);
    $('tour-btn-next').onclick = () => advanceTour(1);
    if (localStorage.getItem('screentest-tour-done') !== '1') startTour();
  }

  function startTour() {
    tourStep = 0;
    $('tour-overlay').classList.add('active');
    showTourStep();
  }

  function endTour() {
    $('tour-overlay').classList.remove('active');
    localStorage.setItem('screentest-tour-done', '1');
  }

  function advanceTour(dir) {
    const next = tourStep + dir;
    if (next < 0) return;
    if (next >= TOUR_STEPS.length) { endTour(); return; }
    tourStep = next;
    showTourStep();
  }

  function showTourStep() {
    const step     = TOUR_STEPS[tourStep];
    const spotlight = $('tour-spotlight');
    const popover   = $('tour-popover');
    const total     = TOUR_STEPS.length;

    $('tour-title').textContent      = step.title;
    $('tour-body').textContent        = step.body;
    $('tour-step-count').textContent  = (tourStep + 1) + ' / ' + total;
    $('tour-btn-prev').style.visibility = tourStep > 0 ? 'visible' : 'hidden';
    $('tour-btn-next').textContent    = tourStep === total - 1 ? 'Done ✓' : 'Next →';

    const PAD = 10, GAP = 16, PW = 264;

    if (!step.target) {
      spotlight.style.opacity = '0';
      popover.style.cssText = 'top:50%;left:50%;transform:translate(-50%,-50%)';
      return;
    }

    const target = document.querySelector(step.target);
    if (!target) { spotlight.style.opacity = '0'; return; }

    // Expand collapsed panel if needed
    const panel = target.classList.contains('panel') ? target : target.closest('.panel');
    if (panel && panel.classList.contains('collapsed')) panel.classList.remove('collapsed');
    target.scrollIntoView({ behavior: 'instant', block: 'nearest' });

    const r = target.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    spotlight.style.cssText = `opacity:1;top:${r.top - PAD}px;left:${r.left - PAD}px;width:${r.width + PAD * 2}px;height:${r.height + PAD * 2}px`;

    let css = 'transform:none;';
    if (step.position === 'right') {
      const left = Math.min(r.right + PAD + GAP, vw - PW - 8);
      const top  = Math.max(8, Math.min(r.top - PAD, vh - 200));
      css += `top:${top}px;left:${left}px;right:auto;bottom:auto`;
    } else if (step.position === 'left') {
      const left = Math.max(8, r.left - PW - PAD - GAP);
      const top  = Math.max(8, Math.min(r.top - PAD, vh - 200));
      css += `top:${top}px;left:${left}px;right:auto;bottom:auto`;
    } else if (step.position === 'bottom') {
      const left = Math.max(8, Math.min(r.left, vw - PW - 8));
      css += `top:${r.bottom + PAD + GAP}px;left:${left}px;right:auto;bottom:auto`;
    }
    popover.style.cssText = css;
  }

  // ── Venue Preview ────────────────────────────────────────────────
  const VENUE_W = 1000, VENUE_H = 333;

  function solveHomography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const sx = src[i][0], sy = src[i][1];
      const dx = dst[i][0], dy = dst[i][1];
      A.push([-sx, -sy, -1, 0, 0, 0, dx * sx, dx * sy]);
      b.push(-dx);
      A.push([0, 0, 0, -sx, -sy, -1, dy * sx, dy * sy]);
      b.push(-dy);
    }
    const h = gaussianElim(A, b);
    return h;
  }

  function gaussianElim(A, b) {
    const n = 8;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n; row++)
        if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
      [M[col], M[maxRow]] = [M[maxRow], M[col]];
      const pivot = M[col][col];
      if (Math.abs(pivot) < 1e-10) continue;
      for (let j = col; j <= n; j++) M[col][j] /= pivot;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = M[row][col];
        for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
      }
    }
    return M.map(row => row[n]);
  }

  function computeMatrix3d(corners, cW, cH) {
    const src = [[0, 0], [VENUE_W, 0], [VENUE_W, VENUE_H], [0, VENUE_H]];
    const dst = corners.map(c => [c.x * cW, c.y * cH]);
    const h = solveHomography(src, dst);
    return [
      h[0], h[3], 0, h[6],
      h[1], h[4], 0, h[7],
      0,    0,    1, 0,
      h[2], h[5], 0, 1
    ].join(',');
  }

  function applyVenueTransform() {
    const container = $('venue-photo-container');
    const wrap = $('venue-screen-wrap');
    if (!container || !wrap) return;
    const cW = container.offsetWidth;
    const cH = container.offsetHeight;
    if (!cW || !cH) return;
    const m = computeMatrix3d(venueCorners, cW, cH);
    wrap.style.transform = `matrix3d(${m})`;
    venueCorners.forEach((c, i) => {
      const h = $(`venue-handle-${i}`);
      if (h) { h.style.left = (c.x * cW) + 'px'; h.style.top = (c.y * cH) + 'px'; }
    });
  }

  function refreshVenueScreen() {
    const wrap = $('venue-screen-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    const bgDiv = document.createElement('div');
    bgDiv.className = 'layer layer-bg';
    bgDiv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    cloneLayer(el.layerBg, bgDiv, state.bgFit);
    wrap.appendChild(bgDiv);

    const pip = getPipById(state.pip);
    if (PipPresets.isDual(pip)) {
      pip.slots.forEach(slot => {
        const ps = PipPresets.toStyle(slot);
        const div = document.createElement('div');
        div.className = 'layer layer-fg pip-slot';
        Object.assign(div.style, { position: 'absolute', top: 'auto', left: 'auto', right: 'auto', bottom: 'auto' }, ps);
        div.classList.toggle('show-border', state.showPipBorder);
        cloneLayer(el.layerFg, div, state.fgFit);
        wrap.appendChild(div);
      });
    } else {
      const fgDiv = document.createElement('div');
      fgDiv.className = 'layer layer-fg';
      const ps = PipPresets.toStyle(pip.fg);
      if (!ps) { fgDiv.style.display = 'none'; }
      else { Object.assign(fgDiv.style, { position: 'absolute', top: 'auto', left: 'auto', right: 'auto', bottom: 'auto' }, ps); }
      fgDiv.classList.toggle('show-border', state.showPipBorder);
      cloneLayer(el.layerFg, fgDiv, state.fgFit);
      wrap.appendChild(fgDiv);
    }
  }

  function openVenuePreview() {
    $('venue-overlay').classList.add('active');
    venueModalOpen = true;
    applyVenueAdminUI();
    loadVenueState().then(() => {
      // Use default config if no locally saved photo and a default exists
      if (!venuePhotoBlobUrl && venueDefaultConfig) {
        venueCorners = venueDefaultConfig.corners.map(c => ({ x: c[0], y: c[1] }));
        showVenuePhoto(venueDefaultConfig.photoSrc);
      } else if (venuePhotoBlobUrl) {
        showVenuePhoto(venuePhotoBlobUrl);
      }
      refreshVenueScreen();
      applyVenueTransform();
    });
  }

  function applyVenueAdminUI() {
    const unlocked = venueAdminUnlocked;
    $('venue-overlay').classList.toggle('venue-admin-mode', unlocked);
    document.querySelectorAll('.venue-handle').forEach(el => el.classList.toggle('venue-handle-locked', !unlocked));
    $('venue-hint').style.display = unlocked ? '' : 'none';
    $('btn-venue-admin-lock').textContent = unlocked ? '🔓' : '🔒';
    const hasPhoto = $('venue-photo-container').classList.contains('has-photo');
    $('venue-upload-prompt').style.display = unlocked && !hasPhoto ? 'flex' : 'none';
  }

  function closeVenuePreview() {
    $('venue-overlay').classList.remove('active');
    venueModalOpen = false;
  }

  async function loadVenueState() {
    try {
      const corners = await ScreenTestDB.getSetting('venueCorners');
      if (corners && corners.length === 4) venueCorners = corners;
    } catch (e) {}
    try {
      const blob = await ScreenTestDB.getSetting('venuePhotoBlob');
      if (blob) {
        if (venuePhotoBlobUrl) URL.revokeObjectURL(venuePhotoBlobUrl);
        venuePhotoBlobUrl = URL.createObjectURL(blob);
      }
    } catch (e) {}
  }

  async function saveVenueState() {
    try { await ScreenTestDB.saveSetting('venueCorners', venueCorners); } catch (e) {}
  }

  function showVenuePhoto(url) {
    const img = $('venue-photo');
    const container = $('venue-photo-container');
    const prompt = $('venue-upload-prompt');
    img.src = url;
    img.onload = () => {
      container.classList.add('has-photo');
      prompt.style.display = 'none';
      applyVenueTransform();
    };
  }

  function initVenueEvents() {
    $('btn-venue').onclick = openVenuePreview;
    $('btn-venue-close').onclick = closeVenuePreview;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && venueModalOpen) closeVenuePreview(); });

    $('btn-venue-admin-lock').onclick = () => {
      if (venueAdminUnlocked) {
        venueAdminUnlocked = false;
        applyVenueAdminUI();
        return;
      }
      const code = prompt('Enter admin code:');
      if (code === ADMIN_CODE) {
        venueAdminUnlocked = true;
        applyVenueAdminUI();
      } else if (code !== null) {
        toast('Incorrect admin code', 'error');
      }
    };

    const triggerUpload = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp,image/gif';
      inp.onchange = async () => {
        const file = inp.files[0];
        if (!file) return;
        if (venuePhotoBlobUrl) URL.revokeObjectURL(venuePhotoBlobUrl);
        venuePhotoBlobUrl = URL.createObjectURL(file);
        showVenuePhoto(venuePhotoBlobUrl);
        try { await ScreenTestDB.saveSetting('venuePhotoBlob', file); } catch (e) {}
      };
      inp.click();
    };
    $('btn-venue-upload').onclick = triggerUpload;
    $('btn-venue-upload-btn').onclick = triggerUpload;

    $('btn-venue-save-img').onclick = venueExportImage;
    $('btn-venue-export-default').onclick = venueExportDefault;

    const container = $('venue-photo-container');

    container.addEventListener('mousedown', venueHandleMouseDown);
    document.addEventListener('mousemove', venueHandleMouseMove);
    document.addEventListener('mouseup',   venueHandleMouseUp);

    container.addEventListener('touchstart', venueHandleTouchStart, { passive: false });
    document.addEventListener('touchmove',   venueHandleTouchMove,  { passive: false });
    document.addEventListener('touchend',    venueHandleTouchEnd);

    new ResizeObserver(() => { if (venueModalOpen) applyVenueTransform(); }).observe(container);
  }

  function venueHandleMouseDown(e) {
    const h = e.target.closest('.venue-handle');
    if (!h || !venueAdminUnlocked) return;
    venueDragHandle = +h.dataset.h;
    e.preventDefault();
  }

  function venueHandleMouseMove(e) {
    if (venueDragHandle === null) return;
    updateVenueHandle(venueDragHandle, e.clientX, e.clientY);
  }

  function venueHandleMouseUp() { venueDragHandle = null; }

  function venueHandleTouchStart(e) {
    const h = e.target.closest('.venue-handle');
    if (!h || !venueAdminUnlocked) return;
    venueDragHandle = +h.dataset.h;
    e.preventDefault();
  }

  function venueHandleTouchMove(e) {
    if (venueDragHandle === null) return;
    e.preventDefault();
    const t = e.touches[0];
    updateVenueHandle(venueDragHandle, t.clientX, t.clientY);
  }

  function venueHandleTouchEnd() { venueDragHandle = null; }

  function updateVenueHandle(idx, clientX, clientY) {
    const container = $('venue-photo-container');
    const r = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (clientY - r.top)  / r.height));
    venueCorners[idx] = { x, y };
    applyVenueTransform();
    saveVenueState();
  }

  function venueExportImage() {
    const photoEl = $('venue-photo');
    if (!photoEl.src || !photoEl.naturalWidth) { toast('Upload a venue photo first', 'error'); return; }

    const nW = photoEl.naturalWidth;
    const nH = photoEl.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width  = nW;
    canvas.height = nH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(photoEl, 0, 0, nW, nH);

    const src = [[0, 0], [VENUE_W, 0], [VENUE_W, VENUE_H], [0, VENUE_H]];
    const dst = venueCorners.map(c => [c.x * nW, c.y * nH]);
    const h = solveHomography(src, dst);

    const GRID = 20;
    const offscreen = document.createElement('canvas');
    offscreen.width = VENUE_W; offscreen.height = VENUE_H;
    const octx = offscreen.getContext('2d');

    const wrap = $('venue-screen-wrap');
    if (wrap && wrap.offsetWidth) {
      octx.drawImage(wrap.querySelector('img, video') || wrap, 0, 0, VENUE_W, VENUE_H);
    }

    html2canvasVenueWrap(wrap, offscreen, octx).then(() => {
      drawWarpedMesh(ctx, offscreen, h, GRID);
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `venue-preview-${Date.now()}.png`;
        a.click();
        toast('Venue image saved!', 'success');
      }, 'image/png');
    });
  }

  async function html2canvasVenueWrap(wrap, canvas, ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!wrap) return;
    const bgEl = wrap.querySelector('.layer-bg img, .layer-bg video');
    if (bgEl) {
      ctx.save();
      applyObjectFitTransform(ctx, bgEl, 0, 0, VENUE_W, VENUE_H, state.bgFit);
      ctx.restore();
    }
    const pip = getPipById(state.pip);
    if (PipPresets.isDual(pip)) {
      pip.slots.forEach(slot => {
        const px = PipPresets.toPixels(slot, VENUE_W, VENUE_H);
        const fgEl = wrap.querySelector('.layer-fg img, .layer-fg video');
        if (fgEl) {
          ctx.save();
          applyObjectFitTransform(ctx, fgEl, px.x, px.y, px.w, px.h, state.fgFit);
          ctx.restore();
        }
      });
    } else if (pip.fg) {
      const px = PipPresets.toPixels(pip.fg, VENUE_W, VENUE_H);
      const fgEl = wrap.querySelector('.layer-fg img, .layer-fg video');
      if (fgEl) {
        ctx.save();
        applyObjectFitTransform(ctx, fgEl, px.x, px.y, px.w, px.h, state.fgFit);
        ctx.restore();
      }
    }
  }

  function applyObjectFitTransform(ctx, media, x, y, w, h, fit) {
    const mW = media.videoWidth || media.naturalWidth || w;
    const mH = media.videoHeight || media.naturalHeight || h;
    if (!mW || !mH) return;
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

  function applyHomography(h, x, y) {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  }

  function drawWarpedMesh(ctx, src, h, GRID) {
    const sw = src.width, sh = src.height;
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const u0 = gx / GRID, u1 = (gx + 1) / GRID;
        const v0 = gy / GRID, v1 = (gy + 1) / GRID;
        const sx0 = u0 * sw, sy0 = v0 * sh;
        const sx1 = u1 * sw, sy1 = v1 * sh;

        const [dx00x, dx00y] = applyHomography(h, sx0, sy0);
        const [dx10x, dx10y] = applyHomography(h, sx1, sy0);
        const [dx01x, dx01y] = applyHomography(h, sx0, sy1);
        const [dx11x, dx11y] = applyHomography(h, sx1, sy1);

        drawTexturedTriangle(ctx, src,
          sx0, sy0, dx00x, dx00y,
          sx1, sy0, dx10x, dx10y,
          sx0, sy1, dx01x, dx01y);
        drawTexturedTriangle(ctx, src,
          sx1, sy0, dx10x, dx10y,
          sx1, sy1, dx11x, dx11y,
          sx0, sy1, dx01x, dx01y);
      }
    }
  }

  function drawTexturedTriangle(ctx, img,
    sx0, sy0, dx0, dy0,
    sx1, sy1, dx1, dy1,
    sx2, sy2, dx2, dy2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.clip();

    const dxA = dx1 - dx0, dyA = dy1 - dy0;
    const dxB = dx2 - dx0, dyB = dy2 - dy0;
    const sxA = sx1 - sx0, syA = sy1 - sy0;
    const sxB = sx2 - sx0, syB = sy2 - sy0;

    const det = sxA * syB - syA * sxB;
    if (Math.abs(det) < 1e-6) { ctx.restore(); return; }

    const a =  (dxA * syB - dxB * syA) / det;
    const b =  (dxB * sxA - dxA * sxB) / det;
    const c = dx0 - a * sx0 - b * sy0;
    const d =  (dyA * syB - dyB * syA) / det;
    const e_=  (dyB * sxA - dyA * sxB) / det;
    const f = dy0 - d * sx0 - e_ * sy0;

    ctx.transform(a, d, b, e_, c, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function venueExportDefault() {
    const photoEl = $('venue-photo');
    if (!photoEl.src || !photoEl.naturalWidth) { toast('Upload a venue photo first', 'error'); return; }

    // Download config.json
    const config = {
      photoSrc: './assets/venue/photo.jpg',
      corners: venueCorners.map(c => [c.x, c.y])
    };
    const cfgBlob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const cfgA = document.createElement('a');
    cfgA.href = URL.createObjectURL(cfgBlob);
    cfgA.download = 'config.json';
    cfgA.click();

    // Download the venue photo as photo.jpg
    const canvas = document.createElement('canvas');
    canvas.width = photoEl.naturalWidth;
    canvas.height = photoEl.naturalHeight;
    canvas.getContext('2d').drawImage(photoEl, 0, 0);
    canvas.toBlob(blob => {
      const imgA = document.createElement('a');
      imgA.href = URL.createObjectURL(blob);
      imgA.download = 'photo.jpg';
      imgA.click();
      toast('Commit both files to assets/venue/ in the repository', 'success');
    }, 'image/jpeg', 0.92);
  }

  return { init, startTour, endTour, openVenuePreview };
})();

document.addEventListener('DOMContentLoaded', () => ScreenTest.init());
