// ProTanki New Supplies UI - cosmetic only.
// 1) Swaps the supply <img> files (40x40) for old-style icons in /icons.
// 2) Old-HUD look for running supplies: the tile turns the supply's colour and drains while
//    the effect runs, then a dark cooldown cover runs off (all drawn from our own clock).
// 3) Supply counts redrawn as text, centered supplies panel.
//
// All timings come from the game itself: net.js listens to the same server packets the game
// uses (supply used + its cooldown, effect started on your tank + its duration, effect
// ended, your tank died / respawned) and passes them here as 'ptk:net' events.
// (Count / key-hint positions and the look of every state are in hud.css.)

const CENTER_PANEL = true; // set to false to leave the panel where the game puts it

// ---- options (edit here) ----
const SOUND_ENABLED = true;  // supply sounds (on / off / ready / not ready)
const SOUND_VOLUME  = 100;   // 0-100, on top of the game's own volume
const GLOW = true;           // colour flash on the tile (effect starts, mine laid, supply ready again)
const BEAM = true;           // coloured light beam out of the tile when a supply is ready again
const MINE_BEAM_DELAY = 150; // ms: when a mine has NO cooldown (parkour) the beam starts this long after the flash
const MINE_SYMBOL_FLASH = true; // the mine's symbol flashes with the tile flash when a mine is laid (needs icons/mine_fg.png)
const DEBUG = false;         // timing messages in the console
const OWN_COUNT = false;     // true = draw the counts ourselves (hud.css --count-*); false = keep the game's own numbers (hud.css --count-canvas-shadow)
const SELF_CHECK = true;     // once per page: a console line saying whether everything the extension relies on was found
const dbg = (...a) => { if (DEBUG) console.log('[New Supplies]', ...a); };

// ---------- SAFE MODE (protection against game updates) ----------
// If the extension starts throwing errors, or the self-check finds that the game's supply pictures
// are not recognised any more, it switches itself off: the game's own pictures are put back, our
// layers are removed, and hud.css stops applying (all its rules need html:not([data-ptk-off])).
// The game then looks exactly as the game made it - never a half-broken bar. It switches on again
// by itself when a new battle starts (a new supplies bar), and decides again.
let SAFE = false;
const errorTimes = [];
function fail(where, err) {
  const now = performance.now();
  errorTimes.push(now);
  while (errorTimes.length && now - errorTimes[0] > 10000) errorTimes.shift();
  if (errorTimes.length === 1) console.warn('[New Supplies] error in ' + where, err);
  if (errorTimes.length >= 20) enterSafeMode('too many errors (last: ' + where + ')');
}
function guard(where, fn) {
  return function () { if (SAFE) return; try { return fn.apply(this, arguments); } catch (e) { fail(where, e); } };
}
function enterSafeMode(reason) {
  if (SAFE) return;
  SAFE = true;
  document.documentElement.setAttribute('data-ptk-off', '1');
  console.warn('[New Supplies] SAFE MODE - the game looks as the game made it. Reason: ' + reason);
  try {
    document.querySelectorAll('img[data-ptk-orig]').forEach(i => i.setAttribute('src', i.dataset.ptkOrig));
    document.querySelectorAll('.ptk-cover,.ptk-cd-fg,.ptk-fill,.ptk-lo,.ptk-hi,.ptk-beam,.ptk-sym,.ptk-count').forEach(e => e.remove());
    document.querySelectorAll('[data-ptk]').forEach(e => { delete e.dataset.ptk; e.style.removeProperty('--ptk-splash'); });
    const p = document.querySelector('.inventory-panel');
    if (p) p.style.translate = '';
  } catch (e) { /* ignore */ }
}
function leaveSafeMode() {
  if (!SAFE) return;
  SAFE = false;
  errorTimes.length = 0;
  document.documentElement.removeAttribute('data-ptk-off');
  scan(document); updateAll(); queueCenter();
}

const BASE = chrome.runtime.getURL('icons/');

// ---------- where the game's elements are ----------
// Every name the extension relies on in the game's page is listed here. After a game update that
// renames something, change it here (hud.css uses the same class names; there they have to be
// changed by hand). The self-check below tells you in the console which of them were not found.
const SEL = {
  panel:    '.inventory-panel',               // the supplies bar
  panelTag: 'app-inventory-panel',            // the game's element around it (a new bar = a new battle)
  slotTag:  'app-inventory-slot',             // the game's element of one slot
  slot:     '.inventory-slot',                // one slot (the slots are what gets centred)
  tile:     '.inventory-slot-content',        // the 40x40 tile inside a slot
  icon:     'img.inventory-icon',             // the supply picture
  cooldown: 'svg.cooldown-mask',              // the game's cooldown sweep
  count:    'flash-label.quantity-label canvas', // the count the game draws
};
SEL.tiles = SEL.panel + ' ' + SEL.tile;       // every tile in the bar
const FLASH_FILTER = /inventory-slot-flash/;  // the game's own tile flash (a CSS filter on the tile)

// ---------- icons ----------
// The game moved the supply pictures from /inventory/<name>.png to /inventory/icons/<name>.svg,
// so both places and both file types are accepted. If a picture in /inventory/icons/ has a name
// that none of these rules knows, the supply is taken from the slot's position instead
// (1 first aid, 2 double armor, 3 double damage, 4 speed boost, 5 mine - the same order as the keys).
const RULES = [
  { match: /\/inventory\/(?:icons\/)?medkit\.(?:png|svg)/i, icon: 'repair' }, // first aid
  { match: /\/inventory\/(?:icons\/)?armor\.(?:png|svg)/i,  icon: 'armor'  }, // double armor
  { match: /\/inventory\/(?:icons\/)?damage\.(?:png|svg)/i, icon: 'damage' }, // double damage
  { match: /\/inventory\/(?:icons\/)?(?:n2o|nitro|speed|boost)\.(?:png|svg)/i, icon: 'speed' }, // boost
  { match: /\/inventory\/(?:icons\/)?mine\.(?:png|svg)/i,   icon: 'mine'   }, // mine
];
const POSITION_ICONS = ['repair', 'armor', 'damage', 'speed', 'mine'];

function matchIcon(src, img) {
  const r = RULES.find(r => r.match.test(src));
  if (r) return r.icon;
  if (img && img.classList && img.matches(SEL.icon) && /\/inventory\/icons\//i.test(src)) {
    const slot = img.closest(SEL.slotTag);
    const slots = slot && slot.parentElement
      ? [...slot.parentElement.children].filter(e => e.tagName === SEL.slotTag.toUpperCase()) : [];
    return POSITION_ICONS[slots.indexOf(slot)];
  }
  return undefined;
}

function swap(img) {
  if (SAFE || img.dataset.ptkBroken) return;
  const src = img.getAttribute('src') || '';
  if (!src || src.startsWith(BASE)) return;
  const icon = matchIcon(src, img);
  if (icon) {
    img.dataset.ptkOrig = src;               // (put back by safe mode / if our picture is missing)
    img.dataset.ptk = icon;
    img.setAttribute('src', BASE + icon + '.png');
    updateSlot(img.closest(SEL.tile));
  }
}

