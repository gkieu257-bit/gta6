// Drawing only: the world's state and the current screen in, pixels
// out. The camera follows the player across the 2560x1920 city; the
// 1280x720 view is scaled to fit the window and centred. Flat shapes
// and canvas text: no images, no network.
import { CAR, COLORS, FIELD, FONT, PLACES, ROAD_HALF, ROAD_X, ROAD_Y, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const MINIMAP = { x: 16, y: FIELD.height - 166, w: 200, h: 150 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function carShape(x, y, angle, color, kind) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    const l = CAR.length;
    const w = CAR.width;
    context.fillStyle = '#111';
    context.fillRect(-l / 2 - 2, -w / 2 - 2, l + 4, w + 4);
    context.fillStyle = color;
    context.fillRect(-l / 2, -w / 2, l, w);
    // Windshield + rear window.
    context.fillStyle = '#bfe3f2';
    context.fillRect(l / 2 - 14, -w / 2 + 3, 8, w - 6);
    context.fillRect(-l / 2 + 4, -w / 2 + 3, 6, w - 6);
    // Headlights / taillights.
    context.fillStyle = '#fff6b0';
    context.fillRect(l / 2 - 2, -w / 2 + 2, 2, 5);
    context.fillRect(l / 2 - 2, w / 2 - 7, 2, 5);
    context.fillStyle = '#ff3b30';
    context.fillRect(-l / 2, -w / 2 + 2, 2, 5);
    context.fillRect(-l / 2, w / 2 - 7, 2, 5);
    if (kind === 'taxi') {
      context.fillStyle = '#20242c';
      for (let i = 0; i < 4; i += 1) context.fillRect(-8 + i * 6, -w / 2 + 1, 3, 4);
    }
    context.restore();
  }

  function drawCity(state) {
    const cam = state.camera;
    const vx0 = cam.x - FIELD.width / 2 - 60;
    const vy0 = cam.y - FIELD.height / 2 - 60;
    const vx1 = cam.x + FIELD.width / 2 + 60;
    const vy1 = cam.y + FIELD.height / 2 + 60;
    // Ground.
    context.fillStyle = COLORS.grass;
    context.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    // Beach strip along the south edge.
    context.fillStyle = COLORS.sand;
    context.fillRect(vx0, WORLD.height - 44, vx1 - vx0, 44);
    context.fillStyle = COLORS.water;
    context.fillRect(vx0, WORLD.height - 18, vx1 - vx0, 18);
    // Roads.
    context.fillStyle = COLORS.road;
    for (const rx of ROAD_X) context.fillRect(rx - ROAD_HALF, 0, ROAD_HALF * 2, WORLD.height);
    for (const ry of ROAD_Y) context.fillRect(0, ry - ROAD_HALF, WORLD.width, ROAD_HALF * 2);
    // Lane dashes.
    context.fillStyle = COLORS.lane;
    for (const rx of ROAD_X) {
      for (let y = 0; y < WORLD.height; y += 56) {
        if (y > vy0 - 60 && y < vy1) context.fillRect(rx - 2, y, 4, 28);
      }
    }
    for (const ry of ROAD_Y) {
      for (let x = 0; x < WORLD.width; x += 56) {
        if (x > vx0 - 60 && x < vx1) context.fillRect(x, ry - 2, 28, 4);
      }
    }
    // Crosswalks at intersections.
    context.fillStyle = 'rgba(255,255,255,0.55)';
    for (const rx of ROAD_X) {
      for (const ry of ROAD_Y) {
        if (rx < vx0 || rx > vx1 || ry < vy0 || ry > vy1) continue;
        for (let i = -3; i <= 3; i += 1) {
          context.fillRect(rx - ROAD_HALF + 6 + i * 9, ry - ROAD_HALF - 4, 5, 8);
          context.fillRect(rx - ROAD_HALF + 6 + i * 9, ry + ROAD_HALF - 4, 5, 8);
        }
      }
    }
    // Parks (tree clusters sit on grass already; draw the trees).
    for (const tree of state.city.trees) {
      if (tree.x < vx0 || tree.x > vx1 || tree.y < vy0 || tree.y > vy1) continue;
      circle(tree.x, tree.y, tree.r, '#2f6b2a');
      circle(tree.x - 3, tree.y - 3, tree.r * 0.55, '#4c8a3e');
    }
    // Buildings.
    for (const b of state.city.buildings) {
      if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
      context.fillStyle = COLORS.buildingEdge;
      context.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,255,255,0.25)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          context.fillRect(b.x + 8 + c * 26, b.y + 8 + r * 26, 10, 8);
        }
      }
    }
    // Skid marks.
    context.fillStyle = 'rgba(20,20,20,0.35)';
    for (const s of state.skid) {
      context.save();
      context.translate(s.x, s.y);
      context.rotate(s.angle);
      context.fillRect(-16, -9, 32, 3);
      context.fillRect(-16, 6, 32, 3);
      context.restore();
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const r = 11 + Math.sin(pk.bob) * 2;
      circle(pk.x, pk.y, r + 3, 'rgba(125,216,125,0.35)');
      circle(pk.x, pk.y, r, '#2fae4e');
      text('$', pk.x, pk.y + 6, 16, '#fff', 'center', 'alphabetic');
    }
  }

  function drawMarkers(state) {
    const marker = state.missionMarker;
    if (!marker) return;
    const pulse = 26 + Math.sin(state.elapsed * 4) * 5;
    context.strokeStyle = marker.color;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(marker.x, marker.y, pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = marker.color;
    context.beginPath();
    context.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
    context.fill();
    text(marker.label, marker.x, marker.y - pulse - 8, 15, '#fff', 'center');
  }

  function drawPlaces(state) {
    // Pay 'n' Spray booths.
    for (const key of ['paynsprayA', 'paynsprayB']) {
      const place = PLACES[key];
      context.fillStyle = '#2f6fb2';
      context.fillRect(place.x - 26, place.y - 18, 52, 36);
      context.fillStyle = '#fff';
      context.fillRect(place.x - 20, place.y - 12, 40, 24);
      text('P', place.x, place.y + 7, 18, '#2f6fb2', 'center');
    }
    // Safehouse.
    const sh = PLACES.safehouse;
    context.fillStyle = '#2fae4e';
    context.fillRect(sh.x - 30, sh.y - 20, 60, 40);
    text('HOME', sh.x, sh.y + 5, 13, '#fff', 'center');
  }

  function drawPeds(state) {
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        context.fillStyle = ped.color;
        context.beginPath();
        context.ellipse(ped.x, ped.y, 14, 7, ped.angle, 0, Math.PI * 2);
        context.fill();
        text('✦', ped.x, ped.y - 14, 14, '#ffd23a', 'center');
        continue;
      }
      circle(ped.x, ped.y, ped.r, ped.color);
      circle(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 5, '#f2c9a0');
    }
    for (const cop of state.cops) {
      if (cop.state === 'down') {
        context.fillStyle = '#20242c';
        context.beginPath();
        context.ellipse(cop.x, cop.y, 14, 7, cop.angle, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      circle(cop.x, cop.y, cop.r, '#20242c');
      circle(cop.x, cop.y - 4, 6, '#2f6fb2');
    }
  }

  function drawCars(state) {
    const p = state.player;
    for (const car of state.cars) {
      if (car === p.car) {
        // White ring marks the player's car.
        context.strokeStyle = 'rgba(255,255,255,0.8)';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(car.x, car.y, 34, 0, Math.PI * 2);
        context.stroke();
      }
      const color = car.wrecked ? '#555' : car.color;
      carShape(car.x, car.y, car.angle, color, car.kind);
      if (car.driver === 'cop') {
        const flash = Math.floor(state.elapsed * 4) % 2 === 0;
        circle(car.x - Math.cos(car.angle) * 6, car.y - Math.sin(car.angle) * 6, 5, flash ? '#ff3b30' : '#3b82ff');
      }
      if (car.wrecked) {
        context.fillStyle = 'rgba(120,120,120,0.5)';
        context.beginPath();
        context.arc(car.x + 8, car.y - 10, 10, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.car) return; // the car drawing covers it
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0) return; // blink
    circle(p.x, p.y, p.r, '#e8e8e8');
    circle(p.x, p.y, p.r - 5, '#2f6fb2');
    // Facing nose.
    context.fillStyle = '#ffd23a';
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * (p.r + 4), p.y + Math.sin(p.angle) * (p.r + 4), 4, 0, Math.PI * 2);
    context.fill();
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      circle(pt.x, pt.y, pt.size, pt.color);
    }
    context.globalAlpha = 1;
  }

  function drawMinimap(state) {
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    const mx = (x) => MINIMAP.x + x * sx;
    const my = (y) => MINIMAP.y + y * sy;
    context.fillStyle = 'rgba(10,14,20,0.85)';
    context.fillRect(MINIMAP.x - 4, MINIMAP.y - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    context.fillStyle = '#1d2b1d';
    context.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    context.strokeStyle = '#5a5f68';
    context.lineWidth = 1.5;
    for (const rx of ROAD_X) {
      context.beginPath();
      context.moveTo(mx(rx), MINIMAP.y);
      context.lineTo(mx(rx), MINIMAP.y + MINIMAP.h);
      context.stroke();
    }
    for (const ry of ROAD_Y) {
      context.beginPath();
      context.moveTo(MINIMAP.x, my(ry));
      context.lineTo(MINIMAP.x + MINIMAP.w, my(ry));
      context.stroke();
    }
    const blip = (x, y, color, r) => circle(mx(x), my(y), r || 3.5, color);
    blip(PLACES.safehouse.x, PLACES.safehouse.y, '#2fae4e');
    blip(PLACES.bank.x, PLACES.bank.y, '#ff5a5a');
    if (state.missionMarker) blip(state.missionMarker.x, state.missionMarker.y, '#ffd23a', 4.5);
    for (const car of state.cars) if (car.driver === 'cop') blip(car.x, car.y, '#3b82ff', 3);
    const p = state.player.car || state.player;
    // View rectangle.
    context.strokeStyle = 'rgba(255,255,255,0.5)';
    context.strokeRect(mx(state.camera.x - FIELD.width / 2), my(state.camera.y - FIELD.height / 2), FIELD.width * sx, FIELD.height * sy);
    blip(p.x, p.y, '#fff', 4.5);
  }

  function drawHud(state, screen) {
    const p = state.player;
    // Money + health, top left.
    context.fillStyle = 'rgba(10,14,20,0.7)';
    context.fillRect(12, 12, 220, 64);
    text(`$${state.money}`, 24, 40, 26, '#7dd87d', 'left');
    context.fillStyle = '#333';
    context.fillRect(24, 50, 180, 12);
    context.fillStyle = p.health > 40 ? '#2fae4e' : '#ff5a5a';
    context.fillRect(24, 50, 180 * Math.max(0, p.health / 100), 12);
    text('HP', 210, 62, 11, '#fff', 'right');
    // Wanted stars, top right.
    const n = state.stars();
    for (let i = 0; i < 5; i += 1) {
      text('★', FIELD.width - 24 - i * 34, 44, 30, i < n ? '#ffd23a' : 'rgba(255,255,255,0.25)', 'right');
    }
    // Objective, top centre.
    const objective = state.mission ? state.mission.objective
      : (state.missionIndex > 4 ? 'Free roam — you own Port Solara'
        : 'Go to the yellow S marker at the Safehouse to start a mission');
    text(objective, FIELD.width / 2, 36, 18, '#fff', 'center');
    if (state.mission && state.mission.def.id === 4 && state.mission.step === 1) {
      const frac = Math.min(1, state.mission.hold / 25);
      context.fillStyle = '#333';
      context.fillRect(FIELD.width / 2 - 120, 48, 240, 10);
      context.fillStyle = '#ff5a5a';
      context.fillRect(FIELD.width / 2 - 120, 48, 240 * frac, 10);
    }
    // Speed + car health, bottom right.
    if (p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.12);
      text(`${mph} mph`, FIELD.width - 24, FIELD.height - 24, 26, '#fff', 'right');
      context.fillStyle = '#333';
      context.fillRect(FIELD.width - 204, FIELD.height - 52, 180, 10);
      context.fillStyle = p.car.health > 40 ? '#2fae4e' : '#ff5a5a';
      context.fillRect(FIELD.width - 204, FIELD.height - 52, 180 * Math.max(0, p.car.health / 100), 10);
      text('CAR', FIELD.width - 208, FIELD.height - 42, 11, '#fff', 'right');
    }
    // Toast.
    if (state.toastText && state.elapsed < state.toastUntil) {
      const alpha = Math.min(1, (state.toastUntil - state.elapsed) / 0.5);
      context.globalAlpha = alpha;
      context.fillStyle = 'rgba(10,14,20,0.8)';
      const w = Math.min(720, 24 + state.toastText.length * 9.5);
      context.fillRect(FIELD.width / 2 - w / 2, 64, w, 34);
      text(state.toastText, FIELD.width / 2, 88, 17, '#ffd23a', 'center');
      context.globalAlpha = 1;
    }
    drawMinimap(state);
    // Controls hint, bottom centre.
    if (screen === SCREEN_PLAY) {
      text('WASD drive / walk · E enter car · Space punch / handbrake · Shift run · Esc pause · M mute',
        FIELD.width / 2, FIELD.height - 8, 13, 'rgba(255,255,255,0.55)', 'center');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34 + 70;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(12,16,24,0.92)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || '#ffd23a';
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 72, 44, accent || '#ffd23a', 'center');
    lines.forEach((line, i) => {
      text(line, FIELD.width / 2, y + 128 + i * 34, 19, '#cfd6e0', 'center');
    });
    text(prompt, FIELD.width / 2, y + height - 34, 20, '#ffd23a', 'center');
  }

  function drawEdgeArrow(state) {
    const marker = state.missionMarker;
    if (!marker) return;
    const cam = state.camera;
    const dx = marker.x - cam.x;
    const dy = marker.y - cam.y;
    if (Math.abs(dx) < FIELD.width / 2 - 40 && Math.abs(dy) < FIELD.height / 2 - 40) return;
    const a = Math.atan2(dy, dx);
    const ax = FIELD.width / 2 + Math.cos(a) * (FIELD.width / 2 - 60);
    const ay = FIELD.height / 2 + Math.sin(a) * (FIELD.height / 2 - 60);
    context.save();
    context.translate(ax, ay);
    context.rotate(a);
    context.fillStyle = '#ffd23a';
    context.beginPath();
    context.moveTo(18, 0);
    context.lineTo(-10, -12);
    context.lineTo(-10, 12);
    context.closePath();
    context.fill();
    context.restore();
  }

  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0e14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // World transform: camera centred, plus a shake offset.
    const shakeX = state.shake > 0 ? Math.sin(state.elapsed * 91) * state.shake : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.elapsed * 113) * state.shake : 0;
    const ox = view.x + FIELD.width / 2 * view.scale - state.camera.x * view.scale + shakeX * view.scale;
    const oy = view.y + FIELD.height / 2 * view.scale - state.camera.y * view.scale + shakeY * view.scale;
    context.setTransform(view.scale, 0, 0, view.scale, ox, oy);
    drawCity(state);
    drawPlaces(state);
    drawPickups(state);
    drawMarkers(state);
    drawCars(state);
    drawPeds(state);
    drawPlayer(state);
    drawParticles(state);
    // Screen space from here.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawEdgeArrow(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLARA HEAT', [
        'An open-world crime game in Port Solara.',
        'Steal cars, outrun the cops, run four missions',
        'and become the king of the city.',
        `Best haul: $${best}`,
      ], 'Press Enter to start  ·  WASD move · E enter car', '#ffd23a');
      return;
    }
    drawHud(state, screen);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.'], 'Press Esc or Enter to resume', '#7dd87d');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solara PD caught up with you.', `Fine paid. $${state.money} left.`], '', '#ff5a5a');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['You woke up at the hospital.', `Bill paid. $${state.money} left.`], '', '#ff5a5a');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
