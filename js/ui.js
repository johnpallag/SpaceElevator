'use strict';

let _uiCanvas;

// Drag-pan state (mouse)
let _dragStartY = null;
let _dragLastY  = null;
let _didDrag    = false;

// Touch state
let _touchStartY    = 0;
let _touchLastY     = 0;
let _lastPinchDist  = null;
let _touchIsPinch   = false;

function uiInit(canvas) {
  _uiCanvas = canvas;
  canvas.addEventListener('click', _handleCanvasClick);
  canvas.addEventListener('mousemove', _handleCanvasHover);
  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    const rect = _uiCanvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (_uiCanvas.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (_uiCanvas.height / rect.height);
    renderSetZoomCenter(cx, cy);
    renderSetZoom(e.deltaY);
  }, { passive: false });

  // ── Mouse drag ──────────────────────────────────────────
  canvas.addEventListener('mousedown', function(e) {
    _dragStartY = e.clientY;
    _dragLastY  = e.clientY;
    _didDrag    = false;
  });

  window.addEventListener('mousemove', function(e) {
    if (_dragLastY === null) return;
    if (Math.abs(e.clientY - _dragStartY) > 4) _didDrag = true;
    if (_didDrag) {
      const rect   = _uiCanvas.getBoundingClientRect();
      const scaleY = _uiCanvas.height / rect.height;
      renderPan((e.clientY - _dragLastY) * scaleY);
      _uiCanvas.style.cursor = 'grabbing';
    }
    _dragLastY = e.clientY;
  });

  window.addEventListener('mouseup', function() {
    if (_didDrag) _uiCanvas.style.cursor = 'default';
    _dragLastY  = null;
    _dragStartY = null;
  });

  // ── Touch: pinch-zoom + drag-pan + tap-to-select ────────
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    _touchIsPinch = e.touches.length >= 2;
    if (e.touches.length === 1) {
      _touchStartY = _touchLastY = e.touches[0].clientY;
      _dragStartY  = _touchLastY;
      _didDrag     = false;
      _lastPinchDist = null;
    } else if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      _lastPinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (e.touches.length >= 2) {
      // Pinch to zoom
      const t0   = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (_lastPinchDist !== null) {
        const rect = _uiCanvas.getBoundingClientRect();
        const cx   = ((t0.clientX + t1.clientX) / 2 - rect.left) * (_uiCanvas.width  / rect.width);
        const cy   = ((t0.clientY + t1.clientY) / 2 - rect.top)  * (_uiCanvas.height / rect.height);
        renderSetZoomCenter(cx, cy);
        renderSetZoom((_lastPinchDist - dist) * 4);
      }
      _lastPinchDist = dist;
      _touchIsPinch  = true;
    } else if (e.touches.length === 1 && !_touchIsPinch) {
      // Single-finger drag to pan
      const clientY = e.touches[0].clientY;
      if (Math.abs(clientY - _touchStartY) > 4) _didDrag = true;
      if (_didDrag) {
        const rect   = _uiCanvas.getBoundingClientRect();
        renderPan((clientY - _touchLastY) * (_uiCanvas.height / rect.height));
      }
      _touchLastY = clientY;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    // Tap (no drag, no pinch) → station select
    if (!_didDrag && !_touchIsPinch && e.changedTouches.length === 1) {
      const t    = e.changedTouches[0];
      const rect = _uiCanvas.getBoundingClientRect();
      _handleStationSelect(
        (t.clientX - rect.left) * (_uiCanvas.width  / rect.width),
        (t.clientY - rect.top)  * (_uiCanvas.height / rect.height)
      );
    }
    if (e.touches.length < 2) _lastPinchDist = null;
    if (e.touches.length === 0) { _touchIsPinch = false; _didDrag = false; }
  }, { passive: false });

  uiRenderSidebar();
}

// ── Per-frame meter updates (fast path) ───────────────────────────────────────
function uiUpdateMeters() {
  const s = STATE;

  // Power bar
  const pwrFill = document.getElementById('power-bar-fill');
  const pwrPct  = document.getElementById('power-pct');
  if (pwrFill) {
    pwrFill.style.width = s.power + '%';
    pwrFill.className   = 'bar-fill power'
      + (s.power < 20 ? ' critical' : s.power < 40 ? ' low' : '');
    pwrPct.textContent  = Math.round(s.power) + '%';
  }

  // Integrity bar
  const intFill = document.getElementById('integrity-bar-fill');
  const intPct  = document.getElementById('integrity-pct');
  if (intFill) {
    intFill.style.width = s.cableIntegrity + '%';
    intFill.className   = 'bar-fill integrity'
      + (s.cableIntegrity < 25 ? ' critical' : s.cableIntegrity < 50 ? ' low' : '');
    intPct.textContent  = Math.round(s.cableIntegrity) + '%';
  }

  // Credits
  const credEl = document.getElementById('credits-display');
  if (credEl) credEl.textContent = 'CR: ' + Math.floor(s.credits).toLocaleString();

  // Altitude
  const altEl = document.getElementById('altitude-display');
  if (altEl) {
    const km = Math.round(s.cabin.altitude * 100000);
    altEl.textContent = 'ALT: ' + (km >= 1000 ? (km / 1000).toFixed(1) + 'k' : km) + ' km';
  }
}

