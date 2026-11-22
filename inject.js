// ProTanki on-tank effect icons - runs inside the page (MAIN world).
// The game loads /assets/battle/indicators/inventory/<name>.png with fetch().
// We answer those requests with our own 18x18 PNGs, so nothing is redirected
// and no CORS / extension-URL problem can happen.

(() => {
  const DEBUG = false;
  // Which of our hooks got installed (content.js's self-check reads it from <html data-ptk-inject>).
  const hooks = [];
  const report = () => { try { document.documentElement.setAttribute('data-ptk-inject', hooks.join(',')); } catch (e) { /* ignore */ } };         // true = log every replaced on-tank icon to the console

  // ---- 18x18 supply indicators ----
  // The game reserves a 16x16 block per indicator (getImageData / clearRect with 16,16 at the
  // indicator's x,y) and clips our bigger icons to it. Make those calls 18x18 instead, and
  // grow the block UPWARDS (into the free gap above the row) so the bottom edge stays exactly
  // where the 16x16 one was (a lower edge gets hidden inside the tank model at some camera angles).
  // Only calls with exactly 16x16 at a non-zero position are touched (the game's other
  // getImageData / clearRect calls start at 0,0 or use variable sizes).
  const ICON_SIZE = 18;
  const GROW_UP = ICON_SIZE - 16;     // 2 px; lower this if the icons touch the bar above them
  const MOVE_DOWN = 3;                // px to push the icons down (0 = as before). Never pushed past the canvas edge,
                                      // so nothing gets cut off; too much and they sink into the tank model.
  const topOf = (ctx, y) => Math.max(0, Math.min(y - GROW_UP + MOVE_DOWN, ctx.canvas.height - ICON_SIZE));
  try {
    const P = CanvasRenderingContext2D.prototype;
    const realGet = P.getImageData, realPut = P.putImageData, realClear = P.clearRect;
    const isIndicator = (x, y, w, h) => w === 16 && h === 16 && (x || y);
    const ours = new WeakSet();       // ImageData objects we made 18x18
    P.getImageData = function (x, y, w, h, s) {
      if (isIndicator(x, y, w, h)) {
        const d = realGet.call(this, x, topOf(this, y), ICON_SIZE, ICON_SIZE, s);
        ours.add(d);
        return d;
      }
      return realGet.call(this, x, y, w, h, s);
    };
    P.putImageData = function (data, dx, dy) {
      if (ours.has(data)) {
        const a = Array.prototype.slice.call(arguments);
        a[2] = topOf(this, dy);
        return realPut.apply(this, a);
      }
      return realPut.apply(this, arguments);
    };
    P.clearRect = function (x, y, w, h) {
      if (isIndicator(x, y, w, h)) { y = topOf(this, y); w = h = ICON_SIZE; }
      return realClear.call(this, x, y, w, h);
    };
    hooks.push('indicators');
  } catch (e) { /* ignore */ }

  const ICONS = {
  "health": "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAACaUlEQVR42mNgwA9YgJgfiDWA2A+I84C4BIj9gVgaiJkYiABsQCwPxO5AXBCYzLdt9j7pd6suyP208eKcDRQzBGJWQoYwQW0Ms/XhXD5ho+TzrXeV/oNwUbfIJTYOsKs0oQax4HMZFxBbG1iyzVp/Tf4PzJDCLuFzQPEsIDYHYjEglgVibailWAFIUWT5BJFLMEO6V0k8BYpVArEZEIsCsRYQR1t5cvQD6UBcBoFsyuhfL/kMZlDjXLH7QLFyILYCYiMgTi7oFDq19or8L6g4BmAEYgUgzmxbLPYAZtDay/K//ZN5dgLFS0E4s0nwBEh84WHZT0B+ETZDuKA2loFcATMIhDfckP9bM0PsdtNChAWhabx7gWpD0A3hhPo9ObdV+OTqi/I/25dLPEU2DBlP3y71lpGRoQGo3gDdEFCUJoEM2XRL4Z9TABfItgWti8Qfoxuy6abCP+dQrnXQxCkCM4QDmnoTs5uEj4MMcQ3h2g3kz7Dy4Ny19JTst7pZYncmbJB8PnOH9Ov6OWK37Hw5lwDlI6DhCUpLYEPUgTg+s0no2JY7Sv/dQnn2APnTrTw4tq+7Kv8nsULwIDSQc6HZJB6IHaCxywbzlipIIr1O6CgwKv/Y+3KBNM2BGvI7uULwAJAfB8R6UNtBWBKIeYCYGTmQQ+NLBPaB/A0M3F+Kmqw7jWw59oAMSakEuyQWahkboXxVDjKgsEfkXtlE0fvLTsv+AGXMlCrSDAGBspXn5X7wCzPuAMbWbZDLoC6JAWIVIGZnIBIE+SfybFx8XPbz0jOyX2MLBfaQ6hIYUISmhSIoBmVAZVJcAgIALpwCsfm6oiAAAAAASUVORK5CYII=",
  "armor": "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAC3UlEQVR42mNgYGBgAWJhINYFYlcgjgbiPCCuAuJGIG4B4iYgrgbifKi8K1S9MFQ/GPADsSMfF0ttsLXS+kkZdhe3Nfu9ODs54uutuXF/HixM/HdnXvyfc1Miv+1qC3g1McP2EkgdSD1IH1Q/GMgBcebWJr9nj5ck/wfhC9Oivq+v9X45OdP+XlOM+c3+TNu7a2u9XpyfGvkdpgakHqQPqh8M1IC4Eqj5277OoA+KErx7pIW5doGwlpzgPjN1sYN6ikL7pUW4donwc+wEyYPUgdSD9EH1g4EGENeCJKZmO9wXF+DYubnR9xXMZhiele90i4WZYTErC+N6kDqoQbVQ/QiDgM4GGyQnwrMb3ZCmGLOTQDVtQNyjIMoLNgikHt0gdSCuAdkwO9/loYQA5y5kQzpSbM5AY665JtLsiJ+F0mGQOqiLaqD6wUAViMtPTwr/DPTSa2Fejh0wQ6ZkOVwCGQDCSa4aYJfGOGmcAakDqQfpg+oHA3kgzgZKPrs2K+YXyCBgdP+dU+B0CyjeDkpDobYq24BJ4ff9hQn/PI3ljoHUgdSD9EH1g4EIEIc2x1ueBNlopCyyJ9Je7SAXK+MMoHhXoJXSZpAhIDlQkjBUEj4AYoPUg/RB9YMBBxBbmWuIzgQpmFfkch/IBxkywUZbasOVGdE/YF61UBc/NKfA+RGIDVIP0gfVDwaMQKwAxOnLKjzugxRZaohvC7JS3Ht9duwvRPS7PISFH0gdSD1UHyMDEuAFJXctOYHpt4HZ4nh/2GdQMlhc6vYEpHFTg88rAR7W7Vua/N6A5EHqoNmDlwENMAOxLBBHxbiobQFp3ljv84qXk3V7spvWORAN8xJIHqQOqp6ZAQtgg0ZlfJK75naQpj3tge9N1MQOrq72eA7il4QaHQDJQ9WxMeABcMOCbZQ2ISfMJDfNHcQagm5YrKOe9JJ9XUGvAy0VV4L4pBiCbJgiEHsBcSKUVsRnCADuz3kDC11gLgAAAABJRU5ErkJggg==",
  "power": "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAADYElEQVR42nWUeUjTYRjHf85ha245p2255bV0c9pyullaUoFmmZrmVVjOIy36xz/ssDI0Ejropgw6pChTMkshIbMwS6PEDjEiO+w0w4MOU9M06/usVxtCL3x4n997fN/neN8fx/1rVoAPrJn9v0bzIqAGCQucRMcOBLmUWYpIgBZogJiNWU0QtQFKsACs36KXV39M1vea1A5nLRfoA2XCfIWAvwH2TCAFM4AK2IEp7KCVGjubo9UR6rbf6+f83hfofA9jq8aEaNGSbJ3s2jrt1CrYiSDclsdloTeBQBACsnL10252pvgNkMiDOO9OHsflkxMcy4uM4i2c59p4HSfB3iMXWBcWBCjqYG8jAX9H4YmGaO0HEiD6MwzDfvaC05iLAg4k5MEU00pC3J8MZBhGxHyriiydrKkmQv0G44fz/BV139L9h7pS/AYx1kFCe2cr6zG3GrianUlwk+TBWAs2Vyz2eE6LsnXyx42x3t0P43y6MfbaHAa+E1WS+x0mff+jeJ9OrM9mubQxJ+d4sMvtfKNTLcyDNyI1b2kTnTyYafw1FkZZqOol34qrrI/26kRII8HTbIsop6zSf1uqRlrxdIWuB2YRvOgYyjSO0ubaKK9P7cn6PhTgFuZOFi10f0bjBUblHXxnAE+W379NPsm6oCrc8xXMc8+TdJ/p1JaEmT2+0smlOonwBMb3Z2oda0gE68w5A5nAYHHfzG1lvsEcWulHk76vMNi1JUQhPskSadKhWuQZCd2N8fp0Oczjxe7ZyhqlgEfXQmEpND9UKTqDvvxLmv8g+iMgmlUyea5MeOlmpLqjN93wkwqww+jUPEsqOIW5CFb2cSGNgMdtRH8BCR5hrseDmHBnUVErwiVv3q/y7UtVS5swTu9qF907VrUpY2IidmuPjGID+hLm1dFDQc7N95Zru8aqR8DroSthHq3pGsdKFyF/E3s21uNegVzyaHhtwCgq9+v7GsNwd6rfj7akWV+bE3y6GmK07fS+SOR8qKqFbn34dPFu5tV49eQsL7nMG/LqCrgIiulqgEMgh5WeHukyVjl63DzL109iXiDUjs/lxLlJyncalU1XUfIbSzXvTJ7SSsylA1/gBOyBwFKEm/BzE7O4l8HfrYsUonMURnGIqjHWTbKd/Vb4Ezf+AfQzMEBnVCb2AAAAAElFTkSuQmCC",
  "nitro": "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAACA0lEQVR42p2TXUhTcRjGT062Zufs/CPoJoVupigIgiRlEQZ63ZUXI8PyQtCL8iKMBGFhCoHVYBfdaEEQJTKVlSBJkkHohfiBxERHyhxGDAyK+ZWmzzPeA4fV6cM//ODd+z7Ps3dn/6Npvz8uYAA/uCT4pefS/vG4Qb6Ym9tbPK8Ia+nli8bx5AITFINARdmRx2P9+sr+5xP7hDV7nInGFM8vWxSAanDz3m3Pu/WY2rJCLNjjjBrRFti3Oyq/P3DxnKtn4rWRtIyr02b6e1z9sGqrTw21sp1fMrQiUP8g6B3/tqR2LPHUiJGqOp8zjqBMD/V79qw5tfTQKxna5d5HeRM7ieN7FKQ/qV3UP9EfAoP8zD7qKOHM6tFDLzMY1Dg5bCS/LqjtNy/1xNqsmd5YVrsMAQNZQUOcUUMtPfQyg0FXP0T1eNsN9yjq8GifvsJvcgjiRnvUUEsPvcxg0BlQC66AW/09eTExDoBI9kasqaFWPLWSkbmtJ0Ehk5+EvDNf5tUG6uegzxYUAS84o0a2KBSvYb9LPt7cjlbPoKzbDZ7agp6Bh5xRI7fc53SzT4EaWfcaCNmCwqBBZjWizf3ba8J1z4JOW9B9UCkz808h2acE3LUFdYFS7RCHD/JO6qPalKCghP/34TOoH4scW5x761tD3QROHyaIf2k5qAPXwQWgnMQHLiwyO8LC+8EAAAAASUVORK5CYII="
};

  // The supply counts and key hints are drawn on <canvas> elements, not written as HTML. Remember
  // the text the game draws on small canvases (digits only), so content.js can redraw the
  // supply counts as crisp text. (The look of that text comes from hud.css.)
  const NEED_COUNT_TEXT = false;   // set to true together with OWN_COUNT = true in content.js (off = no hook on every canvas text call)
  try {
    const proto = CanvasRenderingContext2D.prototype;
    const note = (ctx, text) => {
      if (typeof text !== 'string' && typeof text !== 'number') return;
      const s = String(text);
      if (s.length > 24) return;
      const cv = ctx.canvas, t = s.trim();
      if (!cv || cv.width >= 400 || !/^[\d\s.,]{1,12}$/.test(t)) return;
      if (cv.getAttribute('data-ptk-text') !== t) cv.setAttribute('data-ptk-text', t);   // (unchanged = no DOM event)
    };
    for (const name of NEED_COUNT_TEXT ? ['fillText', 'strokeText'] : []) {
      const orig = proto[name];
      proto[name] = function (text) {
        try { note(this, text); } catch (e) { /* never break the game's drawing */ }
        return orig.apply(this, arguments);
      };
    }
    hooks.push('canvas');
  } catch (e) { /* ignore */ }

  // ---- custom box textures ----
  // The game makes its box textures as blobs (image/jpeg, 240x240) and passes them through
  // URL.createObjectURL. Each box has a different file size, so we recognise it by that size
  // and hand the game your texture (from the boxes/ folder, sent over by content.js) instead.
  // A size we do not know, or a texture you did not provide, stays as the game's original.
  const BOX_BY_SIZE = { 13820: 'repair', 13144: 'speed', 14139: 'damage', 12055: 'armor', 14282: 'crystal', 14666: 'gold' };
  const boxBlobs = {};
  document.addEventListener('ptk:boxes', e => {
    try {
      const d = JSON.parse(e.detail);
      for (const [name, f] of Object.entries(d)) {
        boxBlobs[name] = new Blob([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], { type: f.type });
      }
    } catch (err) { /* ignore */ }
  });
  try {
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
      try {
        if (obj instanceof Blob && obj.type === 'image/jpeg') {
          const mine = boxBlobs[BOX_BY_SIZE[obj.size]];
          if (mine) { if (DEBUG) console.log('[New Supplies] replaced box texture:', BOX_BY_SIZE[obj.size]); return realCreate.call(this, mine); }
        }
      } catch (err) { /* fall through to the original */ }
      return realCreate.apply(this, arguments);
    };
    hooks.push('blob');
  } catch (e) { /* ignore */ }

  // ---- custom box models ----
  // The game keeps its resources in IndexedDB (database "protanki", store "resources"). A 3D model
  // is a "1BNT" container: "1BNT", file count, then per file: name length, name, data length, data
  // (all numbers are 32-bit little endian). The model itself is the "object.3ds" file inside it.
  // content.js sends your boxes/<name>.3ds; when the game reads that box's record, we hand it the
  // same container with object.3ds swapped for yours. The database itself is never changed.
  const MODEL_IDS = { gold: 683 };      // box -> resource id of its model (found with the IndexedDB scan)
  const customModels = {};              // box -> Uint8Array (your .3ds)
  const rebuilt = new WeakMap();        // the game's data -> patched record (same object every time)
  document.addEventListener('ptk:models', e => {
    try {
      for (const [name, b64] of Object.entries(JSON.parse(e.detail))) {
        customModels[name] = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      }
    } catch (err) { /* ignore */ }
  });
  function swapModel(data, model) {      // -> new container bytes, or null if it is not what we expect
    const src = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    const td = new TextDecoder();
    if (td.decode(src.subarray(0, 4)) !== '1BNT') return null;
    const n = dv.getUint32(4, true), parts = [];
    let p = 8, swapped = false;
    for (let i = 0; i < n; i++) {
      const nl = dv.getUint32(p, true), name = src.subarray(p + 4, p + 4 + nl);
      const dl = dv.getUint32(p + 4 + nl, true), body = src.subarray(p + 8 + nl, p + 8 + nl + dl);
      p += 8 + nl + dl;
      const isModel = /\.3ds$/i.test(td.decode(name));
      const use = isModel ? model : body;
      if (isModel) swapped = true;
      const head = new Uint8Array(8 + nl); const hv = new DataView(head.buffer);
      hv.setUint32(0, nl, true); head.set(name, 4); hv.setUint32(4 + nl, use.length, true);
      parts.push(head, use);
    }
    if (!swapped) return null;
    const out = new Uint8Array(8 + parts.reduce((a, b) => a + b.length, 0));
    out.set(src.subarray(0, 8)); let o = 8;
    for (const b of parts) { out.set(b, o); o += b.length; }
    return out;
  }
  function patchRecord(v) {
    try {
      if (!v || typeof v !== 'object' || !v.data || v.description !== 'resource_3ds_model_description') return v;
      const box = Object.keys(MODEL_IDS).find(k => MODEL_IDS[k] === v.id);
      if (!box || !customModels[box]) return v;
      if (rebuilt.has(v.data)) return rebuilt.get(v.data);
      const out = swapModel(v.data, customModels[box]);
      if (!out) { console.warn('[New Supplies] model container not recognised for', box); return v; }
      const rec = Object.assign({}, v, { data: out.buffer, bytes: out.length });
      rebuilt.set(v.data, rec);
      if (DEBUG) console.log('[New Supplies] replaced box model:', box);
      return rec;
    } catch (err) { return v; }
  }
  function patchResult(r) {
    if (Array.isArray(r)) return r.some(x => x && x.description === 'resource_3ds_model_description') ? r.map(patchRecord) : r;
    return patchRecord(r);
  }
  try {
    for (const [proto, prop] of [[IDBRequest.prototype, 'result'], [IDBCursorWithValue.prototype, 'value']]) {
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      Object.defineProperty(proto, prop, Object.assign({}, d, { get() { return patchResult(d.get.call(this)); } }));
    }
    hooks.push('idb');
  } catch (e) { /* ignore */ }

  const PATTERN = /\/assets\/battle\/indicators\/inventory\/(health|armor|power|nitro)\.png(?:[?#].*)?$/i;

  const bytes = {};
  for (const [name, b64] of Object.entries(ICONS)) {
    bytes[name] = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }

  const realFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      const m = PATTERN.exec(url);
      if (m) {
        const name = m[1].toLowerCase();
        if (DEBUG) console.log('[New Supplies] replaced on-tank icon:', name);
        return Promise.resolve(new Response(bytes[name].slice(), {
          status: 200,
          headers: { 'Content-Type': 'image/png' }
        }));
      }
    } catch (e) { /* fall through to the real request */ }
    return realFetch.apply(this, arguments);
  };
  hooks.push('fetch');
  report();
  document.addEventListener('DOMContentLoaded', report);
})();