// One of OUR pictures failed to load (file missing / renamed): hand that slot back to the game's own picture.
document.addEventListener('error', e => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !img.dataset || !img.dataset.ptkOrig) return;
  if (!(img.getAttribute('src') || '').startsWith(BASE)) return;
  console.warn('[New Supplies] picture missing, using the game\'s own:', (img.getAttribute('src') || '').split('/').pop());
  img.dataset.ptkBroken = '1';
  delete img.dataset.ptk;
  img.setAttribute('src', img.dataset.ptkOrig);
}, true);

function scan(root) {
  if (root.tagName === 'IMG') swap(root);
  if (root.querySelectorAll) root.querySelectorAll('img').forEach(swap);
}

// ---------- running supplies (from the game's own packets) ----------
// Slot / effect ids used by the game: 1 repair, 2 armor, 3 damage, 4 speed (5 mine).
// The mine has no effect, so it keeps the game's own sweep for its cooldown.
const SLOT_ICON = { 1: 'repair', 2: 'armor', 3: 'damage', 4: 'speed' };
const NO_COLOUR = new Set(['mine']);
const FULL_TILE = 36 * 36;
const RESET_ON_SPAWN = 75000;  // the game clears cooldowns up to this long when you respawn

// Supplies that show a *_tile.png background with a dark cooldown cover underneath a
// greyed-out *_fg.png symbol on top while they cool down (or are locked).
const TILE_CD_ICONS = new Set(['armor', 'damage', 'speed', 'repair']);
// The mine gets the same look (dark tile + grey symbol while cooling down) only if icons/mine_fg.png
// (the white symbol alone) exists; without it the mine keeps its old look. The background without
// a symbol is borrowed from another supply (TILE_FILE below), so no mine_tile.png is needed.
const TILE_FILE = { mine: 'armor' };       // supply -> whose *_tile.png it uses (default: its own)
let MINE_FG = false;   // true once icons/mine_fg.png is known to exist
Promise.all(['mine_fg'].map(n => new Promise(res => {
  const i = new Image();
  i.onload = () => res(true); i.onerror = () => res(false);
  i.src = BASE + n + '.png';
}))).then(ok => { if (ok.every(Boolean)) { MINE_FG = true; TILE_CD_ICONS.add('mine'); updateAll(); } });

// Right after you use a supply, the game's "used" message comes a moment BEFORE the "effect
// started" message. During that gap we show the start of the effect (full colour, nothing
// drained yet) instead of a dark cooldown square for a frame or two.
const EFFECT_WAIT_MS = 500;

// The coloured symbol layers (.ptk-lo / .ptk-hi) are CSS masks. A mask picture that is not loaded
// yet is simply NOT applied by the browser, so the layer shows as a full coloured square for a
// frame or two. So: load + decode every symbol first, and keep those layers hidden until then.
const MASK_READY = new Set();
for (const n of ['repair', 'armor', 'damage', 'speed']) {
  const i = new Image();
  new Promise((res, rej) => { i.onload = res; i.onerror = rej; })
    .then(() => (i.decode ? i.decode().catch(() => {}) : null))
    .then(() => { MASK_READY.add(n); updateAll(); })
    .catch(() => {});
  i.src = BASE + n + '_fg.png';
  new Image().src = BASE + n + '_tile.png';      // (swapped in while the effect runs, so no blank frame)
}
new Image().src = chrome.runtime.getURL('fx/pillar_top.png');   // (the beam's mask, same reason)

// Repair kit picked up from a box: same look as a normal repair kit, this many times faster.
const BOX_REPAIR_SPEEDUP = 2;
const NORMAL_REPAIR_FALLBACK_MS = 10000;   // used only if your supplies list did not tell the normal length
const normalDur = {};                      // icon -> effect length of the last NORMAL activation (what the circle used)

// ---- symbol blink (start) ----
// The supply symbol blinks exactly like the game's own indicator on the tank. This is a port of
// the game's blinker: the value swings between 0.2 and 1 (fast ramp, then a hold), and after each
// swing the interval is shortened (300, 270, 240 ... down to 20 ms). Armor / damage / speed start
// in the last 3 seconds of the effect; the repair kit blinks the whole time at a constant 300 ms.
const SYMBOL_BLINK = true;                 // false = symbols never blink
const REPAIR_LIKE_INDICATOR = true;        // true = repair symbol blinks like its indicator; false = the old slow flicker
const BLINK_CFG = {
  // min = how faint the symbol gets at the bottom of a blink (0 = it disappears for a moment)
  armor:  { window: 3000,   step: 30, min: 0 },
  damage: { window: 3000,   step: 30, min: 0 },
  speed:  { window: 3000,   step: 30, min: 0 },
  repair: { window: 100000, step: 0,  min: 0.2 },
};
const BLINK_INTERVAL = 300, BLINK_MIN_INTERVAL = 20, BLINK_MAX = 1, BLINK_RATE = 10;
function blinkSpeed(b, dir) { return dir * BLINK_RATE * (BLINK_MAX - b.min) / b.interval; }
function symbolBlink(icon, left, now) {      // -> opacity of the symbol right now
  const cfg = BLINK_CFG[icon], r = runs[icon];
  if (!cfg || !r || left > cfg.window) return 1;
  let b = r.blink;
  if (!b) {                                  // (the blinker's init)
    b = r.blink = { value: BLINK_MAX, interval: BLINK_INTERVAL, min: cfg.min, speed: 0, next: 0, last: now };
    b.speed = blinkSpeed(b, -1);
    b.next = now + b.interval;
    return b.value;
  }
  const dt = Math.min(Math.max(now - b.last, 0), 100);
  b.last = now;
  b.value = Math.min(BLINK_MAX, Math.max(b.min, b.value + b.speed * dt));
  if (now >= b.next) {                       // (the blinker's update)
    b.interval = Math.max(BLINK_MIN_INTERVAL, b.interval - cfg.step);
    b.next = now + b.interval;
    b.speed = blinkSpeed(b, b.speed < 0 ? 1 : -1);
  }
  return b.value;
}
// ---- symbol blink (end) ----

// Repair kit: while it heals, the symbol flickers (one full blink per this many ms).
// Needs the symbol-free background (repair_tile.png) under it, so no white symbol shines through.
const REPAIR_BLINK_MS = 1200;

// icon -> { usedAt, cooldown, effStart, effDur, effEnd } (ms, performance.now() time)
const runs = {};
// slot -> { effect, rest } from your supplies list, used if a packet lacks a time
const config = {};
// slot -> how many of that supply you have (from your supplies list, minus one per use)
const counts = {};
// message types that net.js has passed on so far (for the self-check)
const netSeen = {};
const SLOT_OF_ICON = { repair: 1, armor: 2, damage: 3, speed: 4, mine: 5 };

