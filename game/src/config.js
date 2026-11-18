// Every tuning number and colour in one place. The playfield is a fixed
// logical world; the renderer scales it to the window, so no rule below
// depends on the screen size.
export const FIELD = { width: 1280, height: 720 };
export const WORLD = { width: 2560, height: 1920 };

// City grid: roads every 320 px, 72 px wide (36 px half width).
export const ROAD_HALF = 36;
export const ROAD_X = [200, 520, 840, 1160, 1480, 1800, 2120, 2440];
export const ROAD_Y = [200, 520, 840, 1160, 1480, 1800];
export const BLOCK = 320;

export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 265,
  punchRange: 46,
  punchCooldown: 0.45,
  health: 100,
};

export const CAR = {
  radius: 16,
  length: 46,
  width: 24,
  maxSpeed: 430,
  accel: 260,
  brake: 520,
  reverseMax: 150,
  steer: 2.6,
  health: 100,
};

export const CAR_KINDS = {
  sedan: { maxSpeed: 380, accel: 250, color: '#c94f4f' },
  taxi: { maxSpeed: 390, accel: 260, color: '#e8b93a' },
  van: { maxSpeed: 330, accel: 210, color: '#7d8aa0' },
  sport: { maxSpeed: 470, accel: 320, color: '#3fa7d6' },
  cop: { maxSpeed: 440, accel: 300, color: '#20242c' },
};

export const PED = {
  radius: 11,
  walkSpeed: 55,
  runSpeed: 190,
};

// Wanted: heat 0..100, stars = ceil(heat / 20) capped at 5.
export const WANTED = {
  stealCar: 14,
  punchPed: 8,
  hitPed: 12,
  hitCop: 25,
  killCop: 30,
  crash: 2,
  decayPerSec: 3,
  decayDelay: 10, // seconds after the last crime before decay starts
  maxStars: 5,
};

export const ECONOMY = {
  startMoney: 50,
  paynspray: 50,
  bustedFine: 150,
  wastedFine: 150,
  pickupMin: 25,
  pickupMax: 100,
};

// Named places, all on roads so a car can reach them.
export const PLACES = {
  safehouse: { x: 520, y: 1480, label: 'Safehouse' },
  bank: { x: 1160, y: 520, label: 'Solara Bank' },
  paynsprayA: { x: 1800, y: 840, label: "Pay 'n' Spray" },
  paynsprayB: { x: 520, y: 1800, label: "Pay 'n' Spray" },
  hospital: { x: 2120, y: 1480, label: 'Hospital' },
  docks: { x: 840, y: 1800, label: 'Docks' },
  policeStation: { x: 1480, y: 200, label: 'Police HQ' },
};

export const COLORS = {
  grass: '#5d8a4a',
  park: '#4c7a3e',
  sidewalk: '#9aa0a8',
  road: '#3a3f47',
  roadEdge: '#2c3038',
  lane: '#d8d23a',
  buildingRoof: ['#b0563a', '#4a6b8a', '#7a5a8a', '#8a7a4a', '#5a8a6b', '#a05a5a', '#6b7a8a'],
  buildingEdge: '#2e2a26',
  water: '#2f6f8f',
  sand: '#cbb98a',
};

export const MISSIONS = [
  { id: 1, name: 'Hot Wheels', reward: 150 },
  { id: 2, name: 'Package Run', reward: 300 },
  { id: 3, name: 'Heat Wave', reward: 500 },
  { id: 4, name: 'The Big Score', reward: 1000 },
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'solara-heat.best';
