// ProTanki supply timings - runs inside the page (MAIN world). Read-only: it only listens.
//
// The game's network code decodes every server message ("packet") into an object and hands
// it to the listeners registered for that packet's id:
//     listeners: Map<packet id, Set<callback>>
// We add one more listener to each of those sets, so we see exactly what the server tells
// the game - no guessing from the screen. Packets are recognised by their CONTENTS (field
// names), so a game update that renumbers the packets doesn't break this:
//   supply used     { itemId, time }                  you used a supply; time = its cooldown (ms)
//   your supplies   { json: {items:[{id, slotId, count, itemEffectTime, itemRestSec}]} }
//   effect on       { <tank>, effectId, duration, ... } an effect started on a tank (ms)
//   effect off      { <tank>, effectId }               an effect ended on a tank
//   spawn           { <tank>, team, position, orientation, health, ... }
// Deaths have no named fields, so those are recognised by their packet ids (from the game
// build of Nov 2026: kill, self-destruct, other death). If an update changes those ids,
// everything still works, except that running supplies only clear when you respawn.
// Effect ids and supply slot ids are the same numbers: 1 repair, 2 armor, 3 damage,
// 4 speed (5 mine has no effect). A tank is named by its player's nickname.
// Everything is passed to content.js as 'ptk:net' events (JSON text).