function onNet(e) {
  let m;
  try { m = JSON.parse(e.detail); } catch (err) { return; }
  netSeen[m.t] = true;
  if (m.t === 'inventory') {
    Object.assign(config, m.items);
    for (const [slot, it] of Object.entries(m.items)) if (it && typeof it.count === 'number') counts[slot] = it.count;
  }
  if (m.t === 'used' && counts[m.slot] > 0) counts[m.slot]--;
  const icon = SLOT_ICON[m.slot];
  if (m.t === 'used') {
    const sup = SLOT_ICON[m.slot] || (m.slot === 5 ? 'mine' : null);
    dbg('used ' + sup + ', cooldown ' + (m.cooldown / 1000) + 's');
    if (sup && m.cooldown > 0) { lastReadyAt[sup] = -1e9; scheduleReady(sup, m.at + m.cooldown); }
    else if (sup === 'mine') {   // no cooldown (e.g. parkour): usable again at once -> beam after every use
      setTimeout(() => { startBeam('mine'); play('ready'); }, MINE_BEAM_DELAY);
    }
    if (m.slot === 5) startSplash('mine');
  }
  if (m.t === 'used' && icon) {
    const r = runs[icon];
    if (r && r.effStart >= 0 && Math.abs(m.at - r.effStart) < 2000) {   // effect came first
      r.usedAt = m.at; r.cooldown = m.cooldown; r.box = false; if (r.effDur > 0) normalDur[icon] = r.effDur;
    } else {
      runs[icon] = { usedAt: m.at, cooldown: m.cooldown, effStart: -1, effDur: 0, effEnd: -1 };
    }
  }
  if (m.t === 'effect' && icon) {
    // An effect you didn't start with the supply (a bonus box from the map, or the 'used'
    // message is still on its way): no cooldown of its own. If the supply is already
    // running or cooling down, its cooldown is kept and only the effect is (re)started.
    let r = runs[icon];
    const fromUse = !!r && r.effStart < 0 && r.cooldown > 0 && m.at - r.usedAt < 2000;
    // A box repair kit plays its own fixed-length picture: a repeated message from the server
    // while that picture is still running is ignored (it would restart the circle).
    const repeatOfBox = icon === 'repair' && !!r && r.box && r.effStart >= 0 && m.at < r.effStart + effectDuration(r);
    if (!repeatOfBox) {
      if (!r) r = runs[icon] = { usedAt: m.at, cooldown: 0, effStart: -1, effDur: 0, effEnd: -1 };
      r.box = icon === 'repair' && !fromUse;     // picked up from a box (a 'used' message may still follow)
      r.effStart = m.at; r.effDur = m.duration || (config[m.slot] || {}).effect || 0; r.effEnd = -1;
      r.blink = null;
      if (!r.box && r.effDur > 0) normalDur[icon] = r.effDur;
      effectSounds(icon, r.effDur - (performance.now() - m.at));
      startSplash(icon);
    }
  }
  if (m.t === 'effectEnd' && icon && runs[icon] && runs[icon].effStart >= 0 && runs[icon].effEnd < 0 && !runs[icon].box) {
    runs[icon].effEnd = m.at;
    effectEndedEarly(icon);
  }
  if (m.t === 'died') {
    for (const k of Object.keys(readyTimers)) cancelReady(k);
    cancelEffectSounds();
    for (const k of Object.keys(runs)) delete runs[k];        // the game locks every tile
  }
  if (m.t === 'spawned') {
    for (const k of Object.keys(runs)) if (runs[k].cooldown <= RESET_ON_SPAWN) { delete runs[k]; cancelReady(k); }
    armSpawn();
  }
  updateAll();
}
document.addEventListener('ptk:net', e => { try { onNet(e); } catch (err) { fail('game message', err); } });

// The supply a tile holds (our picture or the game's), or undefined.
function iconOf(img) {
  if (!img) return undefined;
  if (img.dataset.ptk) return img.dataset.ptk;
  return matchIcon(img.getAttribute('src') || '', img);
}

// ---------- a supply is ready again: sound + flash + beam ----------
// Two triggers, whichever comes first (the other is then ignored): the game's cooldown mask
// leaving the tile, and the exact cooldown end from the game's "supply used" message (checked
// against the tile, so a locked / empty tile stays quiet).
const lastReadyAt = {};
const readyTimers = {};
function readyNow(supply, why) {
  const now = performance.now();
  if (now - (lastReadyAt[supply] || -1e9) < 2500) return;
  lastReadyAt[supply] = now;
  dbg(supply + ' ready (' + why + ') - sound ' + (SOUND_ENABLED ? 'on' : 'off'));
  play('ready');
  readyEffect(supply);
}
// The game's own tile flash: the game plays it exactly when a supply becomes usable - when your
// tank becomes active after spawning (end of the ghost phase; every supply at once) and when a
// cooldown finishes. It shows as a filter on the tile (style="filter: url(#inventory-slot-flash-N)")
// for ~0.4 s, so the moment it appears is a "ready" moment too, whatever bar style is shown.
const flashWatched = new WeakSet();
const flashOn = new WeakMap();
function watchGameFlash(content) {
  if (flashWatched.has(content)) return;
  flashWatched.add(content);
  new MutationObserver(() => {
    const on = FLASH_FILTER.test(content.style.filter || '');
    if (on && !flashOn.get(content)) {
      setTimeout(() => {                         // (the unlock lands in the same update)
        const supply = iconOf(content.querySelector(SEL.icon));
        if (supply && tileUsable(content)) readyNow(supply, 'game flash');
      }, 30);
    }
    flashOn.set(content, on);
  }).observe(content, { attributes: true, attributeFilter: ['style'] });
}
function tileOf(supply) {
  for (const c of document.querySelectorAll(SEL.tiles))
    if (iconOf(c.querySelector(SEL.icon)) === supply) return c;
  return null;
}
function scheduleReady(supply, endsAt) {
  clearTimeout(readyTimers[supply]);
  const check = (tries) => {
    const tile = tileOf(supply);
    if (tile && tileUsable(tile)) readyNow(supply, 'cooldown time over');
    else if (tries > 0) readyTimers[supply] = setTimeout(() => check(tries - 1), 100);   // mask still on for a moment
    else dbg(supply + ': cooldown over but the tile is not usable (locked / none left) - no ready sound');
  };
  readyTimers[supply] = setTimeout(() => check(5), Math.max(0, endsAt - performance.now()) + 60);
}
function cancelReady(supply) { clearTimeout(readyTimers[supply]); delete readyTimers[supply]; }


