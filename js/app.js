'use strict';

const ScreenTest = (() => {
  const VENUE = { w: 3456, h: 1152, physW: 9, physH: 3, unit: 'm', ratio: '3:1' };

  let state = {
    screenW: VENUE.w, screenH: VENUE.h,
    pip: 'none',
    bg: { type: 'none', id: null },
    fg: { type: 'none', id: null },
    bgFit: 'cover', fgFit: 'contain',
    fgOpacity: 100,
    showSafeArea: false, showPipBorder: true
  };

  const blobUrls = { bg: null, fg: null };
  let library     = [];
  let customPips  = [];
  let brandAssets = [];
  const builder   = { fg: { left: 25, top: 25, w: 50, h: 50 }, drag: null };

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
    { id: 'fohp-brand',   name: 'FOHP Brand',          path: './assets/holding/fohp-brand.svg' },
    { id: 'test-pattern', name: 'Test Pattern',         path: './assets/holding/test-pattern.svg' },
    { id: 'sponsor',      name: 'Sponsor Placeholder',  path: './assets/holding/sponsor-placeholder.svg' },
    { id: 'live-now',     name: 'Live Now',             path: './assets/holding/live-now.svg' },
    { id: 'coming-soon',  name: 'Coming Soon',          path: './assets/holding/coming-soon.svg' },
    { id: 'intermission', name: 'Intermission',         path: './assets/holding/intermission.svg' }
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
    el.fgOpacitySlider = $('fg-opacity');
    el.fgOpacityVal    = $('fg-opacity-val');
    el.safeAreaToggle  = $('safe-area-toggle');
    el.pipBorderToggle = $('pip-border-toggle');
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
    el.fgOpacitySlider.value = state.fgOpacity;
    el.fgOpacityVal.textContent = state.fgOpacity + '%';
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
    state.pip = id;
    document.querySelectorAll('.pip-card').forEach(c => c.classList.toggle('active', c.dataset.pip === id));
    updatePipLayout();
    updateMetaPip();
    saveState();
  }

  function updatePipLayout() {
    const pip = getPipById(state.pip);
    const style = PipPresets.toStyle(pip.fg);
    if (!style) { el.layerFg.style.display = 'none'; return; }
    el.layerFg.style.display = '';
    Object.assign(el.layerFg.style, { top: 'auto', left: 'auto', right: 'auto', bottom: 'auto', width: '', height: '' });
    Object.assign(el.layerFg.style, style);
    el.layerFg.classList.toggle('show-border', state.showPipBorder);
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
      return;
    }
    if (src.type === 'holding') {
      const h = HOLDINGS.find(x => x.id === src.id);
      if (!h) return;
      const img = document.createElement('img');
      img.src = h.path; img.style.objectFit = fit;
      div.appendChild(img);
      return;
    }
    if (src.type === 'library') {
      const item = await ScreenTestDB.getMedia(src.id).catch(() => null);
      if (!item) return;
      const url = URL.createObjectURL(item.blob);
      blobUrls[layer] = url;
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
      if (layer === 'fg') media.style.opacity = state.fgOpacity / 100;
      div.appendChild(media);
    }
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
      const item = library.find(x => x.id === src.id);
      if (!item) return;
      const isVideo = item.meta.type && item.meta.type.startsWith('video/');
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
        <div class="lib-card-media-wrap" style="position:absolute;inset:0;overflow:hidden"></div>
        <div class="lib-card-overlay">
          <span class="lib-card-type">${isVideo ? 'VID' : 'IMG'} · ${fmtSize(item.meta.size)}</span>
          <div class="lib-card-actions">
            <button class="lib-btn lib-btn-bg" title="Set as Background">BG</button>
            <button class="lib-btn lib-btn-fg" title="Set as Foreground">FG</button>
            <button class="lib-btn lib-btn-del" title="Delete">✕</button>
          </div>
        </div>
        <div class="lib-card-name">${item.meta.name || item.id}</div>`;

      const wrap = card.querySelector('.lib-card-media-wrap');
      const thumbUrl = URL.createObjectURL(item.blob);
      const thumb = isVideo
        ? Object.assign(document.createElement('video'), { src: thumbUrl, muted: true })
        : Object.assign(document.createElement('img'), { src: thumbUrl, className: 'lib-card-media' });
      thumb.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      wrap.appendChild(thumb);

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

  // ── Screenshot ───────────────────────────────────────────────────
  async function takeScreenshot() {
    const canvas = document.createElement('canvas');
    canvas.width = state.screenW; canvas.height = state.screenH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgMedia = el.layerBg.querySelector('img, video');
    if (bgMedia) drawFitted(ctx, bgMedia, 0, 0, state.screenW, state.screenH, state.bgFit);

    const pip = getPipById(state.pip);
    if (pip.fg && el.layerFg.style.display !== 'none') {
      const fgMedia = el.layerFg.querySelector('img, video');
      if (fgMedia) {
        const px = PipPresets.toPixels(pip.fg, state.screenW, state.screenH);
        ctx.save(); ctx.globalAlpha = state.fgOpacity / 100;
        drawFitted(ctx, fgMedia, px.x, px.y, px.w, px.h, state.fgFit);
        ctx.restore();
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
    const fgDiv = document.createElement('div'); fgDiv.className = 'layer layer-fg';
    const ps = PipPresets.toStyle(getPipById(state.pip).fg);
    if (!ps) { fgDiv.style.display = 'none'; }
    else { Object.assign(fgDiv.style, { top: 'auto', left: 'auto', right: 'auto', bottom: 'auto' }, ps); }
    cloneLayer(el.layerBg, bgDiv, state.bgFit, 100);
    cloneLayer(el.layerFg, fgDiv, state.fgFit, state.fgOpacity);
    el.fsScreen.appendChild(bgDiv);
    el.fsScreen.appendChild(fgDiv);
  }

  function cloneLayer(src, dest, fit, opacity) {
    const m = src.querySelector('img, video');
    if (!m) return;
    const clone = m.tagName === 'VIDEO'
      ? Object.assign(document.createElement('video'), { src: m.src, autoplay: true, loop: true, muted: true, playsInline: true })
      : Object.assign(document.createElement('img'), { src: m.src });
    clone.style.cssText = `width:100%;height:100%;object-fit:${fit};opacity:${opacity / 100}`;
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

    el.fgOpacitySlider.addEventListener('input', () => {
      state.fgOpacity = +el.fgOpacitySlider.value;
      el.fgOpacityVal.textContent = state.fgOpacity + '%';
      const m = el.layerFg.querySelector('img, video');
      if (m) m.style.opacity = state.fgOpacity / 100;
      saveState();
    });

    el.safeAreaToggle.onchange  = () => { state.showSafeArea  = el.safeAreaToggle.checked;  el.safeOverlay.classList.toggle('hidden', !state.showSafeArea); saveState(); };
    el.pipBorderToggle.onchange = () => { state.showPipBorder = el.pipBorderToggle.checked; el.layerFg.classList.toggle('show-border', state.showPipBorder); saveState(); };

    const applyRes = () => { const w = +el.customW.value, h = +el.customH.value; if (w > 0 && h > 0) setResolution(w, h); };
    el.customW.addEventListener('change', applyRes);
    el.customH.addEventListener('change', applyRes);

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
    customPips = await ScreenTestDB.getSetting('customPips', []);
  }

  function saveCustomPips() {
    ScreenTestDB.saveSetting('customPips', customPips).catch(() => {});
  }

  function renderCustomPipGroup() {
    const existing = el.pipGroups.querySelector('.pip-group-custom');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'pip-group pip-group-custom';
    wrap.innerHTML = '<div class="pip-group-label">Custom Presets</div>';
    const grid = document.createElement('div');
    grid.className = 'pip-grid';

    customPips.forEach(pip => {
      const card = document.createElement('div');
      card.className = 'pip-card' + (pip.id === state.pip ? ' active' : '');
      card.dataset.pip = pip.id;
      card.title = pip.name;
      card.style.position = 'relative';
      card.innerHTML = `<div class="pip-thumb">${PipPresets.thumbnail(pip)}</div><div class="pip-name">${pip.name}</div>`;
      card.onclick = () => selectPip(pip.id);
      const del = document.createElement('button');
      del.className = 'pip-card-del'; del.title = 'Delete preset'; del.textContent = '✕';
      del.onclick = e => { e.stopPropagation(); deleteCustomPip(pip.id); };
      card.appendChild(del);
      grid.appendChild(card);
    });

    const addCard = document.createElement('div');
    addCard.className = 'pip-card pip-add-card';
    addCard.title = 'Create a custom PIP preset';
    addCard.innerHTML = `
      <div class="pip-thumb" style="position:relative;padding-bottom:56.25%">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--accent)">+</div>
      </div>
      <div class="pip-name">Add New</div>`;
    addCard.onclick = () => openPipBuilder();
    grid.appendChild(addCard);

    wrap.appendChild(grid);
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
    builder.fg = { left: 25, top: 25, w: 50, h: 50 };
    $('pip-builder-name').value = '';
    $('pip-builder-modal').classList.add('active');
    updateBuilderBox();
  }

  function closePipBuilder() {
    $('pip-builder-modal').classList.remove('active');
    builder.drag = null;
  }

  function updateBuilderBox() {
    const { left, top, w, h } = builder.fg;
    const box = $('pip-builder-box');
    box.style.left = left + '%'; box.style.top  = top  + '%';
    box.style.width = w   + '%'; box.style.height = h  + '%';
    $('pbi-w').textContent  = Math.round(w)    + '%';
    $('pbi-h').textContent  = Math.round(h)    + '%';
    $('pbi-l').textContent  = Math.round(left) + '%';
    $('pbi-t').textContent  = Math.round(top)  + '%';
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

    function updateRatioLabel() {
      const rw = parseInt(resW.value), rh = parseInt(resH.value);
      if (rw > 0 && rh > 0) {
        builder.ratio = rw / rh;
        const g = (a, b) => b ? g(b, a % b) : a;
        const d = g(rw, rh);
        ratioLbl.textContent = (rw/d) + ':' + (rh/d);
        ratioLbl.style.display = '';
      } else {
        builder.ratio = null;
        ratioLbl.style.display = 'none';
      }
    }

    resW.addEventListener('input', updateRatioLabel);
    resH.addEventListener('input', updateRatioLabel);
    lockChk.addEventListener('change', () => { builder.lockRatio = lockChk.checked; });

    box.addEventListener('mousedown', e => {
      if (e.target.dataset.h) return;
      e.preventDefault();
      builder.drag = { mode: 'move', sx: e.clientX, sy: e.clientY, sf: { ...builder.fg } };
    });

    box.querySelectorAll('.pip-handle').forEach(h => {
      h.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        builder.drag = { mode: e.target.dataset.h, sx: e.clientX, sy: e.clientY, sf: { ...builder.fg } };
      });
    });

    document.addEventListener('mousemove', e => {
      if (!builder.drag) return;
      const rect   = screen.getBoundingClientRect();
      const dx     = (e.clientX - builder.drag.sx) / rect.width  * 100;
      const dy     = (e.clientY - builder.drag.sy) / rect.height * 100;
      const sf     = builder.drag.sf;
      const locked = builder.lockRatio && builder.ratio;
      let { left, top, w, h } = sf;

      // Constrain a width to its locked-ratio height, clamped to available space
      const fitW = (nw, maxW, maxH, anchorTop) => {
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
        case 'se': {
          const r = fitW(sf.w+dx, 100-sf.left, 100-sf.top);
          w = r.w; if (locked) h = r.h; else h = clamp(sf.h+dy, MIN, 100-sf.top);
          break;
        }
        case 'sw': {
          const r = fitW(sf.w-dx, sf.left+sf.w, 100-sf.top);
          left = sf.left+sf.w-r.w; w = r.w;
          if (locked) h = r.h; else h = clamp(sf.h+dy, MIN, 100-sf.top);
          break;
        }
        case 'ne': {
          const r = fitW(sf.w+dx, 100-sf.left, sf.top+sf.h);
          w = r.w;
          if (locked) { h = r.h; top = sf.top+sf.h-h; } else { const rh=fitH(sf.h-dy,sf.top+sf.h,100-sf.left); h=rh.h; top=sf.top+sf.h-h; }
          break;
        }
        case 'nw': {
          const r = fitW(sf.w-dx, sf.left+sf.w, sf.top+sf.h);
          left = sf.left+sf.w-r.w; w = r.w;
          if (locked) { h = r.h; top = sf.top+sf.h-h; } else { const rh=fitH(sf.h-dy,sf.top+sf.h,100-sf.left); h=rh.h; top=sf.top+sf.h-h; }
          break;
        }
        case 'e':  { const r=fitW(sf.w+dx,100-sf.left,100-sf.top); w=r.w; if(locked)h=r.h; break; }
        case 'w':  { const r=fitW(sf.w-dx,sf.left+sf.w,100-sf.top); left=sf.left+sf.w-r.w; w=r.w; if(locked)h=r.h; break; }
        case 's':  { const r=fitH(sf.h+dy,100-sf.top,100-sf.left); h=r.h; if(locked)w=r.w; break; }
        case 'n':  { const r=fitH(sf.h-dy,sf.top+sf.h,100-sf.left); h=r.h; top=sf.top+sf.h-h; if(locked)w=r.w; break; }
      }
      builder.fg = { left, top, w, h };
      updateBuilderBox();
    });

    document.addEventListener('mouseup', () => { builder.drag = null; });

    $('pip-builder-save').onclick = () => {
      const name = $('pip-builder-name').value.trim();
      if (!name) { toast('Please enter a preset name', 'error'); $('pip-builder-name').focus(); return; }
      const pip = {
        id: 'custom_' + Date.now(),
        name,
        group: 'Custom',
        fg: { left: Math.round(builder.fg.left), top: Math.round(builder.fg.top), w: Math.round(builder.fg.w), h: Math.round(builder.fg.h) }
      };
      customPips.push(pip);
      saveCustomPips();
      renderCustomPipGroup();
      closePipBuilder();
      toast('Preset saved: ' + name, 'success');
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