(() => {
  // Names of the fields we read from the game's messages. If an update renames one, change it here.
  const FIELD = {
    json: 'json',                                   // your supplies list (as JSON text)
    items: 'items', id: 'id', slotId: 'slotId', count: 'count',           // ... inside that list
    effectTime: 'itemEffectTime', restTime: 'itemRestSec',                 // ... (seconds)
    itemId: 'itemId', time: 'time',                 // supply used: which one, its cooldown (ms)
    effectId: 'effectId', duration: 'duration',     // effect on / off a tank (duration in ms)
    team: 'team', position: 'position', orientation: 'orientation', health: 'health',   // a tank spawned
  };
  const LOG = '[New Supplies]';
  const DEBUG = false;          // true = print what the game tells us (supplies, effects, your tank) to the console
  const log = (...a) => { if (DEBUG) console.log(LOG, ...a); };
  const DEATHS = new Set([-0x288d098 /* kill */, 0x9b1f272 /* self-destruct */, -0xa5a30a6 /* other */]);

  const send = msg => document.dispatchEvent(new CustomEvent('ptk:net', { detail: JSON.stringify(msg) }));
  const tankOf = packet => { const v = Object.values(packet)[0]; return typeof v === 'string' ? v : null; };

  // ---- which tank is yours ----
  // Learned the first time you use a supply: the tank that gets that supply's effect
  // right then is yours. Kept for this browser tab.
  let me = null;
  try { me = sessionStorage.getItem('ptk-me'); } catch (e) {}
  let lastUse = null;           // { slot, at }
  let recentEffects = [];       // effects that arrived just before a use: { tank, effectId, duration, at }
  function setMe(tank) {
    if (me === tank) return;
    me = tank;
    try { sessionStorage.setItem('ptk-me', tank); } catch (e) {}
    log('your tank is "' + tank + '"');
  }

  const slotOf = new Map();     // supply object id -> slot (1..5), from INVENTORY

  const on = {
    inventory(p) {
      let data;
      try { data = JSON.parse(p[FIELD.json]); } catch (e) { return; }
      if (!data || !Array.isArray(data[FIELD.items]) || !data[FIELD.items].some(it => it && FIELD.slotId in it)) return;
      const items = {};
      for (const it of (data && data[FIELD.items]) || []) {
        if (!it) continue;
        slotOf.set(it[FIELD.id], it[FIELD.slotId]);
        items[it[FIELD.slotId]] = { effect: (it[FIELD.effectTime] || 0) * 1000, rest: (it[FIELD.restTime] || 0) * 1000, count: it[FIELD.count] };
      }
      log('supplies (effect / cooldown after it, seconds): ' +
        Object.entries(items).map(([s, t]) => s + ': ' + t.effect / 1000 + '/' + t.rest / 1000).join(', '));
      send({ t: 'inventory', items });
    },
    used(p) {
      const at = performance.now();
      const slot = slotOf.get(p[FIELD.itemId]);
      if (!slot) return;
      send({ t: 'used', slot, cooldown: p[FIELD.time], at });
      lastUse = { slot, at };
      if (!me) {                                    // the effect may have come first
        const hit = recentEffects.filter(e => e.effectId === slot && at - e.at < 2000).pop();
        if (hit) { setMe(hit.tank); send({ t: 'effect', slot, duration: hit.duration, at: hit.at }); }
      }
    },
    effectOn(p) {
      const at = performance.now();
      const tank = tankOf(p);
      if (!me && lastUse && lastUse.slot === p[FIELD.effectId] && at - lastUse.at < 2000) setMe(tank);
      if (tank && tank === me) {
        log('effect ' + p[FIELD.effectId] + ' on your tank for ' + (p[FIELD.duration] / 1000) + 's');
        send({ t: 'effect', slot: p[FIELD.effectId], duration: p[FIELD.duration], at });
      } else if (!me) {
        recentEffects = recentEffects.filter(e => at - e.at < 2000)
          .concat({ tank, effectId: p[FIELD.effectId], duration: p[FIELD.duration], at });
      }
    },
    effectOff(p) {
      if (tankOf(p) === me) send({ t: 'effectEnd', slot: p[FIELD.effectId], at: performance.now() });
    },
    died(p) { if (me && tankOf(p) === me) send({ t: 'died', at: performance.now() }); },
    spawn(p) { if (me && tankOf(p) === me) send({ t: 'spawned', at: performance.now() }); },
  };

  // What kind of packet is this? (null = not one we need)
  function kindOf(id, p) {
    if (DEATHS.has(id)) return 'died';
    if (typeof p[FIELD.effectId] === 'number') return typeof p[FIELD.duration] === 'number' ? 'effectOn' : 'effectOff';
    if (typeof p[FIELD.itemId] === 'string' && typeof p[FIELD.time] === 'number' && slotOf.has(p[FIELD.itemId])) return 'used';
    if (typeof p[FIELD.json] === 'string' && p[FIELD.json].includes(FIELD.effectTime)) return 'inventory';
    if (FIELD.team in p && FIELD.position in p && FIELD.orientation in p && FIELD.health in p) return 'spawn';
    return null;
  }

  // ---- join the game's listeners ----
  // A new Set stored under a number in a Map is a candidate; it is a listener set if the
  // game puts functions in it straight away (checked right after, in a microtask).
  const joined = new WeakSet();
  const misses = new Map();     // packet id -> consecutive packets that were not interesting
  const IGNORE_AFTER = 50;      // a packet id always has the same shape, so give up on it
  let joinedSets = 0;           // how many of the game's listener sets we joined (content.js's self-check reads it)
  const reportHook = () => {
    try { document.documentElement.setAttribute('data-ptk-net', String(joinedSets)); } catch (e) { /* ignore */ }
  };
  const realSet = Map.prototype.set;
  Map.prototype.set = function (key, value) {
    try { if (typeof key === 'number' && value instanceof Set && !joined.has(value)) {
      joined.add(value);
      queueMicrotask(() => {
        if (!value.size || ![...value].every(f => typeof f === 'function')) return;
        joinedSets++; reportHook();
        value.add(packet => {
          if (!packet || typeof packet !== 'object') return;
          const miss = misses.get(key) || 0;
          if (miss >= IGNORE_AFTER && typeof packet[FIELD.json] !== 'string') return;
          try {
            const kind = kindOf(key, packet);
            if (kind) { misses.set(key, 0); on[kind](packet); }
            else if (miss < IGNORE_AFTER) misses.set(key, miss + 1);
          } catch (e) { console.warn(LOG, 'could not read a game message', e); }
        });
      });
    } } catch (e) { /* never break the game's own Map */ }
    return realSet.call(this, key, value);
  };
})();
