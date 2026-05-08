/* jshint esversion: 6 */
'use strict';

const CONFIG = {
  // ── Canvas layout ───────────────────────────────────
  SIDEBAR_WIDTH: 220,
  CABLE_Y_TOP_OFFSET: 50,      // px from top of canvas
  CABLE_Y_BOTTOM_OFFSET: 100,  // px from bottom of canvas

  // ── Stations ────────────────────────────────────────
  STATIONS: [
    { id: 'earth',         label: 'EARTH BASE',    alt: 0.00, km: 0       },
    { id: 'leo',           label: 'LEO STATION',   alt: 0.04, km: 400     },
    { id: 'geo',           label: 'GEO STATION',   alt: 0.36, km: 35786   },
    { id: 'counterweight', label: 'COUNTERWEIGHT', alt: 1.00, km: 100000  },
  ],

  // ── Physics ─────────────────────────────────────────
  BASE_SPEED: 0.038,           // altitude units per second at full power
  POWER_DRAIN_RATE: 7,         // % per second while moving
  POWER_REGEN_BASE: 3,         // % per second idle at altitude 0
  POWER_REGEN_ALT_BONUS: 6,    // extra % per second at altitude 1.0
  ARRIVAL_THRESHOLD: 0.005,    // altitude distance to snap to station
  LOW_POWER_THRESHOLD: 20,     // % below which speed penalty applies
  DAY_CYCLE_DURATION: 120,     // seconds for full day/night cycle
  SHADOW_ALT_THRESHOLD: 0.12,  // below this alt, Earth shadow can apply

  // ── Request generation ──────────────────────────────
  REQUEST_INTERVAL_MIN: 18,
  REQUEST_INTERVAL_MAX: 38,
  QUEUE_MAX: 5,

  REQUEST_TYPES: {
    CARGO: {
      label: 'CARGO',
      color: '#f80',
      rewardMin: 380, rewardMax: 680,
      deadlineMin: 130, deadlineMax: 320,
    },
    PASSENGER: {
      label: 'PSGR',
      color: '#0cf',
      rewardMin: 240, rewardMax: 440,
      deadlineMin: 70,  deadlineMax: 160,
    },
    FUEL: {
      label: 'FUEL',
      color: '#0f8',
      rewardMin: 140, rewardMax: 260,
      deadlineMin: 190, deadlineMax: 380,
    },
    VIP: {
      label: 'VIP',
      color: '#f0f',
      rewardMin: 820, rewardMax: 1400,
      deadlineMin: 50,  deadlineMax: 90,
    },
  },

  // ── Events ──────────────────────────────────────────
  EVENTS: {
    DEBRIS: {
      cooldown: 85,
      duration: 9,
      damageMin: 3,
      damageMax: 11,
    },
    SOLAR: {
      cooldown: 140,
      duration: 16,
      powerSwing: 38,
    },
    OSCILLATION: {
      cooldown: 115,
      duration: 7,
    },
  },

  // ── Economy ─────────────────────────────────────────
  WIN_CREDITS: 30000,
  ON_TIME_BONUS: 0.25,    // fraction of reward added as bonus
  LATE_PENALTY: 0.30,     // fraction of reward deducted if late

  // ── Upgrades ────────────────────────────────────────
  UPGRADES: [
    {
      id: 'speed',
      label: 'Motor Drive',
      desc: '+25% speed per level',
      maxLevel: 3,
      costs: [500, 1200, 2500],
    },
    {
      id: 'solar',
      label: 'Solar Array',
      desc: '+30% power regen per level',
      maxLevel: 3,
      costs: [400, 900, 2000],
    },
    {
      id: 'shield',
      label: 'Debris Shield',
      desc: '-40% debris damage per level',
      maxLevel: 2,
      costs: [600, 1500],
    },
    {
      id: 'capacity',
      label: 'Cabin Expansion',
      desc: '+1 cargo slot per level',
      maxLevel: 2,
      costs: [700, 1800],
    },
  ],

  // ── Visuals ─────────────────────────────────────────
  STAR_COUNT: 200,
  PARTICLE_MAX: 60,

  // Station label positions (relative offsets from station box)
  STATION_BOX_W: 30,
  STATION_BOX_H: 14,
};
