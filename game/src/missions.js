// The four missions, in order. Each mission is a small state machine
// living in world.mission: { def, step, timer, hold, drops, dropIndex,
// objective, markers }. startMission sets it up; updateMission advances
// it and returns 'done', 'failed' or null. The world owns money, heat
// and the player; missions only read them and set objectives/markers.
import { ECONOMY, MISSIONS, PLACES } from './config.js';
import { nearestRoadPoint } from './city.js';

function marker(x, y, label, color) {
  return { x, y, label, color: color || '#ffd23a' };
}

export function missionDef(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

export function startMission(world, id) {
  const def = missionDef(id);
  if (!def) return false;
  const m = {
    def, step: 0, timer: 0, hold: 0,
    drops: [], dropIndex: 0,
    objective: '', markers: [],
  };
  world.mission = m;
  if (id === 1) {
    m.objective = 'Steal a car — walk up to one and press E';
    m.markers = [];
  } else if (id === 2) {
    // Three drop points on far-apart roads.
    const spots = [
      nearestRoadPoint(2120, 200),
      nearestRoadPoint(200, 1800),
      nearestRoadPoint(2440, 1160),
    ];
    m.drops = spots.map((p) => marker(p.x, p.y, 'Drop-off'));
    m.timer = 150;
    m.objective = 'Deliver 3 packages — 2:30 on the clock';
    m.markers = [m.drops[0]];
  } else if (id === 3) {
    m.objective = 'Go to Solara Bank and grab the cash';
    m.markers = [marker(PLACES.bank.x, PLACES.bank.y, 'Solara Bank')];
  } else if (id === 4) {
    m.objective = 'Go to Solara Bank for the big score';
    m.markers = [marker(PLACES.bank.x, PLACES.bank.y, 'Solara Bank')];
  }
  world.toast(`Mission: ${def.name} — $${def.reward}`, 4);
  world.say(def.name);
  return true;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// The player's position whether on foot or driving.
function playerPos(world) {
  return world.player.car || world.player;
}

export function updateMission(world, dt) {
  const m = world.mission;
  if (!m) return null;
  const p = playerPos(world);
  const done = () => {
    world.money += m.def.reward;
    world.toast(`Mission complete: ${m.def.name}  +$${m.def.reward}`, 4);
    world.audio.jingle();
    world.mission = null;
    world.missionIndex += 1;
    world.stats.missionsDone += 1;
    if (world.missionIndex > MISSIONS.length) {
      world.toast('You own Port Solara now. Free roam!', 5);
    }
    return 'done';
  };
  const failed = (why) => {
    world.toast(`Mission failed: ${why}`, 4);
    world.audio.fail();
    world.mission = null;
    return 'failed';
  };

  if (m.def.id === 1) {
    if (m.step === 0) {
      if (world.player.car) {
        m.step = 1;
        m.objective = 'Drive to the Docks';
        m.markers = [marker(PLACES.docks.x, PLACES.docks.y, 'Docks')];
      }
    } else if (dist(p.x, p.y, PLACES.docks.x, PLACES.docks.y) < 70) {
      return done();
    }
  } else if (m.def.id === 2) {
    m.timer -= dt;
    m.objective = `Deliver package ${m.dropIndex + 1}/3 — ${Math.max(0, Math.ceil(m.timer))}s left`;
    if (m.timer <= 0) return failed('Out of time');
    const drop = m.drops[m.dropIndex];
    if (dist(p.x, p.y, drop.x, drop.y) < 70) {
      world.money += 25;
      world.audio.cash();
      world.toast(`Package ${m.dropIndex + 1}/3 delivered  +$25`, 2.5);
      m.dropIndex += 1;
      if (m.dropIndex >= m.drops.length) return done();
      m.markers = [m.drops[m.dropIndex]];
    }
  } else if (m.def.id === 3) {
    if (m.step === 0) {
      if (dist(p.x, p.y, PLACES.bank.x, PLACES.bank.y) < 70) {
        m.step = 1;
        m.timer = 1;
        m.objective = 'Grabbing the cash...';
        m.markers = [];
      }
    } else if (m.step === 1) {
      m.timer -= dt;
      if (m.timer <= 0) {
        world.money += 200;
        world.addHeat(40);
        world.toast('Cash grabbed! Lose the cops — get to the Safehouse', 4);
        m.step = 2;
        m.objective = 'Escape to the Safehouse';
        m.markers = [marker(PLACES.safehouse.x, PLACES.safehouse.y, 'Safehouse', '#7dd87d')];
      }
    } else if (dist(p.x, p.y, PLACES.safehouse.x, PLACES.safehouse.y) < 70) {
      return done();
    }
  } else if (m.def.id === 4) {
    if (m.step === 0) {
      if (dist(p.x, p.y, PLACES.bank.x, PLACES.bank.y) < 70) {
        m.step = 1;
        m.hold = 0;
        world.addHeat(55);
        world.toast('Cracking the vault — stay in the zone!', 4);
        m.markers = [marker(PLACES.bank.x, PLACES.bank.y, 'Vault', '#ff5a5a')];
      }
    } else if (m.step === 1) {
      const inZone = dist(p.x, p.y, PLACES.bank.x, PLACES.bank.y) < 90;
      if (inZone) m.hold += dt;
      m.objective = `Cracking the vault... ${Math.min(25, Math.floor(m.hold))}/25s — stay in the zone`;
      if (m.hold >= 25) {
        world.money += 400;
        world.toast('Vault open! $400 in the bag — get to the Safehouse', 4);
        m.step = 2;
        m.objective = 'Escape to the Safehouse';
        m.markers = [marker(PLACES.safehouse.x, PLACES.safehouse.y, 'Safehouse', '#7dd87d')];
      }
    } else if (dist(p.x, p.y, PLACES.safehouse.x, PLACES.safehouse.y) < 70) {
      return done();
    }
  }
  return null;
}

// The S marker where the next mission starts (at the Safehouse).
export function nextMissionMarker(world) {
  if (world.mission || world.missionIndex > MISSIONS.length) return null;
  const def = missionDef(world.missionIndex);
  if (!def) return null;
  return marker(PLACES.safehouse.x, PLACES.safehouse.y, `S: ${def.name}`, '#ffd23a');
}
