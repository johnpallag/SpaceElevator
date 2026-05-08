'use strict';

// ── Module-level state ────────────────────────────────────────────────────────
let _ctx, _canvas;
let _cableYTop, _cableYBottom;
let _stars = [];
let _time = 0; // running seconds for animations

// ── Coordinate helpers (exposed globally) ────────────────────────────────────
window.altToY = function(alt) {
  return _cableYBottom - alt * (_cableYBottom - _cableYTop);
};

window.yToAlt = function(y) {
  return (_cableYBottom - y) / (_cableYBottom - _cableYTop);
};

window.getCableX = function() {
  return _canvas.width * CONFIG.CABLE_X_RATIO;
};

// ── Init ─────────────────────────────────────────────────────────────────────
function renderInit(canvas) {
  _canvas = canvas;
  _ctx = canvas.getContext('2d');
  _ctx.imageSmoothingEnabled = false;

  _cableYTop    = CONFIG.CABLE_Y_TOP_OFFSET;
  _cableYBottom = canvas.height - CONFIG.CABLE_Y_BOTTOM_OFFSET;

  // Pre-generate stars
  _stars = [];
  for (let i = 0; i < CONFIG.STAR_COUNT; i++) {
    _stars.push({
      x: Math.random(),           // 0–1 of canvas width
      y: Math.random() * 0.78,   // top 78% of canvas height
      r: Math.random() < 0.08 ? 1.5 : 1,
      base: 0.35 + Math.random() * 0.65,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

// ── Master render call ────────────────────────────────────────────────────────
function renderFrame(dt) {
  _time += dt;
  const ctx = _ctx;
  const W = _canvas.width;
  const H = _canvas.height;
  const s = window.STATE;

  ctx.clearRect(0, 0, W, H);

  _drawBackground(ctx, W, H, s.dayTime, s.cabin.altitude);
  _drawCable(ctx, W, H, s.events);
  _drawStations(ctx, s.cabin);
  _drawParticles(ctx, s.particles, dt);
  _drawCabin(ctx, s.cabin, s.events);
  _drawEventFX(ctx, W, H, s.events, s.cabin, dt);
  _drawAltitudeMarker(ctx, W, H, s.cabin.altitude);
}

// ── Background ────────────────────────────────────────────────────────────────
function _drawBackground(ctx, W, H, dayTime, cabinAlt) {
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

  // Stars — fade out toward bottom where atmosphere thickens
  const parallax = (cabinAlt - 0.3) * 30;
  for (let i = 0; i < _stars.length; i++) {
    const st = _stars[i];
    const twinkle  = st.base * (0.75 + 0.25 * Math.sin(_time * 2.5 + st.phase));
    const skyFade  = 1 - Math.max(0, (st.y - 0.55) / 0.45);  // fade below 55% of canvas
    const nightFade = Math.max(0.08, 1 - day * 0.85);
    ctx.globalAlpha = Math.max(0, twinkle * skyFade * nightFade);
    ctx.fillStyle   = '#fff';
    const sx = ((st.x * W + parallax) % W + W) % W;
    ctx.fillRect(Math.round(sx), Math.round(st.y * H), st.r, st.r);
  }
  ctx.globalAlpha = 1;

  _drawEarth(ctx, W, H, day);
}

function _drawEarth(ctx, W, H, day) {
  // Geometry: large circle centred below the canvas.
  // arcCY is chosen so the top of the arc sits at H * (1 - visibleFrac).
  const visibleFrac = 0.22;          // fraction of screen height showing Earth surface
  const arcR  = W * 1.30;            // large radius → gentle curvature
  const arcCX = W * 0.50;
  const arcCY = H * (1 - visibleFrac) + arcR;   // arcTop = H*(1-visibleFrac) ✓

  const earthTop = H * (1 - visibleFrac);       // canvas Y where Earth surface begins

  // ── Layered atmosphere arcs (drawn before clipping, behind surface) ───────
  // Each arc is a wide stroke ring just outside the Earth disc.
  const atmoLayers = [
    { dr: 52, lw: 38, alpha: 0.045 + day * 0.045, h: 200 },
    { dr: 32, lw: 24, alpha: 0.08  + day * 0.07,  h: 205 },
    { dr: 17, lw: 14, alpha: 0.13  + day * 0.10,  h: 210 },
    { dr:  8, lw:  9, alpha: 0.22  + day * 0.16,  h: 215 },
    { dr:  3, lw:  5, alpha: 0.38  + day * 0.22,  h: 195 },
    { dr:  1, lw:  2, alpha: 0.65  + day * 0.20,  h: 185 },
  ];
  ctx.save();
  for (const L of atmoLayers) {
    ctx.beginPath();
    ctx.arc(arcCX, arcCY, arcR + L.dr, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${L.h},90%,${60 + day * 25}%,${L.alpha})`;
    ctx.lineWidth   = L.lw;
    ctx.stroke();
  }
  ctx.restore();

  // ── Earth surface (clipped to disc) ───────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(arcCX, arcCY, arcR, 0, Math.PI * 2);
  ctx.clip();

  // Ocean — linear gradient within the visible strip
  const oGrad = ctx.createLinearGradient(0, earthTop, 0, H);
  oGrad.addColorStop(0.0, `hsl(210,${70 + day*15}%,${22 + day*20}%)`);  // horizon
  oGrad.addColorStop(0.5, `hsl(215,${75 + day*12}%,${16 + day*15}%)`);
  oGrad.addColorStop(1.0, `hsl(220,${80 + day*10}%,${10 + day*10}%)`);  // deep
  ctx.fillStyle = oGrad;
  ctx.fillRect(0, earthTop, W, H - earthTop + 2);

  // Night-side darkening
  if (day < 0.7) {
    ctx.fillStyle = `rgba(0,0,18,${(0.7 - day) * 0.72})`;
    ctx.fillRect(0, earthTop, W, H - earthTop + 2);
  }

  // Land patches — placed in the visible strip using canvas coords
  const landG = Math.floor(72 + day * 52);
  const landR = Math.floor(22 + day * 22);
  // [cx_frac, cy_frac_of_visibleStrip, radius_px]
  const patches = [
    [0.10, 0.55, W * 0.055],
    [0.24, 0.35, W * 0.040],
    [0.38, 0.70, W * 0.060],
    [0.52, 0.42, W * 0.038],
    [0.63, 0.68, W * 0.050],
    [0.77, 0.38, W * 0.042],
    [0.88, 0.60, W * 0.035],
    [0.18, 0.82, W * 0.030],
  ];
  const stripH = H - earthTop;
  for (const [fx, fy, r] of patches) {
    ctx.fillStyle = `rgb(${landR},${landG},${Math.floor(landG * 0.28)})`;
    ctx.beginPath();
    ctx.arc(fx * W, earthTop + fy * stripH, r, 0, Math.PI * 2);
    ctx.fill();
    // Lighter highlight edge (sun-lit side)
    if (day > 0.3) {
      ctx.fillStyle = `rgba(${landR+30},${landG+30},${Math.floor(landG*0.28+20)},${day * 0.4})`;
      ctx.beginPath();
      ctx.arc(fx * W - r * 0.2, earthTop + fy * stripH - r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cloud wisps — soft white ellipses
  ctx.fillStyle = `rgba(255,255,255,${0.07 + day * 0.07})`;
  const clouds = [
    [0.15, 0.25, W*0.09, W*0.022],
    [0.42, 0.52, W*0.11, W*0.020],
    [0.65, 0.38, W*0.08, W*0.018],
    [0.30, 0.78, W*0.10, W*0.021],
    [0.80, 0.62, W*0.07, W*0.019],
  ];
  for (const [fx, fy, rx, ry] of clouds) {
    ctx.beginPath();
    ctx.ellipse(fx * W, earthTop + fy * stripH, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // City lights on night side
  if (day < 0.45) {
    const lightAlpha = (0.45 - day) * 0.7;
    // Deterministic "random" positions via golden-ratio spacing
    for (let i = 0; i < 16; i++) {
      const lx = ((i * 0.6180339887) % 1) * W;
      const ly = earthTop + ((i * 0.3819660113) % 1) * stripH;
      ctx.fillStyle = `rgba(255,220,120,${lightAlpha * (0.4 + (i % 3) * 0.3)})`;
      ctx.fillRect(Math.round(lx), Math.round(ly), 2, 2);
    }
  }

  ctx.restore();  // remove clip

  // ── Bright limb / horizon line ────────────────────────────────────────────
  // A thin bright arc right at the Earth edge to separate it from the sky
  ctx.save();
  ctx.beginPath();
  ctx.arc(arcCX, arcCY, arcR + 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(120,200,255,${0.35 + day * 0.30})`;
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

    // Label
    ctx.fillStyle  = atStation ? '#0ff' : '#6af';
    ctx.font       = '8px Courier New';
    ctx.textAlign  = 'center';
    ctx.fillText(st.label, cx, by - 4);

    // Altitude
    ctx.fillStyle = '#336';
    ctx.font      = '7px Courier New';
    ctx.fillText(st.km >= 1000 ? Math.round(st.km / 100) / 10 + 'k km' : st.km + ' km', cx, by + bH + 9);
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
      const cabinY = altToY(cabin.altitude);
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (const dot of ev.dots) {
        // Update dot positions
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
      ctx.fillText('⚠ DEBRIS FIELD', getCableX(), altToY(cabin.altitude) - 30);
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
  const cy = altToY(alt);
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
