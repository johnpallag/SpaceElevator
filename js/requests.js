'use strict';

function requestsTick(dt) {
  _updateDeadlines(dt);
  _tryGenerateRequest(dt);
  _checkExpiredRequests();
}

// ── Generation ────────────────────────────────────────────────────────────────
function _tryGenerateRequest(dt) {
  STATE.timers.nextRequest -= dt;
  if (STATE.timers.nextRequest > 0) return;
  if (STATE.requestQueue.length >= CONFIG.QUEUE_MAX) {
    STATE.timers.nextRequest = 10;
    return;
  }
  STATE.requestQueue.push(_generateRequest());
  STATE.timers.nextRequest = CONFIG.REQUEST_INTERVAL_MIN
    + Math.random() * (CONFIG.REQUEST_INTERVAL_MAX - CONFIG.REQUEST_INTERVAL_MIN);
  uiRenderSidebar();
}

function _generateRequest() {
  const keys   = Object.keys(CONFIG.REQUEST_TYPES);
  // VIP 10% chance; otherwise random from the other 3
  const typeKey = Math.random() < 0.10 ? 'VIP' : keys[Math.floor(Math.random() * 3)];
  const cfg     = CONFIG.REQUEST_TYPES[typeKey];

  const stIds = CONFIG.STATIONS.map(s => s.id);
  const fromI = Math.floor(Math.random() * stIds.length);
  let   toI;
  do { toI = Math.floor(Math.random() * stIds.length); } while (toI === fromI);

  const reward   = Math.floor(cfg.rewardMin + Math.random() * (cfg.rewardMax - cfg.rewardMin));
  const deadline = Math.floor(cfg.deadlineMin + Math.random() * (cfg.deadlineMax - cfg.deadlineMin));

  return {
    id:            stateNextId(),
    from:          stIds[fromI],
    to:            stIds[toI],
    type:          typeKey,
    reward,
    deadline,
    timeRemaining: deadline,
    phase:         'waiting',  // waiting | pickup | transit | delivered
  };
}

// ── Accept / Reject (called from UI) ─────────────────────────────────────────
function requestAccept(id) {
  const req = STATE.requestQueue.find(r => r.id === id);
  if (!req) return;

  if (STATE.cabin.cargo.length >= STATE.cabin.capacity) {
    stateLog('Cabin full – upgrade capacity!', 'warn');
    uiRenderSidebar();
    return;
  }

  req.phase = 'pickup';
  STATE.requestQueue   = STATE.requestQueue.filter(r => r.id !== id);
  STATE.activeDeliveries.push(req);

  stateLog('Accepted: ' + req.type + ' ' + _stLabel(req.from) + '→' + _stLabel(req.to));
  playBeep(880, 0.08);

  // Navigate to pickup if idle
  if (!STATE.cabin.destination) {
    _autoNavigate();
  }
  uiRenderSidebar();
}

function requestReject(id) {
  STATE.requestQueue = STATE.requestQueue.filter(r => r.id !== id);
  playBeep(300, 0.12, 'triangle');
  uiRenderSidebar();
}

// ── Arrival handler (called by physics.js) ────────────────────────────────────
function requestsHandleArrival(stationId) {
  // Phase 1: drop off deliveries in transit whose destination is here
  const toDeliver = STATE.activeDeliveries.filter(
    d => d.phase === 'transit' && d.to === stationId && STATE.cabin.cargo.includes(d.id)
  );
  toDeliver.forEach(d => _completeDelivery(d));

  // Phase 2: pick up deliveries awaiting pickup at this station
  const toPickUp = STATE.activeDeliveries.filter(
    d => d.phase === 'pickup' && d.from === stationId
  );
  toPickUp.forEach(d => {
    if (STATE.cabin.cargo.length < STATE.cabin.capacity) {
      d.phase = 'transit';
      STATE.cabin.cargo.push(d.id);
      stateLog('Loaded: ' + d.type + ' → ' + _stLabel(d.to));
    }
  });

  // Phase 3: auto-navigate
  _autoNavigate();
  uiRenderSidebar();
}

function _autoNavigate() {
  if (STATE.cabin.destination) return;

  // Deliver what's in the cabin first (most urgent)
  const inTransit = STATE.activeDeliveries.filter(d => d.phase === 'transit');
  if (inTransit.length > 0) {
    inTransit.sort((a, b) => a.timeRemaining - b.timeRemaining);
    setCabinDestination(inTransit[0].to);
    return;
  }

  // Then go pick up accepted but not yet aboard
  const pendingPickup = STATE.activeDeliveries.filter(d => d.phase === 'pickup');
  if (pendingPickup.length > 0) {
    pendingPickup.sort((a, b) => a.timeRemaining - b.timeRemaining);
    setCabinDestination(pendingPickup[0].from);
  }
}

function _completeDelivery(delivery) {
  const onTime = delivery.timeRemaining > 0;
  const bonus   = onTime ? Math.floor(delivery.reward * CONFIG.ON_TIME_BONUS)  : 0;
  const penalty = onTime ? 0 : Math.floor(delivery.reward * CONFIG.LATE_PENALTY);
  const earned  = Math.max(0, delivery.reward + bonus - penalty);

  STATE.credits       += earned;
  STATE.creditsEarned += earned;
  STATE.score         += earned;

  STATE.cabin.cargo      = STATE.cabin.cargo.filter(id => id !== delivery.id);
  STATE.activeDeliveries = STATE.activeDeliveries.filter(d => d.id !== delivery.id);
  delivery.phase         = 'delivered';
  STATE.completedDeliveries.push(delivery);

  const tag = bonus ? ' +BONUS' : penalty ? ' -LATE' : '';
  stateLog('Delivered! +' + earned + 'CR' + tag, 'good');
  playBeep(660, 0.18);
  playBeep(880, 0.18);

  // Spawn credit particles on the canvas
  spawnCreditParticles(getCableX(), altToY(STATE.cabin.altitude), earned);
}

// ── Deadline tracking ─────────────────────────────────────────────────────────
function _updateDeadlines(dt) {
  for (const r of STATE.requestQueue) {
    r.timeRemaining -= dt;
  }
  for (const d of STATE.activeDeliveries) {
    d.timeRemaining -= dt;
  }
}

function _checkExpiredRequests() {
  const before = STATE.requestQueue.length;
  STATE.requestQueue = STATE.requestQueue.filter(r => {
    if (r.timeRemaining < 0) {
      stateLog('Request expired: ' + r.type, 'warn');
      return false;
    }
    return true;
  });
  if (STATE.requestQueue.length !== before) uiRenderSidebar();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _stLabel(id) {
  const st = CONFIG.STATIONS.find(s => s.id === id);
  return st ? st.label.split(' ')[0] : id;
}
