'use strict';

function eventsTick(dt) {
  _trySpawnEvents(dt);
  _updateActiveEvents(dt);
}

function _trySpawnEvents(dt) {
  // Debris
  STATE.timers.debrisCooldown -= dt;
  if (STATE.timers.debrisCooldown <= 0) {
    _spawnEvent('DEBRIS');
    STATE.timers.debrisCooldown = CONFIG.EVENTS.DEBRIS.cooldown + Math.random() * 30;
  }

  // Solar storm
  STATE.timers.solarCooldown -= dt;
  if (STATE.timers.solarCooldown <= 0) {
    _spawnEvent('SOLAR');
    STATE.timers.solarCooldown = CONFIG.EVENTS.SOLAR.cooldown + Math.random() * 40;
  }

  // Oscillation
  STATE.timers.oscillationCooldown -= dt;
  if (STATE.timers.oscillationCooldown <= 0) {
    _spawnEvent('OSCILLATION');
    STATE.timers.oscillationCooldown = CONFIG.EVENTS.OSCILLATION.cooldown + Math.random() * 30;
  }
}

function _spawnEvent(type) {
  // Don't stack same type
  if (STATE.events.some(e => e.type === type)) return;

  const cfg   = CONFIG.EVENTS[type];
  const event = {
    id:       stateNextId(),
    type,
    duration: cfg.duration,
    elapsed:  0,
  };

  if (type === 'DEBRIS') {
    const shieldMult = 1 - STATE.upgrades.shield * 0.4;
    const rawDamage  = cfg.damageMin + Math.random() * (cfg.damageMax - cfg.damageMin);
    const damage     = rawDamage * shieldMult;
    STATE.cableIntegrity = Math.max(0, STATE.cableIntegrity - damage);

    // Pre-generate dot positions for rendering
    event.dots = Array.from({ length: 7 }, () => ({
      ox: (Math.random() - 0.5) * 80,
      oy: (Math.random() - 0.5) * 100,
      x: 0, y: 0,
      vx: (Math.random() - 0.5) * 25,
      vy: (Math.random() - 0.5) * 25,
      r:  1 + Math.floor(Math.random() * 3),
      color: Math.random() < 0.5 ? '#888' : '#aaa',
    }));

    stateLog('DEBRIS: cable integrity ' + Math.round(STATE.cableIntegrity) + '%', 'warn');
    playBeep(220, 0.5, 'sawtooth');
    uiRenderSidebar();
  }

  if (type === 'SOLAR') {
    stateLog('SOLAR STORM incoming!', 'warn');
    playBeep(180, 0.8, 'sawtooth');
    uiRenderSidebar();
  }

  if (type === 'OSCILLATION') {
    stateLog('Cable oscillation – cabin paused', 'warn');
    playBeep(260, 0.4, 'triangle');
    uiRenderSidebar();
  }

  STATE.events.push(event);
}

function _updateActiveEvents(dt) {
  for (const e of STATE.events) {
    e.elapsed += dt;
  }

  STATE.events = STATE.events.filter(e => {
    if (e.elapsed >= e.duration) {
      if (e.type === 'SOLAR')       stateLog('Solar storm passed');
      if (e.type === 'OSCILLATION') stateLog('Cable stabilised');
      if (e.type === 'DEBRIS')      stateLog('Debris field cleared');
      uiRenderSidebar();
      return false;
    }
    return true;
  });
}