// ---------- ready effect (flash + beam) and spawn ----------
function readyEffect(supply) {
  spawnFx.done.add(supply);
  startSplash(supply); startBeam(supply);
}
// After every spawn, each usable supply plays the ready effect once.
const SPAWN_WINDOW = 8000;
const spawnFx = { until: 0, done: new Set() };
function armSpawn() {
  spawnFx.until = performance.now() + SPAWN_WINDOW;
  spawnFx.done.clear();
  setTimeout(updateAll, 0);
}
// Everything we remember about the battle you were in (running supplies, cooldown timers, effects,
// sounds) is dropped when the supply bar goes away (you left the battle) or a new one appears
// (you joined another). Otherwise the old battle's cooldowns keep "running" on the new tiles.
function resetBattleState() {
  for (const k of Object.keys(readyTimers)) cancelReady(k);
  cancelEffectSounds();
  for (const o of [runs, fx, anims, lastPhase, lastReadyAt]) for (const k of Object.keys(o)) delete o[k];
  spawnFx.until = 0; spawnFx.done.clear();
}
let lastPanelEl = null;
setInterval(() => {   // the supply bar appears = first spawn of the battle
  const p = document.querySelector(SEL.panelTag);
  if (p !== lastPanelEl) {
    lastPanelEl = p;
    if (SAFE) leaveSafeMode();
    resetBattleState();
    if (p) { armSpawn(); if (SELF_CHECK && !selfCheckOk) setTimeout(selfCheck, SELF_CHECK_DELAY); }
  }
}, 250);
const lastPhase = {};   // icon -> phase seen last time

// ---------- self-check ----------
// A few seconds after the supplies bar first appears, one console line says whether everything this
// extension relies on was found: the bar, the slots, the pictures (and that they are known), the
// counts the game draws, and net.js's hook on the game's messages. After a game update that breaks
// something you see WHAT, instead of guessing. It only reads; it changes nothing. It runs again in the
// next battle until it has passed once.
const SELF_CHECK_DELAY = 4000;
let selfCheckOk = false;
function selfCheck() {
  const problems = [];
  const tiles = [...document.querySelectorAll(SEL.tiles)];
  let icons = 0, known = 0, counted = 0;
  if (!document.querySelector(SEL.panel)) problems.push('the supplies bar "' + SEL.panel + '" was not found');
  else if (!tiles.length) problems.push('no slot tiles "' + SEL.tile + '" inside the bar');
  tiles.forEach((tile, i) => {
    const img = tile.querySelector(SEL.icon);
    if (!img) return;                                   // (an empty slot is normal)
    icons++;
    if (iconOf(img)) known++;
    else problems.push('slot ' + (i + 1) + ': a supply picture this extension does not know (' + (img.getAttribute('src') || '').split('/').pop() + ')');
    const cv = tile.querySelector(SEL.count);
    if (cv && cv.getAttribute('data-ptk-text')) counted++;
  });
  if (tiles.length && !icons) problems.push('no supply pictures "' + SEL.icon + '" in the slots');
  // The counts normally come from the game's own data (net.js); the canvas is only the fallback.
  const fromData = Object.keys(counts).length > 0;
  if (icons && !counted && !fromData) problems.push('no counts from the game data and none read from "' + SEL.count + '" (the canvas hook in inject.js or that name)');
  const hooked = parseInt(document.documentElement.getAttribute('data-ptk-net'), 10) || 0;
  if (!hooked) problems.push('net.js did not join the game\'s message listeners (no cooldown timing / sounds / effect colours)');
  else if (!netSeen.inventory) problems.push('net.js is hooked but has not seen your supplies list yet (if you just reloaded the extension, refresh the page)');
  const hooks = (document.documentElement.getAttribute('data-ptk-inject') || '').split(',');
  for (const h of ['indicators', 'canvas', 'blob', 'idb', 'fetch']) {
    if (!hooks.includes(h)) problems.push('inject.js could not install its "' + h + '" hook');
  }
  if (icons && !known) enterSafeMode('none of the supply pictures is recognised (the game changed its picture names)');
  const tag = '[New Supplies] self-check:';
  if (problems.length) console.warn(tag, problems.length + ' problem(s) - the game may have been updated:\n - ' + problems.join('\n - '));
  else {
    selfCheckOk = true;
    console.log(tag, 'OK (' + tiles.length + ' slots, ' + known + ' supplies recognised, counts from ' + (fromData ? 'game data' : 'canvas') + ', ' + hooked + ' message listeners hooked)');
  }
}

// ---------- sounds ----------
// The game itself plays no sound for supplies, so the extension adds the old ones:
//   <supply>_on   effect starts on your tank (also from a bonus box)
//   <supply>_off  armor / damage / speed effect runs out (not when you die)
//   ready         a supply's cooldown has finished
//   not_ready     you pressed a supply key (or clicked a tile) that can't be used now
// Volume = the popup's volume x the game's own volume; nothing plays if the game is muted.
//
// Played with Web Audio: Chrome may refuse an <audio> element that starts on its own long
// after your last key press (the "ready" sound comes 15-75 s later), but an audio context that
// was started by any key press / click keeps playing whenever asked. <audio> is the fallback.
const SOUND_NAMES = ['repair_on', 'armor_on', 'armor_off', 'damage_on', 'damage_off',
                     'speed_on', 'speed_off', 'ready', 'not_ready'];
const SOUNDS = {};              // name -> <audio> (fallback)
const BUFFERS = {};             // name -> decoded AudioBuffer
let audioCtx = null;
try { audioCtx = new AudioContext(); } catch (e) {}
for (const name of SOUND_NAMES) {
  const url = chrome.runtime.getURL('sounds/' + name + '.mp3');
  const a = new Audio(url);
  a.preload = 'auto';
  SOUNDS[name] = a;
  if (audioCtx) fetch(url).then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b))
    .then(buf => { BUFFERS[name] = buf; }).catch(e => console.warn('[New Supplies] sound', name, e));
}
const unlockAudio = () => { if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => {}); };
for (const ev of ['keydown', 'mousedown', 'pointerdown', 'touchstart']) document.addEventListener(ev, unlockAudio, true);
// The game's settings (volume, mute, key bindings), as the game saved them.
function gameSettings() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const v = JSON.parse(store.getItem(store === localStorage ? 'pt.settings' : 'pt.settings.session'));
      if (v && typeof v === 'object') return v;
    } catch (e) {}
  }
  return {};
}
const lastPlayed = {};
function play(name) {
  const base = SOUNDS[name];
  if (!base || !SOUND_ENABLED) return;
  // the same sound for several supplies at once (e.g. all of them ready when you spawn): once
  const t = performance.now();
  if (t - (lastPlayed[name] || -1e9) < 120) return;
  lastPlayed[name] = t;
  const g = gameSettings();
  if (g.muted) return;
  const gameVolume = typeof g.volume === 'number' ? g.volume : 0.65;   // the game's default
  const volume = Math.max(0, Math.min(1, SOUND_VOLUME / 100 * gameVolume));
  if (audioCtx && BUFFERS[name]) {
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
    src.buffer = BUFFERS[name];
    gain.gain.value = volume;
    src.connect(gain).connect(audioCtx.destination);
    src.start();
    dbg('sound ' + name + ' (web audio, ' + audioCtx.state + ', volume ' + volume.toFixed(2) + ')');
    return;
  }
  const a = base.cloneNode();
  a.volume = volume;
  a.play().then(() => dbg('sound ' + name + ' (audio element, volume ' + volume.toFixed(2) + ')'))
    .catch(e => dbg('sound ' + name + ' was BLOCKED by the browser: ' + e.name));
}
const offTimers = {};   // icon -> timer for its "_off" sound
function effectSounds(icon, duration) {
  play(icon + '_on');
  clearTimeout(offTimers[icon]); delete offTimers[icon];
  if (icon !== 'repair' && duration > 0) {
    offTimers[icon] = setTimeout(() => { delete offTimers[icon]; play(icon + '_off'); }, duration);
  }
}
function effectEndedEarly(icon) {         // the server ended it before its time
  if (!offTimers[icon]) return;
  clearTimeout(offTimers[icon]); delete offTimers[icon];
  play(icon + '_off');
}
function cancelEffectSounds() {           // died: no "_off" sounds
  for (const k of Object.keys(offTimers)) { clearTimeout(offTimers[k]); delete offTimers[k]; }
}

