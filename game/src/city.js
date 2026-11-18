// The city of Port Solara: a road grid, blocks full of buildings and a
// couple of parks, plus every named place the game needs. All layout is
// derived from the seeded RNG, so a fixed seed builds the same city.
import { BLOCK, COLORS, ROAD_HALF, ROAD_X, ROAD_Y, WORLD } from './config.js';

export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  // Blocks sit between neighbouring roads; the outer rim is grass/water.
  for (let ix = 0; ix < ROAD_X.length - 1; ix += 1) {
    for (let iy = 0; iy < ROAD_Y.length - 1; iy += 1) {
      const x0 = ROAD_X[ix] + ROAD_HALF + 16;
      const x1 = ROAD_X[ix + 1] - ROAD_HALF - 16;
      const y0 = ROAD_Y[iy] + ROAD_HALF + 16;
      const y1 = ROAD_Y[iy + 1] - ROAD_HALF - 16;
      if (rng.chance(0.12)) {
        // Park block: grass and trees, no buildings.
        const count = rng.int(4, 8);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: rng.range(x0 + 10, x1 - 10), y: rng.range(y0 + 10, y1 - 10), r: rng.range(9, 15) });
        }
        continue;
      }
      const n = rng.int(1, 3);
      for (let b = 0; b < n; b += 1) {
        const w = rng.range(70, Math.min(190, (x1 - x0) / n - 16));
        const h = rng.range(60, Math.min(150, y1 - y0 - 24));
        const x = rng.range(x0, x1 - w);
        const y = rng.range(y0, y1 - h);
        const rect = { x, y, w, h, color: rng.pick(COLORS.buildingRoof) };
        // Never overlap an earlier building in this block.
        let ok = true;
        for (const other of buildings) {
          if (rect.x < other.x + other.w + 8 && rect.x + rect.w + 8 > other.x
            && rect.y < other.y + other.h + 8 && rect.y + rect.h + 8 > other.y) { ok = false; break; }
        }
        if (ok) buildings.push(rect);
      }
    }
  }
  return { buildings, trees };
}

// Is (x, y) on a road (drivable / walkable) rather than inside a block?
export function onRoad(x, y) {
  const inX = ROAD_X.some((rx) => Math.abs(x - rx) <= ROAD_HALF);
  const inY = ROAD_Y.some((ry) => Math.abs(y - ry) <= ROAD_HALF);
  return inX || inY;
}

// Nearest point on the road network to (x, y): snap to the closest road.
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROAD_X) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: Math.max(0, Math.min(WORLD.height, y)) }; }
  }
  for (const ry of ROAD_Y) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: Math.max(0, Math.min(WORLD.width, x)), y: ry }; }
  }
  return best;
}

export function nearestIntersection(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROAD_X) {
    for (const ry of ROAD_Y) {
      const d = (x - rx) * (x - rx) + (y - ry) * (y - ry);
      if (d < bestD) { bestD = d; best = { x: rx, y: ry }; }
    }
  }
  return best;
}

// Push a circle (x, y, r) out of every building it overlaps. Returns true
// when a push happened. Buildings are solid for cars, peds and the player.
export function resolveBuildings(buildings, body) {
  let hit = false;
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.r * body.r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * body.r;
      body.y = cy + (dy / d) * body.r;
    } else {
      // Centre inside the building: push out along the shortest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = b.x - body.r;
      else if (m === right) body.x = b.x + b.w + body.r;
      else if (m === top) body.y = b.y - body.r;
      else body.y = b.y + b.h + body.r;
    }
  }
  return hit;
}

export function clampToWorld(body, margin) {
  body.x = Math.max(margin, Math.min(WORLD.width - margin, body.x));
  body.y = Math.max(margin, Math.min(WORLD.height - margin, body.y));
}
