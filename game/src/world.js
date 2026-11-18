// The game's rules and state, with no drawing and no browser in it: the
// player (on foot or driving), traffic, pedestrians, police, wanted
// level, money, missions, pickups and the city. step() advances one
// fixed step and returns what happened as bit flags, so the caller can
// react without the world knowing about screens or sound.
import {
  CAR, ECONOMY, FIELD, PED, PLACES, PLAYER, ROAD_HALF, ROAD_X, ROAD_Y,
  STEP, WANTED, WORLD,
} from './config.js';
import { buildCity, clampToWorld, nearestIntersection, nearestRoadPoint, onRoad, resolveBuildings } from './city.js';
import { angleDiff, angleTo, collideCircles, makeCar, makePed, stepCar } from './entities.js';
import { nextMissionMarker, startMission, updateMission } from './missions.js';

export const EVENT_PICKUP = 1;
export const EVENT_CRASH = 2;
export const EVENT_BUSTED = 4;
export const EVENT_WASTED = 8;
export const EVENT_MISSION_DONE = 16;
export const EVENT_MISSION_FAIL = 32;
export const EVENT_CRIME = 64;

const TRAFFIC_TARGET = 14;
const PED_TARGET = 16;
const PICKUP_TARGET = 8;

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export function createWorld(rng, audio) {
  const city = buildCity(rng);
  const state = {
    rng,
    audio,
    city,
    elapsed: 0,
    screen: 'title',
    player: {
      x: 520, y: 520, angle: -Math.PI / 2, r: PLAYER.radius,
      health: PLAYER.health, car: null, punchTimer: 0, invulnerable: 0,
      speed: 0,
    },
    cars: [],
    peds: [],
    cops: [], // on-foot police
    particles: [],
    skid: [],
    pickups: [],
    money: ECONOMY.startMoney,
    heat: 0,
    lastCrime: -100,
    mission: null,
    missionIndex: 1,
    missionMarker: null,
    toastText: null,
    toastUntil: 0,
    announce: '',
    camera: { x: 520, y: 520 },
    shake: 0,
    bustedTimer: 0,
    wastedTimer: 0,
    stats: { missionsDone: 0, carsStolen: 0, pedsHit: 0, cashEarned: 0, timePlayed: 0 },
    paynsprayArmed: true,
  };

  // -- helpers ---------------------------------------------------------
  function toast(text, dur) {
    state.toastText = text;
    state.toastUntil = state.elapsed + (dur || 3);
  }
  state.toast = toast;
  function say(text) { state.announce = text; }
  state.say = say;
  function addHeat(amount) {
    state.heat = Math.min(100, state.heat + amount);
    state.lastCrime = state.elapsed;
  }
  state.addHeat = addHeat;
  function stars() {
    return Math.min(WANTED.maxStars, Math.ceil(state.heat / 20));
  }
  state.stars = stars;
  function playerPos() {
    return state.player.car || state.player;
  }

  function spawnParticles(x, y, n, color, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rng.range(0.3, 0.8), maxLife: 0.8, color, size: rng.range(2, 5),
      });
    }
    if (state.particles.length > 300) state.particles.splice(0, state.particles.length - 300);
  }
  state.spawnParticles = spawnParticles;

  function randomRoadPointNear(x, y, minD, maxD) {
    for (let tries = 0; tries < 20; tries += 1) {
      const rx = rng.pick(ROAD_X);
      const ry = rng.pick(ROAD_Y);
      const px = rng.chance(0.5) ? rx : rng.range(100, WORLD.width - 100);
      const py = rng.chance(0.5) ? ry : rng.range(100, WORLD.height - 100);
      const point = nearestRoadPoint(px, py);
      const d = dist(point.x, point.y, x, y);
      if (d >= minD && d <= maxD) return point;
    }
    return nearestRoadPoint(rng.range(100, WORLD.width - 100), rng.range(100, WORLD.height - 100));
  }

  function spawnTrafficCar(nearPlayer) {
    const p = playerPos();
    const point = nearPlayer
      ? randomRoadPointNear(p.x, p.y, 420, 900)
      : nearestRoadPoint(rng.range(100, WORLD.width - 100), rng.range(100, WORLD.height - 100));
    const kind = rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sport']);
    const car = makeCar(point.x, point.y, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), kind, rng);
    car.driver = 'civilian';
    car.targetSpeed = rng.range(120, 210);
    car.route = pickRoute(point);
    car.wp = 0;
    state.cars.push(car);
    return car;
  }

  function spawnParkedCar() {
    const point = nearestRoadPoint(rng.range(100, WORLD.width - 100), rng.range(100, WORLD.height - 100));
    const kind = rng.pick(['sedan', 'sedan', 'taxi', 'van', 'sport']);
    const car = makeCar(point.x, point.y, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), kind, rng);
    car.driver = null;
    car.targetSpeed = 0;
    state.cars.push(car);
    return car;
  }

  function pickRoute(from) {
    // A route is a list of intersections to drive through.
    const route = [];
    let cur = nearestIntersection(from.x, from.y);
    route.push(cur);
    for (let i = 0; i < 6; i += 1) {
      const next = nextIntersection(cur, route.length > 1 ? route[route.length - 2] : null);
      if (!next) break;
      route.push(next);
      cur = next;
    }
    return route;
  }

  function nextIntersection(cur, prev) {
    const options = [];
    const ix = ROAD_X.indexOf(cur.x);
    const iy = ROAD_Y.indexOf(cur.y);
    if (ix > 0) options.push({ x: ROAD_X[ix - 1], y: cur.y });
    if (ix < ROAD_X.length - 1) options.push({ x: ROAD_X[ix + 1], y: cur.y });
    if (iy > 0) options.push({ x: cur.x, y: ROAD_Y[iy - 1] });
    if (iy < ROAD_Y.length - 1) options.push({ x: cur.x, y: ROAD_Y[iy + 1] });
    const filtered = options.filter((o) => !prev || !(o.x === prev.x && o.y === prev.y));
    if (filtered.length === 0) return options[0] || null;
    return rng.pick(filtered);
  }

  function spawnPed(nearPlayer) {
    const p = playerPos();
    const point = nearPlayer
      ? randomRoadPointNear(p.x, p.y, 300, 800)
      : nearestRoadPoint(rng.range(100, WORLD.width - 100), rng.range(100, WORLD.height - 100));
    const ped = makePed(point.x, point.y, rng);
    ped.target = randomRoadPointNear(point.x, point.y, 100, 500);
    state.peds.push(ped);
    return ped;
  }

  function spawnPickup() {
    const point = nearestRoadPoint(rng.range(100, WORLD.width - 100), rng.range(100, WORLD.height - 100));
    state.pickups.push({
      x: point.x, y: point.y,
      value: rng.int(ECONOMY.pickupMin, ECONOMY.pickupMax),
      bob: rng.range(0, Math.PI * 2),
    });
  }

  function spawnCopCar() {
    const p = playerPos();
    const point = randomRoadPointNear(p.x, p.y, 480, 750);
    const car = makeCar(point.x, point.y, angleTo(point.x, point.y, p.x, p.y), 'cop', rng);
    car.driver = 'cop';
    car.targetSpeed = 0;
    // Each cop approaches from its own angle so they surround the
    // player instead of stacking on the same spot.
    car.approach = rng.range(0, Math.PI * 2);
    car.backoff = 0;
    state.cars.push(car);
    return car;
  }

  function spawnCopFoot() {
    const p = playerPos();
    const point = randomRoadPointNear(p.x, p.y, 350, 600);
    const cop = makePed(point.x, point.y, rng);
    cop.state = 'cop';
    cop.color = '#20242c';
    state.cops.push(cop);
    return cop;
  }

  // -- reset -----------------------------------------------------------
  function reset() {
    state.elapsed = 0;
    state.player.x = 520;
    state.player.y = 520;
    state.player.angle = -Math.PI / 2;
    state.player.health = PLAYER.health;
    state.player.car = null;
    state.player.punchTimer = 0;
    state.player.invulnerable = 0;
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.particles = [];
    state.skid = [];
    state.pickups = [];
    state.money = ECONOMY.startMoney;
    state.heat = 0;
    state.lastCrime = -100;
    state.mission = null;
    state.missionIndex = 1;
    state.missionMarker = null;
    state.toastText = null;
    state.camera = { x: 520, y: 520 };
    state.shake = 0;
    state.bustedTimer = 0;
    state.wastedTimer = 0;
    state.stats = { missionsDone: 0, carsStolen: 0, pedsHit: 0, cashEarned: 0, timePlayed: 0 };
    state.paynsprayArmed = true;
    for (let i = 0; i < 10; i += 1) spawnTrafficCar(false);
    for (let i = 0; i < 4; i += 1) spawnParkedCar();
    for (let i = 0; i < PED_TARGET; i += 1) spawnPed(false);
    for (let i = 0; i < PICKUP_TARGET; i += 1) spawnPickup();
  }

  // -- player actions --------------------------------------------------
  function tryEnterCar() {
    const p = state.player;
    if (p.car) {
      // Get out: step aside from the car.
      const car = p.car;
      car.driver = null;
      p.x = car.x - Math.sin(car.angle) * 34;
      p.y = car.y + Math.cos(car.angle) * 34;
      p.angle = car.angle;
      p.car = null;
      clampToWorld(p, 20);
      resolveBuildings(city.buildings, p);
      return;
    }
    let best = null;
    let bestD = 58;
    for (const car of state.cars) {
      if (car.wrecked) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return;
    if (best.driver === 'civilian') {
      // Carjack: the driver bails and runs.
      const driver = makePed(best.x - Math.sin(best.angle) * 30, best.y + Math.cos(best.angle) * 30, rng);
      driver.state = 'flee';
      driver.fleeTimer = 4;
      state.peds.push(driver);
      addHeat(WANTED.stealCar);
      state.stats.carsStolen += 1;
      toast('Car stolen! The cops noticed.', 3);
      audio.punch();
    } else if (best.driver === 'cop') {
      addHeat(WANTED.hitCop);
      state.stats.carsStolen += 1;
      toast('You stole a cop car!', 3);
    }
    best.driver = 'player';
    p.car = best;
    p.x = best.x;
    p.y = best.y;
    p.angle = best.angle;
  }

  function tryPunch() {
    const p = state.player;
    if (p.car || p.punchTimer > 0) return;
    p.punchTimer = PLAYER.punchCooldown;
    audio.punch();
    const px = p.x + Math.cos(p.angle) * 30;
    const py = p.y + Math.sin(p.angle) * 30;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (dist(px, py, ped.x, ped.y) < PLAYER.punchRange) {
        ped.state = 'down';
        ped.downTimer = 2.5;
        addHeat(WANTED.punchPed);
        state.stats.pedsHit += 1;
        spawnParticles(ped.x, ped.y, 8, '#ffd23a', 120);
        const drop = rng.int(10, 40);
        state.money += drop;
        state.stats.cashEarned += drop;
        toast(`You knocked a pedestrian down. +$${drop}`, 2.5);
        return;
      }
    }
    for (const cop of state.cops) {
      if (dist(px, py, cop.x, cop.y) < PLAYER.punchRange) {
        cop.state = 'down';
        cop.downTimer = 2;
        addHeat(WANTED.hitCop);
        spawnParticles(cop.x, cop.y, 8, '#ffd23a', 120);
        toast('You hit a cop! That was a bad idea.', 3);
        return;
      }
    }
  }

  function bustPlayer() {
    const fine = Math.min(ECONOMY.bustedFine, state.money);
    state.money -= fine;
    state.heat = 0;
    if (state.player.car) {
      state.player.car.driver = null;
      state.player.car = null;
    }
    state.player.x = PLACES.policeStation.x;
    state.player.y = PLACES.policeStation.y + 60;
    state.player.health = PLAYER.health;
    // Clear the cops that caught you.
    state.cops = [];
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      if (state.cars[i].driver === 'cop') state.cars.splice(i, 1);
    }
    audio.busted();
    audio.setSiren(false);
    audio.setEngine(0);
    toast(`BUSTED! Fine $${fine}.`, 3);
    say('Busted by the police.');
    state.bustedTimer = 2.5;
    return EVENT_BUSTED;
  }

  function wastePlayer() {
    const fine = Math.min(ECONOMY.wastedFine, state.money);
    state.money -= fine;
    state.heat = 0;
    if (state.player.car) {
      state.player.car.driver = null;
      state.player.car = null;
    }
    state.player.x = PLACES.hospital.x;
    state.player.y = PLACES.hospital.y + 60;
    state.player.health = PLAYER.health;
    state.cops = [];
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      if (state.cars[i].driver === 'cop') state.cars.splice(i, 1);
    }
    audio.busted();
    audio.setSiren(false);
    audio.setEngine(0);
    toast(`WASTED! Hospital bill $${fine}.`, 3);
    say('Wasted. You woke up at the hospital.');
    state.wastedTimer = 2.5;
    return EVENT_WASTED;
  }

  // -- per-frame updates -------------------------------------------------
  function updatePlayerOnFoot(dt, move, run) {
    const p = state.player;
    const len = Math.hypot(move.x, move.y);
    if (len > 0) {
      const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const nx = move.x / len;
      const ny = move.y / len;
      p.x += nx * speed * dt;
      p.y += ny * speed * dt;
      p.angle = Math.atan2(ny, nx);
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    if (p.punchTimer > 0) p.punchTimer -= dt;
    if (p.invulnerable > 0) p.invulnerable -= dt;
    clampToWorld(p, 20);
    resolveBuildings(city.buildings, p);
  }

  function updatePlayerCar(dt, move) {
    const p = state.player;
    const car = p.car;
    const drive = move.y < 0 ? 1 : (move.y > 0 ? -1 : 0);
    const steer = move.x;
    const before = car.speed;
    const moved = stepCar(car, drive, steer, dt);
    car.brakeLight = move.y > 0 && before > 20;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = Math.abs(car.speed);
    clampToWorld(car, 24);
    if (resolveBuildings(city.buildings, car)) {
      // Hit a building: lose speed and take damage.
      const impact = Math.abs(car.speed);
      // One bump per 0.6s: without the cooldown, grinding along a wall
      // adds heat and damage every step and maxes the wanted level.
      if (impact > 140 && state.elapsed - (car.lastBump || -10) > 0.6) {
        car.health -= impact * 0.06;
        state.shake = Math.min(14, impact * 0.03);
        spawnParticles(car.x, car.y, 10, '#ffb13a', 160);
        audio.crash(impact);
        addHeat(WANTED.crash);
        car.lastBump = state.elapsed;
        if (car.health <= 0 && !car.wrecked) {
          car.wrecked = true;
          spawnParticles(car.x, car.y, 24, '#888', 200);
          toast('Your car is wrecked. Get out!', 3);
        }
      }
      car.speed *= 0.4;
    }
    // Exhaust + skid marks when flooring it.
    if (drive > 0 && Math.abs(car.speed) > 60 && rng.chance(0.4)) {
      const bx = car.x - Math.cos(car.angle) * 24;
      const by = car.y - Math.sin(car.angle) * 24;
      state.particles.push({
        x: bx, y: by, vx: -Math.cos(car.angle) * 30, vy: -Math.sin(car.angle) * 30,
        life: 0.5, maxLife: 0.5, color: '#999', size: 3,
      });
    }
    if (Math.abs(steer) > 0.7 && Math.abs(car.speed) > 200) {
      state.skid.push({ x: car.x, y: car.y, angle: car.angle, life: 4 });
      if (state.skid.length > 120) state.skid.shift();
    }
    audio.setEngine(Math.abs(car.speed) / car.maxSpeed);
    return moved;
  }

  function updateTraffic(dt) {
    const p = playerPos();
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.driver === 'player' || car.driver === 'cop') continue;
      if (car.driver === null && dist(car.x, car.y, p.x, p.y) > 1100) {
        state.cars.splice(i, 1);
        continue;
      }
      if (car.driver === 'civilian') {
        // Follow the route, one intersection at a time.
        if (!car.route || car.wp >= car.route.length) {
          car.route = pickRoute(car);
          car.wp = 0;
        }
        const target = car.route[car.wp];
        const d = dist(car.x, car.y, target.x, target.y);
        if (d < 26) {
          car.wp += 1;
          continue;
        }
        // Right-hand lane: offset the target to the right of travel.
        const ang = angleTo(car.x, car.y, target.x, target.y);
        const tx = target.x + -Math.sin(ang) * 14;
        const ty = target.y + Math.cos(ang) * 14;
        const want = angleTo(car.x, car.y, tx, ty);
        const turn = Math.max(-1, Math.min(1, angleDiff(car.angle, want) * 2));
        // Slow down for the car ahead.
        let targetSpeed = car.targetSpeed;
        for (const other of state.cars) {
          if (other === car) continue;
          const od = dist(car.x, car.y, other.x, other.y);
          if (od < 60 && Math.abs(angleDiff(car.angle, angleTo(car.x, car.y, other.x, other.y))) < 0.6) {
            targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed * 0.7));
            break;
          }
        }
        const drive = car.speed < targetSpeed ? 1 : 0;
        stepCar(car, drive, turn, dt);
        clampToWorld(car, 24);
        resolveBuildings(city.buildings, car);
        if (dist(car.x, car.y, p.x, p.y) > 1050) {
          state.cars.splice(i, 1);
        }
      }
    }
    // Top the traffic back up near the player.
    let civilians = 0;
    for (const car of state.cars) if (car.driver === 'civilian') civilians += 1;
    if (civilians < TRAFFIC_TARGET) spawnTrafficCar(true);
    // A few parked cars around, for stealing.
    let parked = 0;
    for (const car of state.cars) if (car.driver === null) parked += 1;
    if (parked < 3 && rng.chance(0.01)) spawnParkedCar();
  }

  function updatePeds(dt) {
    const p = playerPos();
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'flee';
          ped.fleeTimer = 3;
        }
        continue;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const fa = angleTo(p.x, p.y, state.player.x, state.player.y) + Math.PI;
        ped.angle = fa;
        ped.x += Math.cos(fa) * PED.runSpeed * dt;
        ped.y += Math.sin(fa) * PED.runSpeed * dt;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
          ped.target = randomRoadPointNear(ped.x, ped.y, 120, 600);
        }
        const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
        ped.angle = a;
        ped.x += Math.cos(a) * PED.walkSpeed * dt;
        ped.y += Math.sin(a) * PED.walkSpeed * dt;
      }
      clampToWorld(ped, 14);
      resolveBuildings(city.buildings, ped);
      if (dist(ped.x, ped.y, p.x, p.y) > 1100) state.peds.splice(i, 1);
    }
    if (state.peds.length < PED_TARGET) spawnPed(true);
  }

  function updateCops(dt) {
    const wanted = stars();
    const p = playerPos();
    // Cop cars: one per star, up to 5.
    let copCars = 0;
    for (const car of state.cars) if (car.driver === 'cop') copCars += 1;
    if (wanted > 0 && copCars < wanted) spawnCopCar();
    if (wanted === 0) {
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        if (state.cars[i].driver === 'cop') state.cars.splice(i, 1);
      }
      state.cops = [];
      audio.setSiren(false);
    } else {
      audio.setSiren(true);
    }
    // Foot cops when the player is on foot and wanted >= 2.
    if (wanted >= 2 && !state.player.car && state.cops.length < Math.min(2, wanted - 1)) {
      spawnCopFoot();
    }
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.driver !== 'cop') continue;
      // Approach from this cop's own angle so cops surround the player
      // instead of stacking on one spot.
      const ax = p.x + Math.cos(car.approach || 0) * 70;
      const ay = p.y + Math.sin(car.approach || 0) * 70;
      const want = angleTo(car.x, car.y, ax, ay);
      const turn = Math.max(-1, Math.min(1, angleDiff(car.angle, want) * 2.5));
      const d = dist(car.x, car.y, p.x, p.y);
      if (car.backoff > 0) {
        // Rammed the player: peel off in reverse, then come again.
        car.backoff -= dt;
        stepCar(car, -1, -turn, dt);
      } else {
        const drive = dist(car.x, car.y, ax, ay) > 60 ? 1 : 0;
        stepCar(car, drive, turn, dt);
        if (d < 45) car.backoff = 0.7;
      }
      clampToWorld(car, 24);
      resolveBuildings(city.buildings, car);
      if (d > 1100) state.cars.splice(i, 1);
    }
    // Foot cops run the player down.
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const cop = state.cops[i];
      if (cop.state === 'down') {
        cop.downTimer -= dt;
        if (cop.downTimer <= 0) cop.state = 'cop';
        continue;
      }
      const d = dist(cop.x, cop.y, state.player.x, state.player.y);
      if (state.player.car) {
        // Player drove off: give up and walk back to the beat.
        if (d > 500) { state.cops.splice(i, 1); continue; }
      }
      const a = angleTo(cop.x, cop.y, state.player.x, state.player.y);
      cop.angle = a;
      cop.x += Math.cos(a) * PED.runSpeed * 1.15 * dt;
      cop.y += Math.sin(a) * PED.runSpeed * 1.15 * dt;
      clampToWorld(cop, 14);
      resolveBuildings(city.buildings, cop);
      if (!state.player.car && d < 26) {
        cop.bustTimer = (cop.bustTimer || 0) + dt;
        if (cop.bustTimer > 1.2) {
          return bustPlayer();
        }
      } else {
        cop.bustTimer = 0;
      }
    }
    return 0;
  }

  function updateCollisions(dt) {
    let events = 0;
    const p = state.player;
    // Player car vs traffic / cop cars.
    if (p.car) {
      // Running a pedestrian over at speed is a crime (and a GTA staple).
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - p.car.x, ped.y - p.car.y) < 26 && Math.abs(p.car.speed) > 80) {
          ped.state = 'down';
          ped.downTimer = 3;
          addHeat(WANTED.hitPed);
          state.stats.pedsHit += 1;
          spawnParticles(ped.x, ped.y, 10, '#ff5a5a', 150);
          state.shake = 5;
          audio.crash(120);
        }
      }
      for (const other of state.cars) {
        if (other === p.car || other.wrecked) continue;
        const impact = collideCircles(p.car, other, p.car.speed, other.speed);
        // One crash per 0.5s: without the cooldown, a sustained pile-up
        // adds heat and damage every step and wrecks the car in seconds.
        if (impact > 60 && state.elapsed - (p.car.lastCrash || -10) > 0.5) {
          // Cop rams are meant to stop the player, not wreck the car in
          // seconds, so the player takes less damage from a cop than
          // from ploughing into traffic at the same speed.
          const dmg = impact * 0.03;
          p.car.health -= dmg * (other.driver === 'cop' ? 0.4 : 1);
          other.health -= dmg * 0.5;
          state.shake = Math.min(12, impact * 0.03);
          spawnParticles((p.car.x + other.x) / 2, (p.car.y + other.y) / 2, 8, '#ffb13a', 140);
          audio.crash(impact);
          events |= EVENT_CRASH;
          // Heat only when the player is the aggressor: a cop ramming a
          // stopped player is the cop's doing, not the player's crime.
          if (Math.abs(p.car.speed) > Math.abs(other.speed)) {
            addHeat(WANTED.crash);
            if (other.driver === 'cop') addHeat(WANTED.hitCop);
          }
          p.car.lastCrash = state.elapsed;
          if (p.car.health <= 0 && !p.car.wrecked) {
            p.car.wrecked = true;
            spawnParticles(p.car.x, p.car.y, 24, '#888', 200);
            toast('Your car is wrecked. Get out!', 3);
          }
          if (other.health <= 0 && !other.wrecked) {
            other.wrecked = true;
            if (other.driver === 'civilian') {
              const driver = makePed(other.x, other.y, rng);
              driver.state = 'flee';
              driver.fleeTimer = 4;
              state.peds.push(driver);
              other.driver = null;
            }
          }
        }
      }
    } else {
      // On foot: cars can hit the player.
      for (const car of state.cars) {
        if (car.wrecked) continue;
        const d = dist(p.x, p.y, car.x, car.y);
        if (d < car.r + p.r && Math.abs(car.speed) > 60 && p.invulnerable <= 0) {
          const dmg = 10 + Math.abs(car.speed) * 0.04;
          p.health -= dmg;
          p.invulnerable = 1;
          state.shake = 8;
          spawnParticles(p.x, p.y, 10, '#ff5a5a', 150);
          audio.crash(Math.abs(car.speed));
          // The driver hit the player: the player is the victim, so no
          // wanted heat for this — heat is for the player's own crimes.
          state.stats.pedsHit += 1;
          // Knock the player away from the car.
          const a = angleTo(car.x, car.y, p.x, p.y);
          p.x += Math.cos(a) * 30;
          p.y += Math.sin(a) * 30;
          if (p.health <= 0) return wastePlayer();
        }
      }
      // Peds bump into the player: nothing, they just walk around.
    }
    // Traffic cars bump each other (cheap pairwise pass).
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        if (a.wrecked || b.wrecked) continue;
        if (a.driver === 'player' || b.driver === 'player') continue;
        collideCircles(a, b, a.speed, b.speed);
      }
    }
    return events;
  }

  function updatePickups(dt) {
    const p = playerPos();
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      pk.bob += dt * 3;
      if (dist(p.x, p.y, pk.x, pk.y) < 34) {
        state.money += pk.value;
        state.stats.cashEarned += pk.value;
        audio.cash();
        toast(`Found $${pk.value} on the street.`, 2);
        spawnParticles(pk.x, pk.y, 10, '#7dd87d', 120);
        state.pickups.splice(i, 1);
        spawnPickup();
      }
    }
  }

  function updatePaynspray() {
    const p = state.player;
    if (!p.car) return;
    const inZone = [PLACES.paynsprayA, PLACES.paynsprayB].some(
      (place) => dist(p.x, p.y, place.x, place.y) < 64,
    );
    if (inZone && state.paynsprayArmed && state.money >= ECONOMY.paynspray
      && (state.heat > 0 || p.car.health < CAR.health)) {
      state.money -= ECONOMY.paynspray;
      state.heat = 0;
      p.car.health = CAR.health;
      state.paynsprayArmed = false;
      toast(`Resprayed for $${ECONOMY.paynspray} — heat gone, car fixed.`, 3);
      audio.cash();
      spawnParticles(p.car.x, p.car.y, 16, '#7dd87d', 140);
    }
    if (!inZone) state.paynsprayArmed = true;
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.skid.length - 1; i >= 0; i -= 1) {
      state.skid[i].life -= dt;
      if (state.skid[i].life <= 0) state.skid.splice(i, 1);
    }
    state.shake = Math.max(0, state.shake - dt * 22);
  }

  function updateCamera(dt) {
    const p = playerPos();
    const look = 0.22;
    const tx = p.x + Math.cos(p.angle) * (p.speed || 0) * look;
    const ty = p.y + Math.sin(p.angle) * (p.speed || 0) * look;
    state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);
    state.camera.x = Math.max(FIELD.width / 2, Math.min(WORLD.width - FIELD.width / 2, state.camera.x));
    state.camera.y = Math.max(FIELD.height / 2, Math.min(WORLD.height - FIELD.height / 2, state.camera.y));
  }

  // -- autopilot (used by the screenshot stager and the demo) -----------
  // Steer a car toward (tx, ty): returns { drive, steer }. Drive is a
  // target-speed cruise: slow for corners and for arriving, fast on
  // straights — and it never holds reverse, because reversing into the
  // car behind is how pile-ups start.
  function driveTo(car, tx, ty) {
    const d = dist(car.x, car.y, tx, ty);
    const want = angleTo(car.x, car.y, tx, ty);
    const diff = angleDiff(car.angle, want);
    const turn = Math.max(-1, Math.min(1, diff * 2.2));
    let target = 260;
    if (d < 120) target = 90;
    else if (Math.abs(diff) > 0.6) target = 110;
    let drive = car.speed > target + 30 ? -1 : (car.speed < target - 20 ? 1 : 0);
    // Brake for the car straight ahead, but never reverse into the car behind.
    for (const other of state.cars) {
      if (other === car) continue;
      const od = dist(car.x, car.y, other.x, other.y);
      if (od < 70 && Math.abs(angleDiff(car.angle, angleTo(car.x, car.y, other.x, other.y))) < 0.5) {
        drive = car.speed > 60 ? -1 : 0;
        break;
      }
    }
    // Brake for a pedestrian crossing ahead, too.
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      const od = dist(car.x, car.y, ped.x, ped.y);
      if (od < 60 && Math.abs(angleDiff(car.angle, angleTo(car.x, car.y, ped.x, ped.y))) < 0.5) {
        drive = car.speed > 60 ? -1 : 0;
        break;
      }
    }
    return { drive, steer: turn };
  }
  state.driveTo = driveTo;

  // -- the step ----------------------------------------------------------
  function step(dt, move, actions, harmless) {
    let events = 0;
    state.elapsed += dt;
    state.stats.timePlayed += dt;
    if (state.bustedTimer > 0) state.bustedTimer -= dt;
    if (state.wastedTimer > 0) state.wastedTimer -= dt;

    if (!harmless) {
      if (actions & 4) tryEnterCar(); // ACTION_ENTER
      if (actions & 8) tryPunch(); // ACTION_PUNCH
      // Start the next mission at the S marker.
      const marker = nextMissionMarker(state);
      if (marker && (actions & 4) && !state.player.car
        && dist(state.player.x, state.player.y, marker.x, marker.y) < 80) {
        startMission(state, state.missionIndex);
      }
    }

    if (state.player.car) updatePlayerCar(dt, move || { x: 0, y: 0 });
    else updatePlayerOnFoot(dt, move || { x: 0, y: 0 }, false);

    updateTraffic(dt);
    updatePeds(dt);
    events |= updateCops(dt);
    if (events & (EVENT_BUSTED | EVENT_WASTED)) {
      updateCamera(dt);
      return events;
    }
    events |= updateCollisions(dt);
    if (events & EVENT_WASTED) {
      updateCamera(dt);
      return events;
    }
    updatePickups(dt);
    updatePaynspray();

    // Wanted decays when the heat is off.
    if (state.heat > 0 && state.elapsed - state.lastCrime > WANTED.decayDelay) {
      state.heat = Math.max(0, state.heat - WANTED.decayPerSec * dt);
    }

    // Missions.
    if (state.mission && !harmless) {
      const result = updateMission(state, dt);
      if (result === 'done') events |= EVENT_MISSION_DONE;
      else if (result === 'failed') events |= EVENT_MISSION_FAIL;
    }
    state.missionMarker = state.mission
      ? state.mission.markers[0] || null
      : nextMissionMarker(state);

    updateParticles(dt);
    updateCamera(dt);
    return events;
  }

  reset();
  return {
    state, reset, step,
    toast, say, addHeat, stars,
    bustPlayer, wastePlayer,
    driveTo, playerPos,
  };
}
