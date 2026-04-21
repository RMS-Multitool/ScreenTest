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
  let library = [];

  const RES_PRESETS = [
    { label: 'Full Screen — 3456×1152', w: 3456, h: 1152, venue: true },
    { label: 'PIP — 1920×1080',         w: 1920, h: 1080 }
  ];

  const HOLDINGS = [
    { id: 'test-pattern', name: 'Test Pattern',        path: './assets/holding/test-pattern.svg' },
    { id: 'sponsor',      name: 'Sponsor Placeholder', path: './assets/holding/sponsor-placeholder.svg' },
    { id: 'live-now',     name: 'Live Now',            path: './assets/holding/live-now.svg' },
    { id: 'coming-soon',  name: 'Coming Soon',         path: './assets/holding/coming-soon.svg' },
    { id: 'intermission', name: 'Intermission',        path: './assets/holding/intermission.svg' }
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
    renderResPresets();
    renderPipGrid();
    renderHoldingGrids();
    await refreshLibrary();
    applyStateToUI();

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
  }

  function selectPip(id) {
    state.pip = id;
    document.querySelectorAll('.pip-card').forEach(c => c.classList.toggle('active', c.dataset.pip === id));
    updatePipLayout();
    updateMetaPip();
    saveState();
  }

  function updatePipLayout() {
    const pip = PipPresets.byId(state.pip);
    const style = PipPresets.toStyle(pip.fg);
    if (!style) { el.layerFg.style.display = 'none'; return; }
    el.layerFg.style.display = '';
    Object.assign(el.layerFg.style, { top: 'auto', left: 'auto', right: 'auto', bottom: 'auto', width: '', height: '' });
    Object.assign(el.layerFg.style, style);
    el.layerFg.classList.toggle('show-border', state.showPipBorder);
  }

  function updateMetaPip() {
    el.metaPip.textContent = PipPresets.byId(state.pip).name;
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

    const pip = PipPresets.byId(state.pip);
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
    const ps = PipPresets.toStyle(PipPresets.byId(state.pip).fg);
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

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => ScreenTest.init());
