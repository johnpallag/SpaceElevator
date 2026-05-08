'use strict';

function physicsTick(dt) {
  _updateDayNight(dt);
  _updatePower(dt);
  _updateCabinMovement(dt);
  _checkStationArrival();
}

function _updateDayNight(dt) {
  STATE.dayTime    = (STATE.dayTime + dt / CONFIG.DAY_CYCLE_DURATION) % 1;
  STATE.totalTime += dt;
}

function _updatePower(dt) {
  const isMoving = Math.abs(STATE.cabin.speed) > 0.0001;

  if (isMoving) {
    STATE.power -= CONFIG.POWER_DRAIN_RATE * dt;
  } else {
    const altBonus    = STATE.cabin.altitude * CONFIG.POWER_REGEN_ALT_BONUS;
    const upgradeMult = 1 + STATE.upgrades.solar * 0.3;
    const shadowMult  = _isInShadow() ? 0.15 : 1;
    const regen       = (CONFIG.POWER_REGEN_BASE + altBonus) * upgradeMult * shadowMult;
    STATE.power       = Math.min(100, STATE.power + regen * dt);
  }

  // Solar storm swings
  const storm = STATE.events.find(e => e.type === 'SOLAR');
  if (storm) {
    STATE.power += Math.sin(storm.elapsed * 3.5) * CONFIG.EVENTS.SOLAR.powerSwing * dt;
  }

  STATE.power = Math.max(0, Math.min(100, STATE.power));

  if (STATE.power === 0 && STATE.cabin.destination !== null) {
    STATE.cabin.destination = null;
    STATE.cabin.speed       = 0;
    stateLog('OUT OF POWER – cabin halted', 'error');
    uiRenderSidebar();
  }
}

function _updateCabinMovement(dt) {
  if (!STATE.cabin.destination) {
    STATE.cabin.speed = 0;
    return;
  }

  const dest = CONFIG.STATIONS.find(s => s.id === STATE.cabin.destination);
  if (!dest) { STATE.cabin.destination = null; return; }

  const direction = dest.alt > STATE.cabin.altitude ? 1 : -1;

  const speedMult   = 1 + STATE.upgrades.speed * 0.25;
  const powerFactor = STATE.power < CONFIG.LOW_POWER_THRESHOLD
    ? Math.max(0.1, STATE.power / CONFIG.LOW_POWER_THRESHOLD)
    : 1;

  const hasDebris   = STATE.events.some(e => e.type === 'DEBRIS');
  const debrisSlow  = hasDebris ? 0.45 : 1;
  const oscPause    = STATE.events.some(e => e.type === 'OSCILLATION') ? 0 : 1;

  STATE.cabin.speed = CONFIG.BASE_SPEED * speedMult * powerFactor * debrisSlow * oscPause * direction;

  const newAlt = STATE.cabin.altitude + STATE.cabin.speed * dt;
  STATE.cabin.altitude = Math.max(0, Math.min(1, newAlt));

  // Spawn thruster particles
  spawnThrusterParticles(STATE.cabin);
}

function _checkStationArrival() {
  if (!STATE.cabin.destination) return;

  const dest = CONFIG.STATIONS.find(s => s.id === STATE.cabin.destination);
  if (!dest) return;

  const dist = Math.abs(STATE.cabin.altitude - dest.alt);
  if (dist < CONFIG.ARRIVAL_THRESHOLD) {
    STATE.cabin.altitude    = dest.alt;
    const arrivedAt         = STATE.cabin.destination;
    STATE.cabin.destination = null;
    STATE.cabin.speed       = 0;
    stateLog('Docked at ' + dest.label);
    requestsHandleArrival(arrivedAt);
    uiRenderSidebar();
  }
}

function _isInShadow() {
  // Shadow: night side of Earth cycle AND low altitude
  const nightPhase = Math.abs(STATE.dayTime - 0.5) < 0.25;
  return nightPhase && STATE.cabin.altitude < CONFIG.SHADOW_ALT_THRESHOLD;
}

function setCabinDestination(stationId) {
  if (STATE.cabin.destination === stationId) return;
  STATE.cabin.destination = stationId;
  uiRenderSidebar();
}

function checkWinLose() {
  if (STATE.gameOver) return;

  if (STATE.cableIntegrity <= 0) {
    triggerGameOver('Cable destroyed by debris');
    return;
  }

  // Lose if stranded: out of power AND can't earn credits (no active or queued requests)
  if (STATE.power <= 0 && STATE.credits < 50
      && STATE.activeDeliveries.length === 0
      && STATE.requestQueue.length === 0) {
    triggerGameOver('No power and no credits remain');
    return;
  }

  if (STATE.credits >= CONFIG.WIN_CREDITS) {
    triggerWin();
  }
}
