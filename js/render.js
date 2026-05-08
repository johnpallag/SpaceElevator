'use strict';

// ── Module-level state ────────────────────────────────────────────────────────
let _ctx, _canvas;
let _cableYTop, _cableYBottom;
let _stars = [];
let _time = 0;

// Planet texture (generated once at startup)
const _TEX_W = 512, _TEX_H = 256;
let _texCanvas = null;
let _perm = new Uint8Array(512);

// Zoom (vertical only — horizontal pivot stays fixed at cable X)
let _zoom = 1.0, _targetZoom = 1.0;
let _zoomCY = 0;
let _worldYAnchor = 0, _anchorScreenY = 0;  // world point pinned to screen Y during zoom
let _tracking = true;

function renderSetZoom(deltaY) {
  _targetZoom = Math.max(0.35, Math.min(5.0, _targetZoom * Math.pow(0.999, deltaY)));
}

window.renderSetZoomCenter = function(_x, cy) {
  // Record the world Y currently under the cursor — this stays fixed as zoom animates.
  _worldYAnchor = (cy - _zoomCY) / _zoom + _zoomCY;
  _anchorScreenY = cy;
  _tracking = false;
};

window.renderPan = function(dy) {
  if (_tracking) {
    // Initialise anchor at current pivot so the scene doesn't jump on first pan.
    _worldYAnchor  = _zoomCY;
    _anchorScreenY = _zoomCY;
    _tracking = false;
  }
  _anchorScreenY += dy;
};

window.renderToggleTracking = function() {
  _tracking = !_tracking;
  return _tracking;
};

window.getZoom      = function() { return _zoom; };
window.screenYToAlt = function(screenY) {
  const worldY = (screenY - _zoomCY) / _zoom + _zoomCY;
  return yToAlt(worldY);
};

// ── Value noise ───────────────────────────────────────────────────────────────
function _initNoise() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 256; i++) _perm[i] = _perm[i + 256] = p[i];
}

function _vnoise(x, y) {
  const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x),   yf = y - Math.floor(y);
  const u  = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const aa = _perm[(_perm[xi    ] + yi    ) & 255];
  const ba = _perm[(_perm[xi + 1] + yi    ) & 255];
  const ab = _perm[(_perm[xi    ] + yi + 1) & 255];
  const bb = _perm[(_perm[xi + 1] + yi + 1) & 255];
  return (aa*(1-u)*(1-v) + ba*u*(1-v) + ab*(1-u)*v + bb*u*v) / 255;
}

function _fbm(x, y, oct) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += _vnoise(x * f, y * f) * amp;
    tot += amp; amp *= 0.5; f *= 2.1;
  }
  return v / tot;
}

// ── Planet texture generation (once at startup) ───────────────────────────────
function _generatePlanetTexture() {
  _texCanvas = document.createElement('canvas');
  _texCanvas.width = _TEX_W; _texCanvas.height = _TEX_H;
  const tc  = _texCanvas.getContext('2d');
  const img = tc.createImageData(_TEX_W, _TEX_H);
  const d   = img.data;

  for (let ty = 0; ty < _TEX_H; ty++) {
    for (let tx = 0; tx < _TEX_W; tx++) {
      const nx = tx / _TEX_W, ny = ty / _TEX_H;

      // Continent mask (large blobs, offset so seam at edge is oceanic)
      const cont = _fbm(nx * 2.8 + 7.3, ny * 2.8 + 3.1, 4);
      // Fine terrain detail
      const det  = _fbm(nx * 9.0 + 1.7, ny * 9.0 + 5.5, 4) * 0.28;
      let h = Math.pow(cont, 0.85) * 0.72 + det;

      // Polar ice caps: blend to white near top/bottom of texture
      const latFrac = Math.abs(ny - 0.5) * 2;        // 0=equator, 1=pole
      const ice     = Math.max(0, (latFrac - 0.72) * 3.6);
      h = h * (1 - ice) + ice;

      let r, g, b;
      if      (h < 0.38) { r=0;              g=Math.floor(30+h*105); b=Math.floor(75+h*125); }  // deep ocean
      else if (h < 0.46) { r=0;              g=Math.floor(70+h*55);  b=Math.floor(125+h*62); }  // shallow
      else if (h < 0.51) { const t=(h-0.46)/0.05; r=Math.floor(155+t*35); g=Math.floor(140+t*20); b=Math.floor(85+t*10); } // sand
      else if (h < 0.67) { const t=(h-0.51)/0.16; r=Math.floor(26+t*20);  g=Math.floor(85+t*44); b=Math.floor(18+t*12); } // lowland
      else if (h < 0.80) { const t=(h-0.67)/0.13; r=Math.floor(46+t*38);  g=Math.floor(72+t*24); b=Math.floor(28+t*22); } // highland
      else if (h < 0.91) { const t=(h-0.80)/0.11; r=Math.floor(84+t*72);  g=Math.floor(77+t*65); b=Math.floor(62+t*54); } // rocky
      else               { const t=(h-0.91)/0.09;  r=Math.floor(208+t*47); g=Math.floor(218+t*37); b=Math.floor(230+t*25); } // snow/ice

      const i = (ty * _TEX_W + tx) * 4;
      d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255;
    }
  }
  tc.putImageData(img, 0, 0);
}

