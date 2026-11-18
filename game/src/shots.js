// The screenshot scenes behind ?shot=start|drive|chase|score. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by an autopilot that drives the road grid (never
// diagonally through blocks), steals cars and runs missions, so the
// frame is what a short game really looks like and the same seed always
// gives the same frame.
import { PLACES, ROAD_X, ROAD_Y, STEP } from './config.js';
import { nearestIntersection } from './city.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const DRIVE_SECONDS = 20;
const CHASE_SECONDS = 14;
const SCORE_LIMIT_SECONDS = 120;

// Manhattan route along the road grid: from the player's nearest
// intersection to the target's nearest intersection, then the target.
function routeTo(state, tx, ty) {
  const start = nearestIntersection(state.player.x, state.player.y);
  const end = nearestIntersection(tx, ty);
  const route = [start];
  let cx = start.x;
  let cy = start.y;
  const ix = ROAD_X.indexOf(cx);
  const iy = ROAD_Y.indexOf(cy);
  const ex = ROAD_X.indexOf(end.x);
  const ey = ROAD_Y.indexOf(end.y);
  // Drive along x first, then y.
  let i = ix;
  while (i !== ex) {
    i += ex > i ? 1 : -1;
    route.push({ x: ROAD_X[i], y: cy });
    cx = ROAD_X[i];
  }
  let j = iy;
  while (j !== ey) {
    j += ey > j ? 1 : -1;
    route.push({ x: cx, y: ROAD_Y[j] });
    cy = ROAD_Y[j];
  }
  route.push({ x: tx, y: ty });
  return route;
}

function moveToward(state, tx, ty) {
  const p = state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return { x: 0, y: 0 };
  return { x: dx / d, y: dy / d };
}

function nearestCar(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// nav = { route, index } persists across steps of one scene. On foot it
// walks to the nearest car and steals it; in a car it follows the route
// waypoint by waypoint. A wrecked car is abandoned for a fresh one.
function autopilot(world, tx, ty, nav) {
  const state = world.state;
  const p = state.player;
  if (p.car) {
    if (p.car.wrecked) return { move: { x: 0, y: 0 }, actions: 4 }; // get out
    if (!nav.route || nav.tx !== tx || nav.ty !== ty) {
      nav.route = routeTo(state, tx, ty);
      nav.index = 0;
      nav.tx = tx;
      nav.ty = ty;
    }
    const wp = nav.route[Math.min(nav.index, nav.route.length - 1)];
    // Advance early so corners are taken as smooth arcs, not stops.
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < 70 && nav.index < nav.route.length - 1) {
      nav.index += 1;
    }
    const target = nav.route[Math.min(nav.index, nav.route.length - 1)];
    const cmd = world.driveTo(p.car, target.x, target.y);
    return { move: { x: cmd.steer, y: cmd.drive > 0 ? -1 : (cmd.drive < 0 ? 1 : 0) }, actions: 0 };
  }
  const car = nearestCar(state);
  if (car && Math.hypot(car.x - p.x, car.y - p.y) < 50) {
    nav.route = null;
    return { move: { x: 0, y: 0 }, actions: 4 }; // ACTION_ENTER
  }
  const target = car ? { x: car.x, y: car.y } : { x: tx, y: ty };
  return { move: moveToward(state, target.x, target.y), actions: 0 };
}

/**
 * Set `world` to the named scene (start, drive, chase or score; any
 * other name is start) and return the screen to draw over it and the
 * best haul to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'drive' && name !== 'chase' && name !== 'score') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, 0, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const nav = { route: null, index: 0, tx: 0, ty: 0 };
  if (name === 'chase') {
    // Steal a car, get the cops on our tail, then run for the Safehouse.
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      const cmd = autopilot(world, PLACES.safehouse.x, PLACES.safehouse.y, nav);
      const events = world.step(STEP, cmd.move, cmd.actions, false);
      if (events & 4 || events & 8) break; // busted / wasted
      if (state.player.car && state.heat < 40) {
        state.heat = 45;
        state.lastCrime = state.elapsed;
      }
      // Arriving at the Safehouse at speed is the shot: stop here
      // instead of idling at the door while the cops pile on.
      if (state.player.car && Math.hypot(state.player.x - PLACES.safehouse.x, state.player.y - PLACES.safehouse.y) < 160) break;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'score') {
    // Play mission 1 for real: steal a car, drive to the Docks.
    startMission(state, 1);
    for (let i = 0; i < SCORE_LIMIT_SECONDS / STEP; i += 1) {
      const cmd = autopilot(world, PLACES.docks.x, PLACES.docks.y, nav);
      const events = world.step(STEP, cmd.move, cmd.actions, false);
      if (events & 16) break; // EVENT_MISSION_DONE
      if (events & 4 || events & 8) break; // busted / wasted
    }
    return { screen: SCREEN_PLAY, best: state.money };
  }
  // drive: steal a car and cruise to the Docks.
  for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
    const cmd = autopilot(world, PLACES.docks.x, PLACES.docks.y, nav);
    const events = world.step(STEP, cmd.move, cmd.actions, false);
    if (events & 4 || events & 8) break; // busted / wasted
    // Arriving at the Docks is the shot: stop here instead of idling
    // at the door while traffic and cops pile on.
    if (state.player.car && Math.hypot(state.player.x - PLACES.docks.x, state.player.y - PLACES.docks.y) < 160) break;
  }
  return { screen: SCREEN_PLAY, best: 0 };
}