// "Not ready": a supply key / click on a tile the game won't use right now (on cooldown,
// effect running, locked, or none left). A usable tile has a supply and no cover on it.
const SUPPLY_KEYS = { supply1: 1, supply2: 2, supply3: 3, supply4: 4, supply5: 5 };
function slotForKey(e) {
  const code = (e.ctrlKey && !e.code.startsWith('Control') ? 'Ctrl+' : '') + e.code;
  const binds = gameSettings().keybinds || {};
  for (const [action, slot] of Object.entries(SUPPLY_KEYS)) {
    const keys = Array.isArray(binds[action]) ? binds[action] : ['Digit' + slot, 'Numpad' + slot];
    if (keys.includes(code)) return slot;
  }
  return 0;
}
function tileUsable(content) {
  if (!content || !iconOf(content.querySelector(SEL.icon))) return false;   // empty slot / none left
  const poly = content.querySelector(SEL.cooldown + ' polygon');
  return phaseOf(polygonArea(poly ? poly.getAttribute('points') : '')) === 'ready';
}
function triedToUse(content) {
  if (content && content.isConnected && content.getClientRects().length && !tileUsable(content)) play('not_ready');
}
document.addEventListener('keydown', e => {
  if (e.repeat) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;   // typing
  const slot = slotForKey(e);
  if (slot) triedToUse(document.querySelectorAll(SEL.tiles)[slot - 1]);
}, true);
document.addEventListener('click', e => {
  const tile = e.target.closest && e.target.closest(SEL.tiles);
  if (tile) triedToUse(tile);
}, true);


// ---------- old-HUD flashes and the "ready" beam ----------
// Ported from the old game's battles.swf (as read by the TextureSwapper pack):
//   flash ("Splash"): the whole tile is colour-transformed towards the supply's colour in
//     100 ms and back over 250 ms (multiplier 1-t, offset colour*t, alpha offset 0xBF*t).
//     It plays when an effect starts on your tank, when a mine is laid, and when a supply is
//     ready again.
//   beam ("LightPillar"): when a supply is ready again, a light column grows out of the tile
//     to 500 px over 500 ms, with alpha 0.8 - (2t-1)^2; its top 120 px fade in (pillar_top.png).
const SPLASH_COLOUR = { repair: 0xBADF1DBF, armor: 0xE3A463BF, damage: 0xFF6937BF, speed: 0xFFE713BF, mine: 0x00DDADBF };
const BEAM_COLOUR = { repair: '#9BCD40', armor: '#E8AC77', damage: '#EE6445', speed: '#EEC631', mine: '#30BB8F' };
const SPLASH_IN = 100, SPLASH_OUT = 250, BEAM_TIME = 500, BEAM_HEIGHT = 500;
const fx = {};        // icon -> { splashAt, beamAt }
const splashMatrix = {};
let fxRunning = false;