// ── Coordinate helpers (exposed globally) ────────────────────────────────────
window.altToY = function(alt) {
  return _cableYBottom - alt * (_cableYBottom - _cableYTop);
};

window.yToAlt = function(y) {
  return (_cableYBottom - y) / (_cableYBottom - _cableYTop);
};

window.getCableX = function() {
  return CONFIG.SIDEBAR_WIDTH + (_canvas.width - CONFIG.SIDEBAR_WIDTH) * 0.5;
};

// ── Init ─────────────────────────────────────────────────────────────────────
function renderInit(canvas) {
  _canvas = canvas;
  _ctx = canvas.getContext('2d');
  _ctx.imageSmoothingEnabled = false;

  _cableYTop    = CONFIG.CABLE_Y_TOP_OFFSET;
  _cableYBottom = canvas.height - CONFIG.CABLE_Y_BOTTOM_OFFSET;

  _zoomCY = _cableYBottom;
  _worldYAnchor = _anchorScreenY = _cableYBottom;

  // Stars (re-generated on resize; cheap)
  _stars = [];
  for (let i = 0; i < CONFIG.STAR_COUNT; i++) {
    _stars.push({
      x:     Math.random(),
      y:     Math.random() * 0.78,
      r:     Math.random() < 0.08 ? 1.5 : 1,
      base:  0.35 + Math.random() * 0.65,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // Planet texture: generate only once (seeded noise → stable map)
  if (!_texCanvas) {
    _initNoise();
    _generatePlanetTexture();
  }
}

// ── Master render call ────────────────────────────────────────────────────────
function renderFrame(dt) {
  _time += dt;
  _zoom += (_targetZoom - _zoom) * Math.min(1, dt * 9);

  const ctx = _ctx;
  const W = _canvas.width;
  const H = _canvas.height;
  const s = window.STATE;

  ctx.clearRect(0, 0, W, H);

  const cableX = getCableX();
  const cabinScreenY = altToY(s.cabin.altitude);

  if (_tracking) {
    // Follow cabin with smooth lerp
    _zoomCY += (cabinScreenY - _zoomCY) * Math.min(1, dt * 9);
  } else {
    // Derive pivot analytically so _worldYAnchor stays at _anchorScreenY for any _zoom.
    // Invariant: worldY * zoom + zoomCY * (1 - zoom) = anchorScreenY
    if (Math.abs(_zoom - 1) > 1e-4) {
      _zoomCY = (_anchorScreenY - _worldYAnchor * _zoom) / (1 - _zoom);
    }
  }

  // Star parallax: zoom-centre offset from screen centre
  const parallaxY = (_zoomCY - H * 0.5) * (_zoom - 1);

  // Where does Earth Base (alt=0, world-Y=_cableYBottom) land after vertical zoom?
  const earthBaseScreenY = (_cableYBottom - _zoomCY) * _zoom + _zoomCY;

  _drawBackground(ctx, W, H, s.dayTime, s.cabin.altitude, parallaxY, earthBaseScreenY);

  // Zoom around (cableX, _zoomCY): vertical position follows cursor/cabin,
  // horizontal pivot stays on the cable so nothing drifts sideways.
  ctx.save();
  ctx.translate(cableX, _zoomCY);
  ctx.scale(_zoom, _zoom);
  ctx.translate(-cableX, -_zoomCY);
  _drawCable(ctx, W, H, s.events);
  _drawStations(ctx, s.cabin);
  _drawParticles(ctx, s.particles, dt);
  _drawCabin(ctx, s.cabin, s.events);
  ctx.restore();

  // Event FX and HUD are screen-space — no zoom applied
  _drawEventFX(ctx, W, H, s.events, s.cabin, dt);
  _drawAltitudeMarker(ctx, W, H, s.cabin.altitude);
}

// ── Background ────────────────────────────────────────────────────────────────
function _drawBackground(ctx, W, H, dayTime, cabinAlt, parallaxY, earthBaseScreenY) {
  // day: 0 = midnight, 1 = noon
  const day = 0.5 + 0.5 * Math.cos(dayTime * Math.PI * 2);

  // Space-to-upper-atmosphere gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#000004');
  grad.addColorStop(0.42, `rgb(0,2,${Math.floor(10 + day * 6)})`);
  grad.addColorStop(0.68, `rgb(${Math.floor(1+day*8)},${Math.floor(4+day*18)},${Math.floor(22+day*32)})`);
  grad.addColorStop(0.82, `rgb(${Math.floor(2+day*16)},${Math.floor(12+day*52)},${Math.floor(55+day*72)})`);
  grad.addColorStop(1.00, `rgb(${Math.floor(6+day*28)},${Math.floor(30+day*88)},${Math.floor(90+day*95)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars — slowly rotate; shift slightly with parallax (they're very far away)
  const starAngle = _time * 0.000055 * Math.PI * 2;
  const rotCX = W * 0.5, rotCY = H * 0.32;
  ctx.save();
  ctx.translate(0, parallaxY * 0.03);   // depth: barely moves
  ctx.translate(rotCX, rotCY);
  ctx.rotate(starAngle);
  ctx.translate(-rotCX, -rotCY);
  for (let i = 0; i < _stars.length; i++) {
    const st = _stars[i];
    const twinkle   = st.base * (0.75 + 0.25 * Math.sin(_time * 2.5 + st.phase));
    const skyFade   = 1 - Math.max(0, (st.y - 0.55) / 0.45);
    const nightFade = Math.max(0.08, 1 - day * 0.85);
    ctx.globalAlpha = Math.max(0, twinkle * skyFade * nightFade);
    ctx.fillStyle   = '#fff';
    ctx.fillRect(Math.round(st.x * W), Math.round(st.y * H), st.r, st.r);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  _drawEarth(ctx, W, H, day, earthBaseScreenY);
}

function _drawEarth(ctx, W, H, day, earthBaseScreenY) {
  // ── Geometry ──────────────────────────────────────────────────────────────
  const arcR      = W * 1.30 * _zoom;
  const arcCX     = W * 0.50;
  // Arc centre sits arcR below the Earth Base station's zoomed screen position,
  // so the arc top (arcCYsurf - arcR) always coincides with where the cable ends.
  const arcCYsurf = earthBaseScreenY + arcR;
  const arcCYatmo = arcCYsurf;   // atmosphere uses same centre, larger radii
  const earthTop  = earthBaseScreenY;
  const stripH    = H - earthTop;
  const cloudShift = 0;

  // ── Layered atmosphere arcs ───────────────────────────────────────────────
  ctx.save();
  const atmoLayers = [
    { dr: 52, lw: 38, alpha: 0.04  + day * 0.04, hue: 200 },
    { dr: 32, lw: 24, alpha: 0.08  + day * 0.07, hue: 205 },
    { dr: 17, lw: 14, alpha: 0.13  + day * 0.10, hue: 210 },
    { dr:  8, lw:  9, alpha: 0.22  + day * 0.16, hue: 215 },
    { dr:  3, lw:  5, alpha: 0.38  + day * 0.22, hue: 195 },
    { dr:  1, lw:  2, alpha: 0.62  + day * 0.20, hue: 185 },
  ];
  for (const L of atmoLayers) {
    ctx.beginPath();
    ctx.arc(arcCX, arcCYatmo, arcR + L.dr, 0, Math.PI * 2);  // atmosphere depth
    ctx.strokeStyle = `hsla(${L.hue},90%,${60 + day*25}%,${L.alpha})`;
    ctx.lineWidth   = L.lw;
    ctx.stroke();
  }
  ctx.restore();

  // ── Surface: procedural texture via per-scanline drawImage ────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(arcCX, arcCYsurf, arcR, 0, Math.PI * 2);  // surface depth
  ctx.clip();

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';

  // Earth surface is fixed — no longitudinal rotation
  for (let cy = Math.ceil(earthTop); cy < H; cy++) {
    const dyUp = arcCYsurf - cy;
    const chord = Math.sqrt(Math.max(0, arcR * arcR - dyUp * dyUp));
    if (chord < 1) continue;

    const x0 = arcCX - chord;
    const cw = chord * 2;

    // Equirectangular latitude → texture row
    const sinLat = Math.min(1, dyUp / arcR);
    const ty = Math.max(0, Math.min(_TEX_H - 1,
      Math.floor((0.5 - Math.asin(sinLat) / Math.PI) * _TEX_H * 2.8)
    ));

    ctx.drawImage(_texCanvas, 0, ty, _TEX_W, 1, x0, cy, cw, 1);
  }

  ctx.imageSmoothingEnabled = false;

  // ── Night-side darkening ──────────────────────────────────────────────────
  if (day < 0.85) {
    const alpha = (0.85 - day) * 0.75;
    ctx.fillStyle = `rgba(0,0,15,${alpha})`;
    ctx.fillRect(0, earthTop, W, stripH + 2);
  }

  // ── City lights (visible on dark side) ────────────────────────────────────
  if (day < 0.40) {
    const la = (0.40 - day) * 0.9;
    for (let i = 0; i < 20; i++) {
      const lx = ((i * 0.6180339887) % 1) * W;
      const ly = earthTop + ((i * 0.3819660113) % 1) * stripH;
      ctx.fillStyle = `rgba(255,215,100,${la * (0.35 + (i % 3) * 0.32)})`;
      ctx.fillRect(Math.round(lx), Math.round(ly), 2, 2);
    }
  }

  // ── Cloud layer — drift slowly westward over time ─────────────────────────
  const cloudRot = (_time * 4.5) % W;  // full traverse in ~5.5 min
  const clouds = [
    [0.12, 0.22, W*0.095, W*0.024],
    [0.38, 0.50, W*0.115, W*0.022],
    [0.58, 0.35, W*0.085, W*0.019],
    [0.27, 0.75, W*0.100, W*0.023],
    [0.72, 0.60, W*0.075, W*0.020],
    [0.88, 0.30, W*0.068, W*0.018],
    [0.50, 0.82, W*0.090, W*0.021],
  ];
  ctx.fillStyle = `rgba(255,255,255,${0.055 + day * 0.065})`;
  for (const [fx, fy, rx, ry] of clouds) {
    const cx2 = ((fx * W + cloudRot) % W + W) % W;
    const cy2 = earthTop + fy * stripH + cloudShift;  // clouds at their own depth
    ctx.beginPath();
    ctx.ellipse(cx2, cy2, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    if (cx2 + rx > W) { ctx.beginPath(); ctx.ellipse(cx2 - W, cy2, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
    if (cx2 - rx < 0) { ctx.beginPath(); ctx.ellipse(cx2 + W, cy2, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  ctx.restore();

  // ── Horizon limb line ─────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(arcCX, arcCYsurf, arcR + 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(130,210,255,${0.32 + day * 0.32})`;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();
}

// ── Cable ─────────────────────────────────────────────────────────────────────
function _drawCable(ctx, W, H, events) {
  const cx = getCableX();
  const osc = events.find(e => e.type === 'OSCILLATION');

  ctx.save();
  ctx.lineWidth = 2;

  if (osc) {
    // Wavy cable during oscillation
    const progress = osc.elapsed / osc.duration;
    const amp = Math.sin(progress * Math.PI) * 10; // peaks mid-event
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#08f';
    ctx.strokeStyle = '#5af';
    ctx.beginPath();
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const t   = i / steps;
      const y   = _cableYTop + t * (_cableYBottom - _cableYTop);
      const x   = cx + Math.sin(t * Math.PI * 4 + _time * 6) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    // Normal straight cable with glow
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#0af';
    ctx.strokeStyle = '#4af';
    ctx.beginPath();
    ctx.moveTo(cx, _cableYTop);
    ctx.lineTo(cx, _cableYBottom);
    ctx.stroke();
  }

  // Second pass, thin bright core
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(180,230,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, _cableYTop);
  ctx.lineTo(cx, _cableYBottom);
  ctx.stroke();

  ctx.restore();
}

// ── Stations ──────────────────────────────────────────────────────────────────
function _drawStations(ctx, cabin) {
  const bW = CONFIG.STATION_BOX_W;
  const bH = CONFIG.STATION_BOX_H;
  const cx = getCableX();

  for (const st of CONFIG.STATIONS) {
    const y  = altToY(st.alt);
    const bx = cx - bW / 2;
    const by = y  - bH / 2;

    const atStation = Math.abs(cabin.altitude - st.alt) < 0.012;

    // Box background
    ctx.fillStyle = atStation ? '#0a2a4a' : '#060e1a';
    ctx.fillRect(bx, by, bW, bH);

    // Box border (highlight if cabin here or headed here)
    const isDestination = cabin.destination === st.id;
    ctx.strokeStyle = atStation ? '#0cf' : isDestination ? '#ff0' : '#2a5a8c';
    ctx.lineWidth   = atStation ? 2 : 1;
    ctx.strokeRect(bx, by, bW, bH);

    // Glow when active
    if (atStation) {
      ctx.save();
      ctx.shadowBlur  = 10;
      ctx.shadowColor = '#0cf';
      ctx.strokeStyle = '#0cf';
      ctx.lineWidth   = 1;
      ctx.strokeRect(bx, by, bW, bH);
      ctx.restore();
    }

    // Label + altitude, right-aligned to the left of the box
    ctx.textAlign = 'right';
    ctx.fillStyle = atStation ? '#0ff' : '#6af';
    ctx.font      = '8px Courier New';
    ctx.fillText(st.label, bx - 4, y - 2);

    ctx.fillStyle = '#336';
    ctx.font      = '7px Courier New';
    ctx.fillText(st.km >= 1000 ? Math.round(st.km / 100) / 10 + 'k km' : st.km + ' km', bx - 4, y + 7);
  }

  ctx.textAlign = 'left';
}

// ── Cabin ─────────────────────────────────────────────────────────────────────
function _drawCabin(ctx, cabin, events) {
  const cx = getCableX();
  const cy = altToY(cabin.altitude);
  const w  = 16;
  const h  = 22;
  const bx = cx - w / 2;
  const by = cy - h / 2;

  const osc = events.find(e => e.type === 'OSCILLATION');
  // Shake during oscillation
  const shakeX = osc ? (Math.random() - 0.5) * 3 : 0;
  const shakeY = osc ? (Math.random() - 0.5) * 2 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Glow
  ctx.shadowBlur  = 12;
  ctx.shadowColor = '#8af';

  // Main body
  ctx.fillStyle = '#1a3a6a';
  ctx.fillRect(bx, by, w, h);

  // Pixel detail – horizontal lines
  ctx.fillStyle = '#2a5aaa';
  ctx.fillRect(bx + 2, by + 3,  w - 4, 2);
  ctx.fillRect(bx + 2, by + 8,  w - 4, 2);
  ctx.fillRect(bx + 2, by + 13, w - 4, 2);

  // Cargo icons inside cabin
  const cargoColors = { CARGO: '#f80', PASSENGER: '#0cf', FUEL: '#0f8', VIP: '#f0f' };
  for (let i = 0; i < cabin.cargo.length; i++) {
    const del = STATE.activeDeliveries.find(d => d.id === cabin.cargo[i]);
    if (del) {
      ctx.fillStyle = cargoColors[del.type] || '#888';
      ctx.fillRect(bx + 3 + i * 5, by + h - 7, 4, 4);
    }
  }

  // Border
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = '#8af';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, w, h);

  // Bright top edge
  ctx.strokeStyle = '#cdf';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(bx + 1, by + 1);
  ctx.lineTo(bx + w - 1, by + 1);
  ctx.stroke();

  ctx.restore();
}

// ── Particles ─────────────────────────────────────────────────────────────────
function _drawParticles(ctx, particles, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;

    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function spawnThrusterParticles(cabin) {
  if (Math.abs(cabin.speed) < 0.001) return;
  if (STATE.particles.length >= CONFIG.PARTICLE_MAX) return;

  const cx  = getCableX();
  const cy  = altToY(cabin.altitude);
  const dir = cabin.speed > 0 ? 1 : -1; // 1=ascending, particles below; -1=descending, above

  const count = 2;
  for (let i = 0; i < count; i++) {
    STATE.particles.push({
      x: cx + (Math.random() - 0.5) * 8,
      y: cy + dir * 12 + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 20,
      vy: dir * (15 + Math.random() * 25),
      gravity: dir * 20,
      life: 0.25 + Math.random() * 0.25,
      maxLife: 0.5,
      size: 2,
      color: Math.random() < 0.5 ? '#0af' : '#8df',
    });
  }
}

function spawnCreditParticles(x, y, amount) {
  const count = Math.min(8, Math.floor(amount / 80));
  for (let i = 0; i < count; i++) {
    STATE.particles.push({
      x: x + (Math.random() - 0.5) * 30,
      y: y,
      vx: (Math.random() - 0.5) * 40,
      vy: -(30 + Math.random() * 50),
      gravity: 20,
      life: 0.8 + Math.random() * 0.4,
      maxLife: 1.2,
      size: 2,
      color: '#ff0',
    });
  }
}

// ── Event FX ──────────────────────────────────────────────────────────────────
function _drawEventFX(ctx, W, H, events, cabin, dt) {
  for (const ev of events) {
    const progress = ev.elapsed / ev.duration;

    if (ev.type === 'DEBRIS') {
      const cabinX = getCableX();
      const cabinWorldY = altToY(cabin.altitude);
      const cabinY = (cabinWorldY - _zoomCY) * _zoom + _zoomCY;
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (const dot of ev.dots) {
        dot.x += dot.vx * dt;
        dot.y += dot.vy * dt;
        ctx.fillStyle = dot.color;
        ctx.fillRect(Math.round(cabinX + dot.ox + dot.x), Math.round(cabinY + dot.oy + dot.y), dot.r, dot.r);
      }
      ctx.restore();

      // Warning text
      const flashAlpha = 0.5 + 0.5 * Math.sin(_time * 8);
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle   = '#f80';
      ctx.font        = 'bold 10px Courier New';
      ctx.textAlign   = 'center';
      ctx.fillText('⚠ DEBRIS FIELD', cabinX, cabinY - 30);
      ctx.textAlign   = 'left';
      ctx.globalAlpha = 1;
    }

    if (ev.type === 'SOLAR') {
      const fade = Math.sin(progress * Math.PI);
      ctx.fillStyle = `rgba(255,140,0,${fade * 0.12})`;
      ctx.fillRect(0, 0, W, H);

      // Solar flare effect on left side
      ctx.globalAlpha = fade * 0.4;
      const flareGrad = ctx.createRadialGradient(-50, H * 0.3, 0, -50, H * 0.3, W * 0.5);
      flareGrad.addColorStop(0, 'rgba(255,200,50,0.8)');
      flareGrad.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = flareGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      // Label
      const lAlpha = 0.6 + 0.4 * Math.sin(_time * 6);
      ctx.globalAlpha = lAlpha;
      ctx.fillStyle   = '#f80';
      ctx.font        = 'bold 10px Courier New';
      ctx.textAlign   = 'center';
      ctx.fillText('☀ SOLAR STORM', getCableX(), 30);
      ctx.textAlign   = 'left';
      ctx.globalAlpha = 1;
    }
  }
}

// ── Altitude marker (right of cable) ─────────────────────────────────────────
function _drawAltitudeMarker(ctx, W, H, alt) {
  const cx = getCableX();
  const worldY = altToY(alt);
  const cy = (worldY - _zoomCY) * _zoom + _zoomCY;
  const km = Math.round(alt * 100000);
  const label = km >= 1000 ? (km / 1000).toFixed(0) + 'k' : km + '';

  ctx.fillStyle  = 'rgba(0,180,255,0.7)';
  ctx.font       = '9px Courier New';
  ctx.textAlign  = 'left';
  ctx.fillText(label + ' km', cx + 22, cy + 3);

  // Tick mark
  ctx.strokeStyle = 'rgba(0,180,255,0.5)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 14, cy);
  ctx.lineTo(cx + 20, cy);
  ctx.stroke();
}
