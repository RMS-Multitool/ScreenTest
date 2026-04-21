'use strict';

const PipPresets = (() => {
  // Each preset defines the foreground layer's position/size in percentages.
  // fg: null means PIP layer is hidden (background only).
  // Omitting a side key (left/right, top/bottom) means it is not constrained from that edge.
  const PRESETS = [
    { id: 'none',         name: 'Background Only',   group: 'Basic',         fg: null },
    { id: 'fg-full',      name: 'Foreground Full',   group: 'Basic',         fg: { top: 0,  left: 0,  w: 100, h: 100 } },

    { id: 'q-tl',         name: 'Top Left ¼',        group: 'Quarter',       fg: { top: 0,  left: 0,  w: 50,  h: 50  } },
    { id: 'q-tr',         name: 'Top Right ¼',       group: 'Quarter',       fg: { top: 0,  right: 0, w: 50,  h: 50  } },
    { id: 'q-bl',         name: 'Bottom Left ¼',     group: 'Quarter',       fg: { bot: 0,  left: 0,  w: 50,  h: 50  } },
    { id: 'q-br',         name: 'Bottom Right ¼',    group: 'Quarter',       fg: { bot: 0,  right: 0, w: 50,  h: 50  } },

    { id: 'split-l',      name: 'Left Half',         group: 'Split Screen',  fg: { top: 0,  left: 0,  w: 50,  h: 100 } },
    { id: 'split-r',      name: 'Right Half',        group: 'Split Screen',  fg: { top: 0,  right: 0, w: 50,  h: 100 } },
    { id: 'split-t',      name: 'Top Half',          group: 'Split Screen',  fg: { top: 0,  left: 0,  w: 100, h: 50  } },
    { id: 'split-b',      name: 'Bottom Half',       group: 'Split Screen',  fg: { bot: 0,  left: 0,  w: 100, h: 50  } },

    { id: 'banner-lo15',  name: 'Lower Banner 15%',  group: 'Banners',       fg: { bot: 0,  left: 0,  w: 100, h: 15  } },
    { id: 'banner-lo25',  name: 'Lower Banner 25%',  group: 'Banners',       fg: { bot: 0,  left: 0,  w: 100, h: 25  } },
    { id: 'banner-lo33',  name: 'Lower Third 33%',   group: 'Banners',       fg: { bot: 0,  left: 0,  w: 100, h: 33  } },
    { id: 'banner-hi15',  name: 'Upper Banner 15%',  group: 'Banners',       fg: { top: 0,  left: 0,  w: 100, h: 15  } },
    { id: 'banner-hi25',  name: 'Upper Banner 25%',  group: 'Banners',       fg: { top: 0,  left: 0,  w: 100, h: 25  } },

    { id: 'pip-sm-br',    name: 'PIP Small BR',      group: 'PIP Overlays',  fg: { bot: 5,  right: 5, w: 25,  h: 25  } },
    { id: 'pip-sm-bl',    name: 'PIP Small BL',      group: 'PIP Overlays',  fg: { bot: 5,  left: 5,  w: 25,  h: 25  } },
    { id: 'pip-sm-tr',    name: 'PIP Small TR',      group: 'PIP Overlays',  fg: { top: 5,  right: 5, w: 25,  h: 25  } },
    { id: 'pip-sm-tl',    name: 'PIP Small TL',      group: 'PIP Overlays',  fg: { top: 5,  left: 5,  w: 25,  h: 25  } },
    { id: 'pip-med-br',   name: 'PIP Medium BR',     group: 'PIP Overlays',  fg: { bot: 5,  right: 5, w: 35,  h: 35  } },
    { id: 'pip-med-bl',   name: 'PIP Medium BL',     group: 'PIP Overlays',  fg: { bot: 5,  left: 5,  w: 35,  h: 35  } },
    { id: 'pip-center',   name: 'Center Box 50%',    group: 'PIP Overlays',  fg: { top: 25, left: 25, w: 50,  h: 50  } },
    { id: 'pip-center-sm',name: 'Center Box 33%',    group: 'PIP Overlays',  fg: { top: 33, left: 33, w: 33,  h: 33  } },

    // Dual PIP presets — slots: array of two fg descriptors
    { id: 'dual-side-side',  name: 'Side by Side',      group: 'Dual PIP',
      slots: [
        { top: 0, left: 0,  w: 50, h: 100 },
        { top: 0, right: 0, w: 50, h: 100 }
      ] },
    { id: 'dual-corners',    name: 'Corners (TL/BR)',   group: 'Dual PIP',
      slots: [
        { top: 5,  left: 5,  w: 35, h: 35 },
        { bot: 5,  right: 5, w: 35, h: 35 }
      ] },
    { id: 'dual-pip-br-bl',  name: 'PIP BL + BR',       group: 'Dual PIP',
      slots: [
        { bot: 5,  left: 5,  w: 28, h: 28 },
        { bot: 5,  right: 5, w: 28, h: 28 }
      ] },
    { id: 'dual-banner-pip', name: 'Lower Banner + PIP', group: 'Dual PIP',
      slots: [
        { bot: 0,  left: 0,  w: 100, h: 20 },
        { top: 5,  right: 5, w: 30,  h: 35 }
      ] },
  ];

  // Returns true if preset uses dual slots
  function isDual(pip) {
    return Array.isArray(pip.slots);
  }

  // Convert a single fg descriptor to an absolute CSS style object
  function toStyle(fg) {
    if (!fg) return null;
    const s = {
      width: fg.w + '%',
      height: fg.h + '%',
      top: 'auto', left: 'auto', right: 'auto', bottom: 'auto',
    };
    if ('left'  in fg) s.left   = fg.left  + '%';
    if ('right' in fg) s.right  = fg.right + '%';
    if ('top'   in fg) s.top    = fg.top   + '%';
    if ('bot'   in fg) s.bottom = fg.bot   + '%';
    return s;
  }

  // Resolve pixel coordinates from a fg descriptor within a given canvas/container size
  function toPixels(fg, cw, ch) {
    if (!fg) return null;
    const w = fg.w / 100 * cw;
    const h = fg.h / 100 * ch;
    const x = 'left'  in fg ? fg.left  / 100 * cw : cw - (fg.right / 100 * cw) - w;
    const y = 'top'   in fg ? fg.top   / 100 * ch : ch - (fg.bot   / 100 * ch) - h;
    return { x, y, w, h };
  }

  // SVG thumbnail (60×34) showing BG area and FG overlay area(s)
  function thumbnail(pip) {
    const W = 60, H = 34;
    let fgEls = '';
    let bgLabel = `<text x="${W/2}" y="${H/2}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="5.5" fill="#3a6a9a">BG</text>`;

    if (isDual(pip)) {
      // Dual slots — draw two boxes with distinct colours
      const colours = [
        { fill: '#1a6a4a', text: '#5aeeaa', label: '1' },
        { fill: '#4a3a0a', text: '#eecc44', label: '2' },
      ];
      pip.slots.forEach((slot, i) => {
        const px = toPixels(slot, W, H);
        const c  = colours[i];
        const fs = Math.max(3.5, Math.min(6, Math.min(px.w, px.h) / 3));
        fgEls += `<rect x="${px.x.toFixed(1)}" y="${px.y.toFixed(1)}" width="${px.w.toFixed(1)}" height="${px.h.toFixed(1)}" fill="${c.fill}" rx="1.5"/>
        <text x="${(px.x + px.w / 2).toFixed(1)}" y="${(px.y + px.h / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fs}" fill="${c.text}">${c.label}</text>`;
      });
    } else if (pip.fg) {
      const fg   = pip.fg;
      const px   = toPixels(fg, W, H);
      const isFull = (fg.w === 100 && fg.h === 100);
      if (isFull) bgLabel = '';
      const fs = Math.max(3.5, Math.min(6, Math.min(px.w, px.h) / 3));
      fgEls = `<rect x="${px.x.toFixed(1)}" y="${px.y.toFixed(1)}" width="${px.w.toFixed(1)}" height="${px.h.toFixed(1)}" fill="#1a6a4a" rx="1.5"/>
        <text x="${(px.x + px.w / 2).toFixed(1)}" y="${(px.y + px.h / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fs}" fill="#5aeeaa">FG</text>`;
    }

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
      <rect width="${W}" height="${H}" fill="#102030" rx="3"/>
      ${bgLabel}
      ${fgEls}
    </svg>`;
  }

  function byId(id) {
    return PRESETS.find(p => p.id === id) || PRESETS[0];
  }

  // Returns presets grouped: { 'Basic': [...], 'Quarter': [...], ... }
  function grouped() {
    const out = {};
    PRESETS.forEach(p => {
      (out[p.group] = out[p.group] || []).push(p);
    });
    return out;
  }

  return { PRESETS, byId, grouped, toStyle, toPixels, thumbnail, isDual };
})();
