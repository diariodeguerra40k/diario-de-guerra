// Lector de la pantalla "Results" del War Journal (app oficial 40k).
// Funciona igual en navegador y en Node: recibe imágenes RGBA {width,height,data}
// y una función ocr(img, {psm, whitelist}) -> {text, lines:[{text,bbox:{x0,y0,x1,y1}}]}.
(function (root) {
  "use strict";

  const SECS = ["Assassination","Behind Enemy Lines","Bring It Down","Burden of Trust","Cleanse","Centre Ground","Defend Stronghold","Display of Might","Engage On All Fronts","Establish Locus","Extend Battle Lines","Forward Position","Marked for Death","No Prisoners","Outflank","Overwhelming Force","Plunder","A Tempting Target","A Grievous Blow","Recover Assets","Sabotage","Secure No Man's Land","Storm Hostile Objective","Beacon","Area Denial","Containment","Cull the Horde"];
  let PRIMS = [];            // se rellena desde fuera (nombres de misiones primarias)
  function setPrimaries(list) { PRIMS = list.slice(); }

  // ---------- utilidades de imagen ----------
  const px = (im, x, y) => { const i = (y * im.width + x) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };
  const isBox = (r, g, b) => (b > r + 12 && g > r + 8 && r > 140) || (r > g + 25 && r > 190 && g > 130);
  const isWhite = (r, g, b) => r > 232 && g > 232 && b > 232;
  const isBand = (r, g, b) => Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r > 175 && r < 215;
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function crop(im, x0, y0, w, h) {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
    w = Math.min(im.width - x0, Math.round(w)); h = Math.min(im.height - y0, Math.round(h));
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const s = ((y0 + y) * im.width + x0) * 4;
      out.set(im.data.subarray(s, s + w * 4), y * w * 4);
    }
    return { width: w, height: h, data: out };
  }
  // escala (bilineal) + gris + umbral: texto negro sobre blanco, con margen
  function prep(im, scale, pad, thr) {
    const W = Math.round(im.width * scale), H = Math.round(im.height * scale);
    const OW = W + pad * 2, OH = H + pad * 2;
    const out = new Uint8ClampedArray(OW * OH * 4).fill(255);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = Math.min(im.width - 1.001, (x + 0.5) / scale - 0.5), sy = Math.min(im.height - 1.001, (y + 0.5) / scale - 0.5);
      const x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy)), fx = Math.max(0, sx - x0), fy = Math.max(0, sy - y0);
      const L = (xx, yy) => { const [r, g, b] = px(im, xx, yy); return lum(r, g, b); };
      const v = L(x0, y0) * (1 - fx) * (1 - fy) + L(x0 + 1, y0) * fx * (1 - fy) + L(x0, y0 + 1) * (1 - fx) * fy + L(x0 + 1, y0 + 1) * fx * fy;
      const c = thr ? (v < thr ? 0 : 255) : v;
      const o = ((y + pad) * OW + x + pad) * 4;
      out[o] = out[o + 1] = out[o + 2] = c; out[o + 3] = 255;
    }
    return { width: OW, height: OH, data: out };
  }

  // ---------- geometría de la tarjeta ----------
  function runs(arr, test, minLen) {
    const r = []; let s = -1;
    for (let i = 0; i <= arr.length; i++) {
      const ok = i < arr.length && test(arr[i], i);
      if (ok && s < 0) s = i;
      if (!ok && s >= 0) { if (i - s >= (minLen || 1)) r.push([s, i - 1]); s = -1; }
    }
    return r;
  }

  function layout(im) {
    const { width: W, height: H } = im;
    // columnas con casillas de color (azul o rosa)
    const boxCol = new Array(W).fill(0), whiteCol = new Array(W).fill(0);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x++) {
      const [r, g, b] = px(im, x, y);
      if (isBox(r, g, b)) boxCol[x]++;
      if (isWhite(r, g, b) || isBand(r, g, b)) whiteCol[x]++;
    }
    const maxB = Math.max(...boxCol);
    let cols = runs(boxCol, v => v > maxB * 0.25, Math.max(4, W * 0.04));
    if (cols.length > 3) { // quedarse con las 3 más anchas y ordenarlas
      cols = cols.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 3).sort((a, b) => a[0] - b[0]);
    }
    if (cols.length !== 3) return null;
    const bw = Math.round(((cols[0][1] - cols[0][0]) + (cols[1][1] - cols[1][0]) + (cols[2][1] - cols[2][0])) / 3);
    const c1 = (cols[0][0] + cols[0][1]) / 2, c3 = (cols[1][0] + cols[1][1]) / 2, c5 = (cols[2][0] + cols[2][1]) / 2;
    const centers = [c1, (c1 + c3) / 2, c3, (c3 + c5) / 2, c5];
    // borde de la tarjeta: tramo blanco continuo que contiene las columnas
    const maxW = Math.max(...whiteCol);
    const wr = runs(whiteCol, v => v > maxW * 0.35, 3);
    let left = 0, right = W - 1;
    for (const [a, b] of wr) if (a < c1 && b >= c1 - bw) { left = a; }
    // la tarjeta puede quedar partida por las casillas: buscar el primer tramo ancho a la izquierda
    const leftRun = wr.filter(([a, b]) => b < cols[0][0] + 2).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
    if (leftRun) left = leftRun[0];
    const rightRun = wr.filter(([a, b]) => a > cols[2][1] - 2)[0];
    right = rightRun ? rightRun[1] : Math.min(W - 1, cols[2][1] + bw / 2);

    // filas: bandas grises y filas con casilla
    const bandRow = new Array(H).fill(false), boxRow = new Array(H).fill(false);
    for (let y = 0; y < H; y++) {
      let nb = 0, n = 0;
      for (let x = left + 2; x < right - 2; x += 2) { n++; const [r, g, b] = px(im, x, y); if (isBand(r, g, b)) nb++; }
      bandRow[y] = nb > n * 0.6;
      let k = 0;
      for (const ci of [0, 2, 4]) {
        let hit = 0; const cx = centers[ci];
        for (let dx = -bw * 0.4; dx <= bw * 0.4; dx += 2) { const [r, g, b] = px(im, Math.round(cx + dx), y); if (isBox(r, g, b)) hit++; }
        if (hit > bw * 0.25) k++;
      }
      boxRow[y] = k >= 1;
    }
    const bands = [];
    for (const [a, b] of runs(bandRow, v => v, 3)) {
      const last = bands[bands.length - 1];
      if (last && a - last.y1 < 12) last.y1 = b; else bands.push({ y0: a, y1: b });
    }
    for (let i = bands.length - 1; i >= 0; i--) if (bands[i].y1 - bands[i].y0 < 8) bands.splice(i, 1);
    let rows = runs(boxRow, v => v, 5).map(([a, b]) => ({ y0: a, y1: b }));
    const hs = rows.map(r => r.y1 - r.y0).sort((a, b) => a - b);
    const med = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
    // filas cortadas por arriba/abajo (bajo la barra o el menú): descartar
    rows = rows.filter(r => r.y1 - r.y0 >= med * 0.8 && r.y1 - r.y0 <= med * 1.6);
    return { left, right, centers, bw, bands, rows, boxH: med };
  }

  // ---------- clasificar una casilla ----------
  // devuelve {kind:"empty"|"dash"|"digits", box:[x0,y0,x1,y1]} mirando los píxeles oscuros
  function inkBox(im, x0, y0, w, h) {
    let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, n = 0;
    for (let y = Math.round(y0); y < y0 + h; y++) for (let x = Math.round(x0); x < x0 + w; x++) {
      const [r, g, b] = px(im, x, y);
      if (lum(r, g, b) < 110) { n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    }
    if (n < 3) return { kind: "empty" };
    const iw = maxx - minx + 1, ih = maxy - miny + 1;
    if (ih <= Math.max(3, h * 0.22) && iw >= ih) return { kind: "dash" };
    return { kind: "digits", box: [minx, miny, maxx, maxy], n };
  }

  // lee los dígitos de una casilla a partir del recuadro de tinta; prueba varios ajustes
  async function readDigits(im, box, ocr) {
    const [a, b, c, d] = box, dh = d - b + 1, pad = Math.max(3, Math.round(dh * 0.5));
    const cimg = crop(im, a - pad, b - pad, c - a + 1 + pad * 2, dh + pad * 2);
    const tries = [[40, 160, 7], [32, 185, 7], [48, 150, 10], [40, 0, 8], [56, 170, 7]];
    const votes = {};
    for (const [H, thr, psm] of tries) {
      const t = await ocr(prep(cimg, H / dh, 20, thr), { psm, whitelist: "0123456789" });
      const txt = (t.text || "").replace(/\D/g, "");
      if (txt && txt.length <= 2) { votes[txt] = (votes[txt] || 0) + 1; if (votes[txt] >= 2 || Object.keys(votes).length === 1 && tries.indexOf(tries.find(q => q[0] === H && q[1] === thr)) === 0) { if (votes[txt] >= 1 && tries[0][0] === H && tries[0][1] === thr) continue; return txt; } }
    }
    const best = Object.entries(votes).sort((p, q) => q[1] - p[1])[0];
    return best ? best[0] : "";
  }

  // lee muchas casillas de una vez: las apila en una columna y hace un solo OCR
  async function readDigitsBatch(im, boxes, ocr) {
    if (!boxes.length) return [];
    const DH = 40, SLOT = 90, pieces = boxes.map(([a, b, c, d]) => {
      const dh = d - b + 1, pad = Math.max(2, Math.round(dh * 0.3));
      return prep(crop(im, a - pad, b - pad, c - a + 1 + pad * 2, dh + pad * 2), DH / dh, 0, 160);
    });
    const W = Math.max(...pieces.map(p => p.width)) + 80, H = SLOT * pieces.length + 40;
    const out = new Uint8ClampedArray(W * H * 4).fill(255);
    pieces.forEach((p, i) => {
      const ox = 40, oy = 20 + i * SLOT + Math.round((SLOT - p.height) / 2);
      for (let y = 0; y < p.height; y++) out.set(p.data.subarray(y * p.width * 4, (y + 1) * p.width * 4), ((oy + y) * W + ox) * 4);
    });
    const r = await ocr({ width: W, height: H, data: out }, { psm: 6, whitelist: "0123456789" });
    const res = boxes.map(() => "");
    for (const l of r.words || r.lines || []) {
      const cy = (l.bbox.y0 + l.bbox.y1) / 2, i = Math.floor((cy - 20) / SLOT);
      if (i >= 0 && i < res.length) res[i] += (l.text || "").replace(/\D/g, "");
    }
    return res;
  }

  // ---------- texto ----------
  function norm(s) { return (s || "").toLowerCase().replace(/[’`´]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim(); }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function bestMatch(text, list) {
    const t = norm(text); if (!t) return null;
    let best = null, bd = 1e9;
    for (const name of list) { const d = lev(t, norm(name)); if (d < bd) { bd = d; best = name; } }
    return bd <= Math.max(2, Math.round(norm(best).length * 0.3)) ? { name: best, dist: bd } : null;
  }

  // ---------- leer una captura ----------
  // Devuelve una lista ordenada de piezas: header/band/row/eob/title/card
  async function readShot(im, ocr, opts) {
    opts = opts || {};
    const L = layout(im);
    if (!L) return { ok: false, error: "no_table", items: [] };
    const { left, right, centers, bw, bands, rows } = L;
    const scale = Math.max(1, Math.min(4, 1400 / im.width));

    // 1) OCR general de toda la imagen (etiquetas, bandas, cabeceras, título)
    const big = prep(im, scale, 0, 0);
    const full = await ocr(big, { psm: 11 });
    const lines = (full.lines || []).map(l => ({
      text: l.text.trim(),
      x0: l.bbox.x0 / scale, x1: l.bbox.x1 / scale, y0: l.bbox.y0 / scale, y1: l.bbox.y1 / scale
    })).filter(l => l.text);
    const labelEdge = centers[0] - bw * 0.6;
    const items = [];

    // título "(88 - 82) Results"
    for (const l of lines) {
      const m = l.text.replace(/[oO]/g, "0").match(/\(?\s*(\d{1,3})\s*[-–—~]\s*(\d{1,3})\s*\)?\s*Res/i);
      if (m && l.y0 < im.height * 0.15) { items.push({ kind: "title", me: +m[1], opp: +m[2], y: l.y0 }); break; }
    }

    // bandas: PRIMARY / SECONDARY / PAINTED con su "x/45"
    for (const b of bands) {
      const ls = lines.filter(l => l.y1 > b.y0 - 2 && l.y0 < b.y1 + 2);
      const txt = ls.map(l => l.text).join(" ");
      let type = /prim/i.test(txt) ? "primary" : /secon|second/i.test(txt) ? "secondary" : /paint|ready|battle/i.test(txt) ? "painted" : null;
      // valor de la derecha: OCR dedicado con números
      const vx = left + (right - left) * 0.72, vw = right - vx - 4;
      const v = await ocr(prep(crop(im, vx, b.y0, vw, b.y1 - b.y0 + 1), Math.max(2, 60 / (b.y1 - b.y0)), 10, 0), { psm: 7, whitelist: "0123456789/" });
      let m = (v.text || "").match(/(\d{1,2})\s*\/\s*(\d{2})/);
      if (!m) { const d = (v.text || "").replace(/\D/g, ""); const mm = d.match(/^(\d{1,2})(45|10)$/) || d.match(/^(\d{1,2})[17](45|10)$/); if (mm) m = mm; }
      items.push({ kind: "band", type, value: m ? +m[1] : null, max: m ? +m[2] : null, y: b.y0, y1: b.y1, raw: txt });
    }

    // cabeceras You / Opponent (con VP)
    for (const l of lines) {
      if (l.x0 > labelEdge) continue;
      const t = l.text.replace(/[^A-Za-z]/g, "");
      if (/^you$/i.test(t) || /^opp?on+ent$/i.test(t) || lev(t.toLowerCase(), "opponent") <= 2 && t.length > 5) {
        items.push({ kind: "header", side: /^y/i.test(t) ? "me" : "opp", y: l.y0, y1: l.y1 });
      }
    }

    // filas con casillas
    const rowItems = [];
    // cada línea de etiqueta va a la fila cuyo centro está más cerca
    const pitch = rows.length > 1 ? Math.min(...rows.slice(1).map((r, i) => r.y0 - rows[i].y0)) : L.boxH * 1.3;
    const lab = rows.map(() => []);
    for (const l of lines) {
      if (l.x1 > labelEdge + bw * 0.3 || l.x0 < left - 2) continue;
      const cy = (l.y0 + l.y1) / 2;
      let bi = -1, bd = 1e9;
      rows.forEach((r, i) => { const d = Math.abs(cy - (r.y0 + r.y1) / 2); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0 && bd < pitch * 0.55) lab[bi].push(l);
    }
    const pend = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      const cy0 = r.y0, h = r.y1 - r.y0 + 1;
      const lbl = lab[ri].sort((a, b) => a.y0 - b.y0).map(l => l.text).join(" ");
      const vals = [], raw = [];
      for (let c = 0; c < 5; c++) {
        const x0 = centers[c] - bw / 2 + 3, w = bw - 6;
        const ib = inkBox(im, x0, cy0 + 3, w, h - 6);
        if (ib.kind !== "digits") { vals.push(ib.kind === "dash" ? 0 : null); raw.push(ib.kind); continue; }
        vals.push(null); raw.push("?"); pend.push({ ri: rowItems.length, c, box: ib.box });
      }
      rowItems.push({ kind: "row", label: lbl, values: vals, raw, y: cy0, y1: r.y1 });
    }
    const got = await readDigitsBatch(im, pend.map(p => p.box), ocr);
    for (let i = 0; i < pend.length; i++) {
      let t = got[i];
      if (!t || t.length > 2) t = await readDigits(im, pend[i].box, ocr);   // segundo intento, casilla a casilla
      const it = rowItems[pend[i].ri];
      it.values[pend[i].c] = t ? +t : null; it.raw[pend[i].c] = t || "?";
    }
    items.push(...rowItems);

    // "End of Battle": línea de texto sin casillas; valor en la columna 5
    for (const l of lines) {
      if (!/end|battle/i.test(l.text) || l.x0 > labelEdge || /paint/i.test(l.text)) continue;
      if (bands.some(b => l.y1 > b.y0 && l.y0 < b.y1)) continue;
      if (lev(norm(l.text), "end of battle") > 4) continue;
      const h = Math.max(L.boxH, (l.y1 - l.y0) * 1.6), cy = (l.y0 + l.y1) / 2 - h / 2;
      const ib = inkBox(im, centers[4] - bw / 2 + 2, cy, bw - 4, h);
      let val = 0;
      if (ib.kind === "digits") {
        const [a, b2, c2, d] = ib.box, ch = d - b2 + 7;
        const t = await ocr(prep(crop(im, a - 3, b2 - 3, c2 - a + 7, ch), 48 / ch, 16, 150), { psm: 7, whitelist: "0123456789" });
        val = +(t.text || "").replace(/\D/g, "") || 0;
      }
      items.push({ kind: "eob", value: val, y: l.y0, y1: l.y1 });
    }

    // tarjeta de arriba (fecha, nombres) si aparece
    for (const l of lines) {
      const m = l.text.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(20\d\d)/);
      if (m && l.y0 < im.height * 0.5) { items.push({ kind: "date", d: +m[1], m: +m[2], yy: +m[3], y: l.y0 }); break; }
    }
    items.sort((a, b) => a.y - b.y);
    return { ok: true, items, layout: L, lines };
  }

  // ---------- unir piezas en una partida ----------
  function rowKey(it) { return it.kind + "|" + (it.kind === "row" ? norm(it.label) + "|" + it.values.join(",") : it.kind === "band" ? it.type + it.value : it.kind === "header" ? it.side : ""); }
  // concatena dos listas eliminando el solape (sufijo de A == prefijo de B)
  function mergeSeq(A, B) {
    const ka = A.map(rowKey), kb = B.map(rowKey);
    let best = 0;
    for (let k = Math.min(ka.length, kb.length); k >= 1; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) if (ka[ka.length - k + i] !== kb[i]) { ok = false; break; }
      if (ok) { best = k; break; }
    }
    if (!best) { // buscar B[0] dentro de A (solape parcial con ruido)
      for (let i = 0; i < ka.length; i++) if (ka[i] === kb[0] && kb[0].startsWith("row")) {
        let j = 0; while (i + j < ka.length && j < kb.length && ka[i + j] === kb[j]) j++;
        if (i + j === ka.length) { best = j; break; }
      }
    }
    return A.concat(B.slice(best));
  }

  function emptySide() { return { primary: { name: "", rounds: [0, 0, 0, 0, 0] }, secondaries: [], cp: [0, 0, 0, 0, 0], painted: null, totals: {} }; }

  // interpreta la secuencia de piezas de arriba a abajo
  function assemble(items) {
    const g = { date: "", me: emptySide(), opp: emptySide(), title: null, warnings: [] };
    let side = null, sect = null;
    for (const it of items) {
      if (it.kind === "title") { g.title = { me: it.me, opp: it.opp }; continue; }
      if (it.kind === "date") { g.date = `${it.yy}-${String(it.m).padStart(2, "0")}-${String(it.d).padStart(2, "0")}`; continue; }
      if (it.kind === "header") { side = it.side; sect = null; continue; }
      if (it.kind === "band") {
        sect = it.type;
        // sin cabecera visible: deducir lado (si ya vimos pintado del lado "me" pasamos a "opp")
        if (!side) side = "me";
        if (it.type === "primary" && g[side].totals.primary != null && side === "me") side = "opp";
        if (it.type) g[side].totals[it.type] = it.value;
        if (it.type === "painted") { g[side].painted = it.value; }
        continue;
      }
      if (!side) side = "me";
      const S = g[side];
      if (it.kind === "eob") { S.eob = it.value; continue; }
      if (it.kind === "row") {
        const v = it.values.map(x => x == null ? null : x);
        if (/cp|remain/i.test(it.label)) { S.cp = v.map(x => x || 0); sect = "after"; continue; }
        if (sect === "primary") {
          const m = bestMatch(it.label, PRIMS);
          S.primary = { name: m ? m.name : it.label, rounds: v.map(x => x || 0), unknown: v.some(x => x == null) };
          continue;
        }
        const m = bestMatch(it.label, SECS);
        const name = m ? m.name : it.label;
        if (!S.secondaries.some(s => s.name === name)) S.secondaries.push({ name, rounds: v.map(x => x || 0), unknown: v.some(x => x == null) });
      }
    }
    for (const k of ["me", "opp"]) {
      const S = g[k];
      if (S.eob) S.primary.rounds[4] += S.eob;
      const p = S.primary.rounds.reduce((a, b) => a + b, 0), s = S.secondaries.reduce((a, x) => a + x.rounds.reduce((p, q) => p + q, 0), 0);
      S.check = {
        primary: S.totals.primary == null ? null : p === S.totals.primary,
        secondary: S.totals.secondary == null ? null : s === S.totals.secondary,
        total: g.title ? (p + s + (S.painted || 0)) === g.title[k] : null
      };
      if (S.painted == null) S.painted = 10;
    }
    return g;
  }

  const api = { layout, readShot, mergeSeq, assemble, setPrimaries, bestMatch, SECS, crop, prep };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.WJReader = api;
})(typeof window !== "undefined" ? window : globalThis);