// One SVG filter per supply. Inside the 40x40 tile: Flash's colour transform. Outside it
// (the count above the tile, the beam): left as it is.
function splashFilter(icon) {
  if (splashMatrix[icon]) return splashMatrix[icon];
  const NS = 'http://www.w3.org/2000/svg';
  let svg = document.getElementById('ptk-splash-defs');
  if (!svg) {
    svg = document.createElementNS(NS, 'svg');
    svg.id = 'ptk-splash-defs';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    (document.body || document.documentElement).appendChild(svg);
  }
  const f = document.createElementNS(NS, 'filter');
  f.id = 'ptk-splash-' + icon;
  for (const [k, v] of Object.entries({ filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse',
    x: -20, y: -BEAM_HEIGHT - 40, width: 80, height: BEAM_HEIGHT + 100, 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
  f.innerHTML =
    '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" result="ct"/>' +
    '<feFlood flood-color="#fff" x="0" y="0" width="40" height="40" result="box"/>' +
    '<feComposite in="ct" in2="box" operator="in" result="inbox"/>' +
    '<feComposite in="inbox" in2="SourceGraphic" operator="in" result="inside"/>' +
    '<feComposite in="SourceGraphic" in2="box" operator="out" result="outside"/>' +
    '<feMerge><feMergeNode in="inside"/><feMergeNode in="outside"/></feMerge>';
  svg.appendChild(f);
  return (splashMatrix[icon] = f.querySelector('feColorMatrix'));
}
// The mine's symbol flash. The tile flash (an SVG filter on the whole tile) turns everything inside
// the tile into one flat colour, so the symbol would just vanish into it. This overlay sits OUTSIDE
// the filtered tile (in the slot around it), so the symbol lights up on top of the flash and
// fades with it (same 100 ms in / 250 ms out curve).
const symOf = new WeakMap();   // tile -> overlay element
function mineSymbol(tile) {
  let d = symOf.get(tile);
  if (d && d.isConnected) return d;
  d = document.createElement('div');
  d.className = 'ptk-sym';
  const url = 'url("' + BASE + 'mine_fg.png")';
  const mask = url + ' 0 0 / 40px 40px no-repeat';
  d.style.cssText = 'position:absolute;width:40px;height:40px;pointer-events:none;z-index:5;opacity:0;' +
    'background:#8dffe6;';
  d.style.webkitMask = mask; d.style.mask = mask;
  d.style.left = tile.offsetLeft + 'px'; d.style.top = tile.offsetTop + 'px';
  (tile.offsetParent || tile.parentElement || tile).appendChild(d);
  symOf.set(tile, d);
  return d;
}
function startSplash(icon) {
  if (!GLOW || !SPLASH_COLOUR[icon]) return;
  (fx[icon] = fx[icon] || {}).splashAt = performance.now();
  runFx();
}
function startBeam(icon) {
  if (!BEAM || !BEAM_COLOUR[icon]) return;
  (fx[icon] = fx[icon] || {}).beamAt = performance.now();
  runFx();
}
function runFx() {
  if (fxRunning) return;
  fxRunning = true;
  requestAnimationFrame(fxTick);
}
function fxTick(now) {
  let busy = false;
  for (const [icon, f] of Object.entries(fx)) {
    const tile = document.querySelector(SEL.tiles + '[data-ptk="' + icon + '"]');
    // flash
    let t = 0;
    if (f.splashAt !== undefined) {
      const s = now - f.splashAt;
      if (s < SPLASH_IN) t = Math.max(0, s / SPLASH_IN);
      else if (s < SPLASH_IN + SPLASH_OUT) t = (SPLASH_IN + SPLASH_OUT - s) / SPLASH_OUT;
      else delete f.splashAt;
    }
    if (tile) tile.classList.toggle('ptk-flash', t > 0);   // hud.css hides the key hint while the flash runs
    if (icon === 'mine' && MINE_SYMBOL_FLASH && MINE_FG && tile) {
      const sym = mineSymbol(tile);
      const o = t > 0 ? t.toFixed(3) : '0';
      if (sym.style.opacity !== o) sym.style.opacity = o;
    }
    if (tile) {
      if (t > 0) {
        const c = SPLASH_COLOUR[icon] >>> 0, m = 1 - t;
        const o = sh => (((c >>> sh) & 255) / 255 * t).toFixed(4);
        splashFilter(icon).setAttribute('values',
          `${m} 0 0 0 ${o(24)} 0 ${m} 0 0 ${o(16)} 0 0 ${m} 0 ${o(8)} 0 0 0 ${m} ${o(0)}`);
        tile.style.setProperty('--ptk-splash', 'url(#ptk-splash-' + icon + ')');
      } else tile.style.removeProperty('--ptk-splash');
    }
    // beam
    let beam = tile && tile.querySelector('.ptk-beam');
    if (f.beamAt !== undefined && tile) {
      const bt = (now - f.beamAt) / BEAM_TIME;
      if (bt <= 1) {
        if (!beam) {
          beam = document.createElement('div');
          beam.className = 'ptk-beam';
          const top = 'url("' + chrome.runtime.getURL('fx/pillar_top.png') + '")';
          const mask = top + ' 0 0 / 40px 120px no-repeat, linear-gradient(#000, #000) 0 120px / 40px 100% no-repeat';
          beam.style.webkitMask = mask; beam.style.mask = mask;
          tile.prepend(beam);                          // behind the tile's own pictures
        }
        beam.style.background = BEAM_COLOUR[icon];
        beam.style.height = Math.floor(bt * BEAM_HEIGHT) + 'px';
        beam.style.opacity = Math.max(0, Math.min(1, 0.8 - (2 * bt - 1) ** 2));
        beam.style.display = 'block';
      } else delete f.beamAt;
    }
    if (beam && f.beamAt === undefined) beam.style.display = 'none';
    if (f.splashAt === undefined && f.beamAt === undefined) delete fx[icon];
    else busy = true;
  }
  if (busy) requestAnimationFrame(fxTick);
  else fxRunning = false;
}


const anims = {};   // icon -> tile element its redraw loop is running for

// Returns { on, own, points, cycle, cover, coverPoints, left }:
// on = coloured (effect running), cycle = we draw this tile ourselves.
function effectDuration(r) {
  if (!r.box) return r.effDur;
  return (normalDur.repair || (config[1] || {}).effect || NORMAL_REPAIR_FALLBACK_MS) / BOX_REPAIR_SPEEDUP;
}
function evaluate(icon, now) {
  const r = icon && runs[icon];
  if (!r) return { on: false };
  // used just now, effect message not here yet: show the start of the effect
  if (r.effStart < 0 && r.cooldown > 0 && now - r.usedAt < EFFECT_WAIT_MS) {
    return { on: true, own: true, hold: true, cycle: true, left: 0, points: clockPoints(0) };
  }
  const effDur = effectDuration(r);
  // When the effect is over. The game's "effect ended" message can arrive a little after the
  // nominal end (start + duration); using that later time would make the cooldown cover jump
  // back to its start, so the nominal end wins unless the effect really ended earlier.
  const nominalEnd = r.effStart + effDur;
  const effOver = r.effStart < 0 ? r.usedAt : r.effEnd >= 0 ? Math.min(nominalEnd, r.effEnd) : nominalEnd;
  if (r.effStart >= 0 && effDur > 0 && now < effOver) {
    // Effect running: the supply colour, draining clockwise until the effect ends.
    return { on: true, own: true, cycle: true, left: effOver - now,
             points: clockPoints(360 * (now - r.effStart) / effDur) };
  }
  const coolEnd = r.usedAt + r.cooldown;
  if (now < coolEnd && coolEnd > effOver) {
    // Cooldown after the effect: dark cover running off until the supply is ready.
    return { on: false, cycle: true, cover: 'cd',
             coverPoints: clockPoints(360 * (now - effOver) / (coolEnd - effOver)) };
  }
  if (r.effStart >= 0 || now >= coolEnd) delete runs[icon];   // done: back to the game's look
  return { on: false };
}

// Redraw every frame while we draw a tile ourselves.
function animate(content, icon) {
  if (anims[icon] === content) return;
  anims[icon] = content;              // (a re-created tile takes over the loop)
  const tick = () => {
    if (anims[icon] !== content) return;
    updateSlot(content);
    const busy = ['ptk-own', 'ptk-cycle'].some(c => content.classList.contains(c));
    if (content.isConnected && busy) requestAnimationFrame(tick);
    else delete anims[icon];
  };
  requestAnimationFrame(tick);
}

function polygonArea(points) {
  const n = (points || '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (n.length < 6 || n.length % 2 || n.some(Number.isNaN)) return 0;   // no sweep / bad data
  let a = 0;
  for (let i = 0; i < n.length; i += 2) {
    a += n[i] * n[(i + 3) % n.length] - n[(i + 2) % n.length] * n[i + 1];
  }
  return Math.abs(a) / 2;
}

function phaseOf(area) {
  return area <= 1 ? 'ready' : area >= FULL_TILE - 0.01 ? 'full' : 'sweep';
}

// Sweep shape in the svg's 36x36 space: `ang` degrees used up clockwise from 12 o'clock,
// the rest is covered (same shape the game draws).
function clockPoints(ang) {
  const S = 36, C = S / 2;
  const a = Math.min(Math.max(ang, 0), 360) * Math.PI / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const k = C / Math.max(Math.abs(dx), Math.abs(dy));
  const pts = [[C, C], [C + dx * k, C + dy * k]];
  for (const [x, y, deg] of [[S, 0, 45], [S, S, 135], [0, S, 225], [0, 0, 315]]) {
    if (deg * Math.PI / 180 > a) pts.push([x, y]);
  }
  pts.push([C, 0]);
  return pts.map(([x, y]) => +x.toFixed(2) + ',' + +y.toFixed(2)).join(' ');
}

// Sweep polygon as a CSS clip-path, stretched from the game's 36px cover to the full
// 40px tile, so the colour reaches the tile's edge like the old HUD.
function clipFromPoints(points, k = 40 / 36) {
  const pts = (points || '').trim().split(/\s+/).filter(Boolean).map(p => p.split(',').map(Number));
  if (!pts.length || pts.some(p => p.length !== 2 || p.some(Number.isNaN))) return '';
  return 'polygon(' + pts.map(([x, y]) => +(x * k).toFixed(2) + 'px ' + +(y * k).toFixed(2) + 'px').join(',') + ')';
}

function layer(content, cls, before) {
  let d = content.querySelector('.' + cls);
  if (!d) {
    d = document.createElement('div');
    d.className = cls;
    if (before) content.insertBefore(d, before); else content.appendChild(d);
  }
  return d;
}

// ---------- supply count ----------
const slotState = new WeakMap();
function stateOf(content) {
  let s = slotState.get(content);
  if (!s) slotState.set(content, s = { lastCountText: '' });
  return s;
}

// ---------- count text, painted smooth ----------
// The count used to be plain HTML text. The browser draws small HTML text with the system's font
// hinting (and with font smoothing switched off in Windows, with no smoothing at all), which can look
// "blocky". So the number is painted onto a small canvas at COUNT_SS times its size and then scaled
// down with smoothing: the same soft, round digits on every computer. Its look comes from the
// --count-* variables in hud.css (size, font, colours, glow).
const COUNT_SS = 4;                    // painted at this many times the size, then scaled down
const countBig = document.createElement('canvas');
function paintCount(own, content, text) {
  const grey = content.classList.contains('ptk-cd') || content.classList.contains('ptk-locked');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const key = text + '|' + (grey ? 1 : 0) + '|' + dpr;
  if (own.dataset.paint === key) return;                 // (nothing changed since the last paint)
  const cs = getComputedStyle(own);
  const px = parseFloat(cs.fontSize) || 12;
  const num = (name, dflt) => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isNaN(v) ? dflt : v; };
  const glow = num('--count-glow', 2), outline = num('--count-outline', 0), bold = num('--count-bold', 0);
  const SS = COUNT_SS;
  const g = countBig.getContext('2d');
  const font = `${cs.fontStyle} ${cs.fontWeight} ${px * SS}px ${cs.fontFamily}`;
  g.font = font;
  const m = g.measureText(text);
  const w = 2 * Math.ceil(m.width / SS / 2);             // even width: the centring lands on a whole pixel
  const h = Math.ceil(px);
  const pad = Math.ceil(glow * 2 + outline + bold) + 2;  // room around the text for the glow / outline
  const W = w + 2 * pad, H = h + 2 * pad;
  countBig.width = W * SS; countBig.height = H * SS;     // (this also clears it and resets the font)
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  const asc = m.fontBoundingBoxAscent || px * SS * 0.8, desc = m.fontBoundingBoxDescent || px * SS * 0.2;
  const x = W * SS / 2;
  const y = pad * SS + (px * SS - (asc + desc)) / 2 + asc;   // baseline of a line one font-size high
  g.fillStyle = cs.color; g.strokeStyle = cs.color;
  // (--count-bold: a thin stroke in the text colour makes the thin strokes of small digits solid, not grey)
  const solid = () => { if (bold > 0) { g.lineWidth = bold * 2 * SS; g.strokeText(text, x, y); } };
  // soft dark glow around the digits (the same layers the old text-shadow had)
  for (const [blur, dy, col] of [[glow, 0, '#000'], [glow, 0, '#000'], [glow, 1, '#000'], [glow * 2, 0, 'rgba(0,0,0,.6)']]) {
    g.shadowColor = col; g.shadowBlur = blur * SS; g.shadowOffsetX = 0; g.shadowOffsetY = dy * SS;
    g.fillText(text, x, y); solid();
  }
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
  if (outline > 0) {                                     // optional crisp dark outline
    g.lineWidth = outline * 2 * SS; g.strokeStyle = '#000';
    g.strokeText(text, x, y);
    g.strokeStyle = cs.color;
  }
  g.fillText(text, x, y); solid();
  // scale down with smoothing into the visible canvas
  const cvs = own.querySelector('canvas') || own.appendChild(document.createElement('canvas'));
  cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
  const o = cvs.getContext('2d');
  o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  o.drawImage(countBig, 0, 0, countBig.width, countBig.height, 0, 0, cvs.width, cvs.height);
  cvs.style.left = -pad + 'px'; cvs.style.top = -pad + 'px';
  cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
  own.style.width = w + 'px'; own.style.height = h + 'px';
  own.dataset.paint = key;
}

function updateCount(content, img) {
  if (!content) return;
  const s = stateOf(content);
  const cv = content.querySelector(SEL.count);
  const attrText = cv ? (cv.getAttribute('data-ptk-text') || '') : '';
  if (attrText) s.lastCountText = attrText;

  const known = counts[SLOT_OF_ICON[iconOf(img || content.querySelector(SEL.icon))]];
  const text = typeof known === 'number' ? String(known) : (attrText || s.lastCountText);   // the number from the game's data; the picture is only a fallback
  let ok = false;
  if (OWN_COUNT && cv && text) {
    ok = true;
    const own = layer(content, 'ptk-count');
    paintCount(own, content, text);      // colours / size / font come from hud.css (--count-*)
  }
  content.classList.toggle('ptk-own-count', ok);
}

function updateSlot(content) {
  if (SAFE) return;
  try { updateSlotUnsafe(content); } catch (e) { fail('updateSlot', e); }
}
function updateSlotUnsafe(content) {
  if (!content) return;
  const img = content.querySelector(SEL.icon);
  const icon = img && img.dataset.ptk;
  const svg = content.querySelector(SEL.cooldown);
  const poly = svg && svg.querySelector('polygon');
  const points = poly ? poly.getAttribute('points') : '';
  const area = polygonArea(points);
  watchGameFlash(content);
  const supply = iconOf(img);
  if (supply) {   // ready detection (sound + flash + beam)
    const ph = phaseOf(area);
    if (ph !== lastPhase[supply]) dbg(supply + ' tile: ' + (lastPhase[supply] || '-') + ' -> ' + ph);
    if (ph === 'ready' && lastPhase[supply] === 'sweep') readyNow(supply, 'cooldown mask gone');
    else if (ph === 'ready' && lastPhase[supply] === 'full' && performance.now() < spawnFx.until && !spawnFx.done.has(supply)) readyNow(supply, 'spawned');
    lastPhase[supply] = ph;
  }
  const r = evaluate(icon, performance.now());
  if (icon) content.dataset.ptk = icon; else delete content.dataset.ptk;
  content.classList.toggle('ptk-on', r.on);
  content.classList.toggle('ptk-own', !!r.own);
  if (r.on) content.dataset.ptkLeft = (r.left / 1000).toFixed(1) + 's';
  else delete content.dataset.ptkLeft;
  content.classList.toggle('ptk-cycle', !!r.cycle);
  if (r.cycle) animate(content, icon);
  const phase = phaseOf(area);
  const cd = r.cover ? r.cover === 'cd' : !!icon && !r.on && !r.cycle && phase === 'sweep';
  const locked = !!icon && !r.on && !r.cycle && phase === 'full';
  // tileCd: cooldown / locked look (dark tile, greyed symbol), NOT during the active effect
  const tileCd = (cd || locked) && !r.on && TILE_CD_ICONS.has(icon);

  content.classList.toggle('ptk-cd', cd);
  content.classList.toggle('ptk-tile-cd', tileCd);
  content.classList.toggle('ptk-locked', locked);
  const repairHeal = r.on && icon === 'repair';
  content.classList.toggle('ptk-symbol-off', repairHeal && !(SYMBOL_BLINK && REPAIR_LIKE_INDICATOR) && Math.floor(performance.now() / (REPAIR_BLINK_MS / 2)) % 2 === 1);

  updateCount(content, img);

  if (cd || locked) {
    // cooldown cover spans the whole 40px tile (stretched from the 36px sweep); locked is full
    const clip = cd ? clipFromPoints(r.coverPoints || points) : '';
    const cover = layer(content, 'ptk-cover');
    if (cover.dataset.clip !== clip) { cover.dataset.clip = clip; cover.style.clipPath = clip; }
  }
  if (icon) {
    // while an effect runs, the picture WITHOUT the white symbol is used: the symbol is then drawn only by
    // the coloured layers, so when those blink away nothing (no white symbol) shows through
    const effectTile = r.on && TILE_CD_ICONS.has(icon);
    const useTile = tileCd || repairHeal || effectTile;
    const want = BASE + (useTile ? (TILE_FILE[icon] || icon) + '_tile' : icon) + '.png';
    if (img.getAttribute('src') !== want) img.setAttribute('src', want);
  }
  if (tileCd) {
    const fg = layer(content, 'ptk-cd-fg');
    const url = 'url("' + BASE + icon + '_fg.png")';
    if (fg.dataset.bg !== url) {
      fg.dataset.bg = url;
      fg.style.backgroundImage = url;
    }
  }
  if (icon && !NO_COLOUR.has(icon)) {
    const lo = layer(content, 'ptk-lo');   // icon in the supply colour (shows on the dark part)
    const hi = layer(content, 'ptk-hi');   // lighter icon, only over the coloured part
    const url = 'url("' + BASE + icon + '_fg.png")';
    const maskVis = MASK_READY.has(icon) ? '' : 'hidden';
    if (lo.style.visibility !== maskVis) { lo.style.visibility = maskVis; hi.style.visibility = maskVis; }
    const blinks = SYMBOL_BLINK && r.on && !r.hold && (icon !== 'repair' || REPAIR_LIKE_INDICATOR);
    const op = blinks ? symbolBlink(icon, r.left, performance.now()).toFixed(3) : '';
    if (lo.style.opacity !== op) { lo.style.opacity = op; hi.style.opacity = op; }
    if (lo.dataset.mask !== url) {
      lo.dataset.mask = url;
      for (const d of [lo, hi]) { d.style.webkitMaskImage = url; d.style.maskImage = url; }
    }
    if (r.on) {
      const clip = clipFromPoints(r.points);
      if (clip && hi.dataset.clip !== clip) { hi.dataset.clip = clip; hi.style.clipPath = clip; }
      if (clip) layer(content, 'ptk-fill', lo).style.clipPath = clip;   // the coloured part
    }
  }
}

function updateAll() {
  document.querySelectorAll(SEL.tiles).forEach(updateSlot);
}

// ---------- centering ----------
let watched = null;
let queued = false;

function centerPanel() {
  if (SAFE) return;
  const p = document.querySelector(SEL.panel);
  if (!p) return;
  if (p !== watched) {            // first time (or the game re-created the panel)
    watched = p;
    new ResizeObserver(queueCenter).observe(p);
  }
  // Center the visible slots, not the panel box: the panel is 405px wide
  // but the slots only span part of it.
  const rects = [...p.querySelectorAll(SEL.slot)]
    .map(s => s.getBoundingClientRect())
    .filter(r => r.width);
  if (!rects.length) return;
  const left = Math.min(...rects.map(r => r.left));
  const right = Math.max(...rects.map(r => r.right));
  const err = document.documentElement.clientWidth / 2 - (left + right) / 2;
  if (Math.abs(err) < 0.5) return;
  const cur = parseFloat(p.style.translate) || 0;
  p.style.translate = Math.round(cur + err) + 'px';
}

function queueCenter() {
  if (!CENTER_PANEL || queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; centerPanel(); });
}

function touchesPanel(n) {
  return n.matches && (n.matches(SEL.panel) ||
    (n.querySelector && n.querySelector(SEL.panel)));
}

// ---------- watch the page ----------
new MutationObserver(guard('page observer', muts => {
  // Several changes can hit the same tile in one batch: redraw each tile only once.
  const redraw = new Set(), recount = new Set();
  const tileOfNode = el => (el && el.closest && el.closest(SEL.tile)) || null;
  for (const m of muts) {
    if (m.type === 'attributes') {
      if (m.attributeName === 'points') redraw.add(tileOfNode(m.target));
      else if (m.attributeName === 'data-ptk-text') recount.add(tileOfNode(m.target));
      else if (m.target.tagName === 'IMG') swap(m.target);
    } else {
      // The cooldown svg/polygon being added or removed inside a tile also changes its state.
      redraw.add(tileOfNode(m.target));
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        scan(n);
        if (touchesPanel(n)) queueCenter();
      });
    }
  }
  redraw.delete(null);
  redraw.forEach(updateSlot);
  recount.forEach(t => { if (t && !redraw.has(t)) updateCount(t); });   // (updateSlot already updates the count)
})).observe(document, {
  childList: true, subtree: true,
  attributes: true, attributeFilter: ['src', 'points', 'data-ptk-text']
});