// ── Full sidebar rebuild (called on state change) ─────────────────────────────
function uiRenderSidebar() {
  _renderActiveDeliveries();
  _renderRequestQueue();
  _renderEventLog();
}

function _renderActiveDeliveries() {
  const el = document.getElementById('active-deliveries');
  if (!el) return;

  const deliveries = STATE.activeDeliveries;
  if (deliveries.length === 0) {
    el.innerHTML = '<div class="section-title">-- ACTIVE --</div><div class="empty-msg">No active deliveries</div>';
    return;
  }

  let html = '<div class="section-title">-- ACTIVE --</div>';
  for (const d of deliveries) {
    const cfg     = CONFIG.REQUEST_TYPES[d.type];
    const tr      = Math.ceil(d.timeRemaining);
    const phase   = d.phase === 'pickup' ? 'GO PICKUP' : 'IN TRANSIT';
    const urgClass = tr < 20 ? 'urgent' : tr < 60 ? 'warn' : 'ok';

    html += `
      <div class="delivery-card">
        <span class="req-type" style="color:${cfg.color}">[${cfg.label}]</span>
        <span class="req-route"> ${_stShort(d.from)}→${_stShort(d.to)}</span><br>
        <span class="delivery-status">${phase}</span>
        <span class="req-deadline ${urgClass}"> ${tr > 0 ? tr + 's' : 'OVERDUE'}</span>
      </div>`;
  }
  el.innerHTML = html;
}

function _renderRequestQueue() {
  const el = document.getElementById('request-queue');
  if (!el) return;

  const queue   = STATE.requestQueue;
  const full    = STATE.cabin.cargo.length >= STATE.cabin.capacity;
  const destSet = !!STATE.cabin.destination;

  if (queue.length === 0) {
    el.innerHTML = '<div class="section-title">-- REQUESTS --</div><div class="empty-msg">Awaiting requests...</div>';
    return;
  }

  let html = '<div class="section-title">-- REQUESTS --</div>';
  for (const r of queue) {
    const cfg     = CONFIG.REQUEST_TYPES[r.type];
    const tr      = Math.ceil(r.timeRemaining);
    const urgClass = tr < 30 ? 'urgent' : tr < 80 ? 'warn' : 'ok';
    const urgent   = tr < 30 ? ' urgent' : '';

    html += `
      <div class="req-card${urgent}" style="border-color:${cfg.color}40">
        <span class="req-type" style="color:${cfg.color}">[${cfg.label}]</span>
        <span class="req-route"> ${_stShort(r.from)} → ${_stShort(r.to)}</span><br>
        <span class="req-meta">+${r.reward}CR</span>
        <span class="req-deadline ${urgClass}"> ${tr}s</span>
        <div class="req-buttons">
          <button class="btn-acc" ${full ? 'disabled title="Cabin full"' : ''} onclick="requestAccept(${r.id})">ACC</button>
          <button class="btn-rej" onclick="requestReject(${r.id})">REJ</button>
        </div>
      </div>`;
  }
  el.innerHTML = html;
}

function _renderEventLog() {
  const el = document.getElementById('event-log');
  if (!el) return;

  let html = '<div class="section-title">-- LOG --</div>';
  for (const entry of STATE.log) {
    html += `<div class="log-entry ${entry.type}">${entry.msg}</div>`;
  }
  el.innerHTML = html;
}

// ── Upgrade modal ─────────────────────────────────────────────────────────────
function uiShowUpgrades() {
  const modal = document.getElementById('upgrade-modal');
  if (!modal) return;

  const list = document.getElementById('upgrade-list');
  list.innerHTML = CONFIG.UPGRADES.map(u => {
    const level  = STATE.upgrades[u.id];
    const maxed  = level >= u.maxLevel;
    const cost   = maxed ? null : u.costs[level];
    const afford = !maxed && STATE.credits >= cost;
    return `
      <div class="upgrade-card">
        <div class="upgrade-name">${u.label} [${level}/${u.maxLevel}]</div>
        <div class="upgrade-desc">${u.desc}</div>
        <button onclick="uiBuyUpgrade('${u.id}')" ${(!afford && !maxed) ? 'disabled' : ''}>
          ${maxed ? 'MAXED' : (afford ? 'BUY ' + cost + ' CR' : cost + ' CR')}
        </button>
      </div>`;
  }).join('');

  modal.classList.remove('hidden');
}

function uiHideUpgrades() {
  const modal = document.getElementById('upgrade-modal');
  if (modal) modal.classList.add('hidden');
}

