'use strict';

window.STATE = {
  credits: 500,
  power: 100,
  cableIntegrity: 100,

  cabin: {
    altitude: 0,
    destination: null,
    speed: 0,
    cargo: [],      // delivery ids currently aboard
    capacity: 1,
  },

  requestQueue: [],
  activeDeliveries: [],
  completedDeliveries: [],
  events: [],
  particles: [],

  dayTime: 0,     // 0.0 – 1.0 (full cycle)
  totalTime: 0,   // seconds elapsed

  score: 0,
  creditsEarned: 0,

  gameOver: false,
  won: false,

  upgrades: { speed: 0, solar: 0, shield: 0, capacity: 0 },

  log: [],        // {msg, type} newest first, max 5

  timers: {
    nextRequest: 8,
    debrisCooldown: 85,
    solarCooldown: 140,
    oscillationCooldown: 115,
  },

  _nextId: 1,
};

function stateReset() {
  const s = window.STATE;
  s.credits = 500;
  s.power = 100;
  s.cableIntegrity = 100;
  s.cabin = { altitude: 0, destination: null, speed: 0, cargo: [], capacity: 1 };
  s.requestQueue = [];
  s.activeDeliveries = [];
  s.completedDeliveries = [];
  s.events = [];
  s.particles = [];
  s.dayTime = 0;
  s.totalTime = 0;
  s.score = 0;
  s.creditsEarned = 0;
  s.gameOver = false;
  s.won = false;
  s.upgrades = { speed: 0, solar: 0, shield: 0, capacity: 0 };
  s.log = [];
  s.timers = { nextRequest: 8, debrisCooldown: 85, solarCooldown: 140, oscillationCooldown: 115 };
  s._nextId = 1;
}

function stateLog(msg, type) {
  // type: undefined | 'warn' | 'error' | 'good'
  window.STATE.log.unshift({ msg, type: type || '' });
  if (window.STATE.log.length > 5) window.STATE.log.pop();
}

function stateNextId() {
  return window.STATE._nextId++;
}
