// Cars and pedestrians: plain data plus the arcade physics. The world
// owns the lists; this file only knows how one car drives and how two
// circles bounce off each other.
import { CAR, CAR_KINDS } from './config.js';

let nextId = 1;

export function makeCar(x, y, angle, kind, rng) {
  const spec = CAR_KINDS[kind] || CAR_KINDS.sedan;
  return {
    id: nextId,
    kind,
    x, y,
    angle,
    speed: 0,
    color: kind === 'taxi' ? spec.color : (rng ? pickShade(rng, spec.color) : spec.color),
    maxSpeed: spec.maxSpeed,
    accel: spec.accel,
    health: CAR.health,
    driver: kind === 'cop' ? 'cop' : null, // 'cop' | 'civilian' | null (parked)
    wrecked: false,
    brakeLight: false,
    r: CAR.radius,
  };
}

function pickShade(rng, base) {
  // Slight per-car tint so traffic does not look cloned.
  const shades = [base, base, base, '#d8d8d8', '#3a3f47', '#8a4a3a'];
  return rng.pick(shades);
}

export function makePed(x, y, rng) {
  const colors = ['#d66', '#6ad', '#ad6', '#da6', '#a7d', '#6dd'];
  return {
    id: nextId,
    x, y,
    angle: rng ? rng.range(0, Math.PI * 2) : 0,
    speed: 0,
    color: rng ? rng.pick(colors) : '#d66',
    state: 'walk', // walk | flee | down
    downTimer: 0,
    fleeTimer: 0,
    target: null,
    r: 11,
  };
}

/**
 * One step of arcade car physics. `drive` is -1 (reverse/brake), 0, 1
 * (accelerate); `steer` is -1..1. Returns the distance travelled, for
 * skid/exhaust effects.
 */
export function stepCar(car, drive, steer, dt) {
  if (car.wrecked) {
    car.speed *= Math.max(0, 1 - 3 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    return Math.abs(car.speed) * dt;
  }
  if (drive > 0) car.speed += car.accel * dt;
  else if (drive < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverseMax, car.speed - car.accel * 0.6 * dt);
  } else {
    car.speed *= Math.max(0, 1 - 0.9 * dt);
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = Math.max(-CAR.reverseMax, Math.min(car.maxSpeed, car.speed));
  const grip = Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  car.angle += steer * CAR.steer * grip * Math.sign(car.speed || 1) * dt;
  const moved = car.speed * dt;
  car.x += Math.cos(car.angle) * moved;
  car.y += Math.sin(car.angle) * moved;
  return Math.abs(moved);
}

// Push two circles apart and swap a little speed along the impact line.
// Returns the impact speed (0 when they were not touching).
export function collideCircles(a, b, aSpeed, bSpeed) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const push = (min - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const impact = Math.abs(aSpeed - bSpeed);
  return impact;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Smallest signed turn from `from` to `to`, in (-PI, PI].
export function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