function uiBuyUpgrade(id) {
  const upg   = CONFIG.UPGRADES.find(u => u.id === id);
  const level = STATE.upgrades[id];
  if (!upg || level >= upg.maxLevel) return;

  const cost = upg.costs[level];
  if (STATE.credits < cost) return;

  STATE.credits    -= cost;
  STATE.upgrades[id]++;

  if (id === 'capacity') STATE.cabin.capacity++;

  stateLog('Upgraded: ' + upg.label + ' Lv' + STATE.upgrades[id], 'good');
  playBeep(550, 0.1);
  playBeep(750, 0.15);

  uiShowUpgrades();    // refresh modal
  uiRenderSidebar();
}

// ── Panel toggle (mobile) ─────────────────────────────────────────────────────
function uiTogglePanel() {
  const panel    = document.getElementById('panel-content');
  const btn      = document.getElementById('panel-toggle-btn');
  if (!panel || !btn) return;
  const expanded = panel.classList.toggle('expanded');
  btn.textContent = expanded ? '[ ▼ HIDE ]' : '[ ▲ INFO ]';
}

// ── Track button ──────────────────────────────────────────────────────────────
function uiToggleTracking() {
  const tracking = renderToggleTracking();
  const btn = document.getElementById('track-btn');
  if (btn) {
    btn.textContent   = tracking ? '[ TRACK: ON ]' : '[ TRACK: OFF ]';
    btn.style.color   = tracking ? '#0f8' : '#f80';
    btn.style.borderColor = tracking ? '#0a8' : '#880';
  }
}

// ── Canvas click / tap handler ────────────────────────────────────────────────
function _handleStationSelect(clickX, clickY) {
  if (STATE.gameOver) return;
  const cableX = getCableX();
  if (Math.abs(clickX - cableX) > 50 * Math.max(1, getZoom())) return;

  const clickAlt = screenYToAlt(clickY);
  let nearest = null, nearestDist = Infinity;
  for (const st of CONFIG.STATIONS) {
    const dist = Math.abs(st.alt - clickAlt);
    if (dist < nearestDist && dist < 0.1 / Math.max(0.5, getZoom())) {
      nearest = st; nearestDist = dist;
    }
  }
  if (nearest) {
    STATE.cabin.destination = nearest.id;
    stateLog('Heading to ' + nearest.label);
    uiRenderSidebar();
    playBeep(440, 0.07, 'square');
  }
}

function _handleCanvasClick(e) {
  if (_didDrag) { _didDrag = false; return; }
  const rect = _uiCanvas.getBoundingClientRect();
  _handleStationSelect(
    (e.clientX - rect.left) * (_uiCanvas.width  / rect.width),
    (e.clientY - rect.top)  * (_uiCanvas.height / rect.height)
  );
}

let _hoveredStation = null;
function _handleCanvasHover(e) {
  // Show pointer cursor when near cable/stations
  const rect   = _uiCanvas.getBoundingClientRect();
  const clickX = (e.clientX - rect.left) * (_uiCanvas.width  / rect.width);
  const clickY = (e.clientY - rect.top)  * (_uiCanvas.height / rect.height);
  const cableX = getCableX();

  if (Math.abs(clickX - cableX) < 50) {
    _uiCanvas.style.cursor = 'pointer';
  } else {
    _uiCanvas.style.cursor = 'default';
  }
}

// ── Win / Lose overlays ───────────────────────────────────────────────────────
function triggerGameOver(reason) {
  STATE.gameOver = true;
  const screen = document.getElementById('gameover-screen');
  if (!screen) return;

  const panel = document.getElementById('gameover-panel');
  panel.style.borderColor = '#5a1a1a';

  document.getElementById('gameover-title').textContent = 'GAME OVER';
  document.getElementById('gameover-title').className   = '';
  document.getElementById('gameover-reason').textContent = reason;
  document.getElementById('gameover-score').textContent  = 'Final: ' + Math.floor(STATE.credits).toLocaleString() + ' CR';

  screen.classList.remove('hidden');
  playBeep(200, 1.2, 'sawtooth');
}

function triggerWin() {
  STATE.gameOver = true;
  STATE.won      = true;
  const screen   = document.getElementById('gameover-screen');
  if (!screen) return;

  const panel = document.getElementById('gameover-panel');
  panel.style.borderColor = '#880';

  document.getElementById('gameover-title').textContent = 'MISSION COMPLETE';
  document.getElementById('gameover-title').className   = 'win';
  document.getElementById('gameover-reason').textContent = 'Target revenue reached!';
  document.getElementById('gameover-score').textContent  = 'Final: ' + Math.floor(STATE.credits).toLocaleString() + ' CR';

  screen.classList.remove('hidden');
  playBeep(440, 0.15);
  playBeep(550, 0.15);
  playBeep(660, 0.15);
  playBeep(880, 0.4);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _stShort(id) {
  const st = CONFIG.STATIONS.find(s => s.id === id);
  if (!st) return id;
  const parts = st.label.split(' ');
  return parts[0].slice(0, 4);
}

// ── Web Audio ─────────────────────────────────────────────────────────────────
let _audioCtx = null;

function playBeep(freq, duration, type) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.type            = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + duration);
    osc.start();
    osc.stop(_audioCtx.currentTime + duration);
  } catch (e) {
    // Audio not available, ignore
  }
}
