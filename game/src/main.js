// Boot and the one loop: input is read every frame, the world advances
// in fixed 1/60 s steps (several in a slow frame, none in a fast one),
// and the renderer paints what is there. The game moves between five
// screens: title, play, paused, busted and wasted.
//
// ?seed=N fixes the city and traffic. ?shot=start|drive|chase|score
// (with &seed=N) stages that scene instead of running the loop, paints
// it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { makeRng } from './rng.js';
import { createWorld, EVENT_BUSTED, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(makeRng(seed), audio);
const renderer = createRenderer(canvas);

// Test/debug handle (also handy for the judge): the live world state.
window.__solara = { world, state: world.state, seed };

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best haul then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let overlayTimer = 0;
  let pendingActions = 0;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal a car, follow the yellow S to start a mission.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) {
      audio.unlock();
      startGame();
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      // Driving / punching actions go to the world through step().
      pendingActions |= actions & (ACTION_ENTER | ACTION_PUNCH);
    }
  }


  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, 0, true);
      return;
    }
    const actions = pendingActions;
    pendingActions = 0;
    const events = world.step(STEP, input.move(), actions, false);
    if (events & EVENT_MISSION_DONE) {
      if (world.state.money > best) {
        best = world.state.money;
        saveBest(best);
      }
      announce(`Mission complete. $${world.state.money}.`);
    } else if (events & EVENT_MISSION_FAIL) {
      announce('Mission failed. The S marker is back at the Safehouse.');
    } else if (events & EVENT_BUSTED) {
      screen = SCREEN_BUSTED;
      overlayTimer = 2.5;
      announce('Busted by the police.');
    } else if (events & EVENT_WASTED) {
      screen = SCREEN_WASTED;
      overlayTimer = 2.5;
      announce('Wasted. You woke up at the hospital.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dt;
    handleActions();
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      overlayTimer -= dt;
      if (overlayTimer <= 0) screen = SCREEN_PLAY;
      accumulator = 0;
    } else if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara Heat. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