window.addEventListener('resize', queueCenter);
setInterval(queueCenter, 1000); // the game can move the panel on its own (a resize already re-centres at once)

// Handle anything already on the page when this script starts.
scan(document);
queueCenter();

// ---------- custom box textures ----------
// Put your own textures in the boxes/ folder (240x240, .jpg or .png):
//   repair, speed, damage, armor, crystal, gold   e.g. boxes/repair.jpg
// They are read here and sent to inject.js (page world), which swaps them in for the game's.
// Any file that is missing is simply skipped (the game's own box stays).
(async () => {
  const names = ['repair', 'speed', 'damage', 'armor', 'crystal', 'gold'];
  const out = {};
  for (const n of names) {
    for (const ext of ['jpg', 'png']) {
      try {
        const r = await fetch(chrome.runtime.getURL('boxes/' + n + '.' + ext));
        if (!r.ok) continue;
        const buf = new Uint8Array(await r.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        out[n] = { type: ext === 'jpg' ? 'image/jpeg' : 'image/png', b64: btoa(bin) };
        break;
      } catch (e) { /* no such file */ }
    }
  }
  if (Object.keys(out).length) {
    document.dispatchEvent(new CustomEvent('ptk:boxes', { detail: JSON.stringify(out) }));
    dbg('box textures sent:', Object.keys(out).join(', '));
  }
})();

// Custom box models: boxes/<name>.3ds (so far only gold). Sent to inject.js, which swaps it into the box's model.
(async () => {
  const out = {};
  for (const n of ['gold']) {
    try {
      const r = await fetch(chrome.runtime.getURL('boxes/' + n + '.3ds'));
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      out[n] = btoa(bin);
    } catch (e) { /* no such file */ }
  }
  if (Object.keys(out).length) {
    document.dispatchEvent(new CustomEvent('ptk:models', { detail: JSON.stringify(out) }));
    dbg('box models sent:', Object.keys(out).join(', '));
  }
})();
