/* Lectura gratuita de capturas en el propio móvil: Tesseract (OCR) + reconocimiento
   de ejércitos por la ilustración. Usa WJReader (reader.js). */
(function () {
  "use strict";
  let workerP = null;
  function getWorker(onProg) {
    if (!workerP) {
      workerP = Tesseract.createWorker("eng", 1, {
        workerPath: "vendor/tesseract/worker.min.js",
        corePath: "vendor/tesseract/core",
        langPath: "vendor/tesseract/lang",
        gzip: true,
        logger: m => { if (onProg && m.status && /load|initializ/i.test(m.status)) onProg(m); }
      }).catch(e => { workerP = null; throw e; });
    }
    return workerP;
  }
  function toCanvas(img) {
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    c.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  }
  async function ocr(img, o) {
    const w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: String(o.psm || 6), tessedit_char_whitelist: o.whitelist || "" });
    const r = await w.recognize(toCanvas(img), {}, { blocks: true, text: true });
    const lines = [], words = [];
    for (const b of r.data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
      lines.push({ text: l.text, bbox: l.bbox });
      for (const wd of l.words) words.push({ text: wd.text, bbox: wd.bbox });
    }
    return { text: r.data.text, lines, words };
  }
  async function blobToImage(blob, maxW) {
    let bmp; try { bmp = await createImageBitmap(blob, { colorSpaceConversion: "none" }); } catch (e) { bmp = await createImageBitmap(blob); }
    const sc = Math.min(1, (maxW || 1400) / bmp.width);
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height);
    return { width: c.width, height: c.height, data: d.data };
  }

  /* ---------- ejércitos por la ilustración ---------- */
  // huella de color: histograma HSV 16x4x4 de la imagen reducida a 48x48 (normalizado)
  function rgb2hsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
    return [Math.min(255, Math.floor(h * 256)), mx ? Math.floor(d / mx * 255) : 0, mx];
  }
  function featOf(img, x0, y0, w, h) {
    const N = 48, hist = new Float32Array(256);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = Math.min(img.width - 1, Math.round(x0 + (i + 0.5) * w / N)), y = Math.min(img.height - 1, Math.round(y0 + (j + 0.5) * h / N));
      const k = (y * img.width + x) * 4, [H, S, V] = rgb2hsv(img.data[k], img.data[k + 1], img.data[k + 2]);
      hist[Math.floor(H * 16 / 256) * 16 + Math.floor(S * 4 / 256) * 4 + Math.floor(V * 4 / 256)]++;
    }
    for (let i = 0; i < 256; i++) hist[i] /= N * N;
    return Array.from(hist, v => Math.round(v * 10000) / 10000);
  }
  // parecido de Bhattacharyya entre dos histogramas (1 = idénticos)
  const inter = (a, b) => { if (!a || !b || a.length !== b.length) return 0; let s = 0; for (let i = 0; i < a.length; i++) s += Math.sqrt(a[i] * b[i]); return s; };

  const findCard = img => WJReader.findCard(img);

  let refs = null; // [{army, feat}]
  async function loadRefs(extra) {
    if (!refs) {
      refs = [];
      const list = window.ARMY_FILES || {};
      await Promise.all(Object.entries(list).map(async ([army, file]) => {
        try {
          const img = await blobToImage(await (await fetch("img/facciones/" + file)).blob(), 400);
          // la parte izquierda del recorte es el borde rasgado oscuro: se ignora
          refs.push({ army, feat: featOf(img, img.width * 0.35, 0, img.width * 0.65, img.height), base: true });
        } catch (e) { }
      }).concat(Object.entries(window.ARMY_CARDS || {}).map(async ([army, file]) => {
        try {
          const img = await blobToImage(await (await fetch("img/tarjetas/" + file)).blob(), 400);
          refs.push({ army, feat: featOf(img, 0, 0, img.width, img.height), card: true });
        } catch (e) { }
      })));
    }
    return refs.concat(extra || []);
  }
  function rankArmies(feat, all) {
    const best = {};
    for (const r of all) { const s = inter(feat, r.feat); if (!(best[r.army] >= s)) best[r.army] = s; }
    return Object.entries(best).sort((a, b) => b[1] - a[1]).map(([army, score]) => ({ army, score }));
  }
  async function armiesFromCard(img, learned) {
    const c = findCard(img); if (!c) return null;
    const w = c.x1 - c.x0, h = c.y1 - c.y0, iw = w * 0.2, ih = h * 0.84, iy = c.y0 + h * 0.08;
    const fl = featOf(img, c.x0 + w * 0.01, iy, iw, ih), fr = featOf(img, c.x1 - w * 0.01 - iw, iy, iw, ih);
    const all = await loadRefs(learned);
    return { me: rankArmies(fl, all).slice(0, 4), opp: rankArmies(fr, all).slice(0, 4), featMe: fl, featOpp: fr };
  }

  /* ---------- leer 1 o 2 fotos ---------- */
  async function readPhotos(blobs, onStatus, learned) {
    onStatus && onStatus("Preparando el lector (la primera vez tarda un poco)…");
    await getWorker();
    const shots = [], imgs = []; let arm = null;
    for (let i = 0; i < blobs.length; i++) {
      onStatus && onStatus(blobs.length > 1 ? `Leyendo la captura ${i + 1} de ${blobs.length}…` : "Leyendo la captura…");
      const img = await blobToImage(blobs[i], 1400);
      const r = await WJReader.readShot(img, ocr);
      if (!r.ok) continue;
      shots.push({ items: r.items }); imgs.push(img);
      if (!arm) arm = await armiesFromCard(img, learned).catch(() => null);
    }
    if (!shots.length) return null;
    onStatus && onStatus("Comprobando las sumas…");
    const g = await WJReader.repair(shots, imgs, ocr);
    g.armies = arm;
    return g;
  }

  /* ---------- vídeo: fotogramas → partidas ---------- */
  async function videoFrames(file, onProg, onFrame, onPause) {
    const url = URL.createObjectURL(file), v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => ko(new Error("video")); setTimeout(() => ko(new Error("video")), 20000); });
    const dur = v.duration || 0, step = dur > 300 ? dur / 300 : 0.5, frames = [];
    const sc = Math.min(1, 1000 / v.videoWidth), c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * sc); c.height = Math.round(v.videoHeight * sc);
    const x = c.getContext("2d", { willReadFrequently: true }), t = document.createElement("canvas"); t.width = 24; t.height = 48;
    const tx = t.getContext("2d", { willReadFrequently: true });
    let prev = null;
    for (let ts = 0.1; ts < dur; ts += step) {
      // si la pestaña está en segundo plano el navegador frena el vídeo: esperar a que vuelva
      if (document.hidden) { onPause && onPause(true); await new Promise(r => { const f = () => { if (!document.hidden) { document.removeEventListener("visibilitychange", f); r(); } }; document.addEventListener("visibilitychange", f); }); onPause && onPause(false); }
      let okSeek = false;
      for (let tries = 0; tries < 3 && !okSeek; tries++) {
        okSeek = await new Promise(r => { const t = setTimeout(() => r(false), 4000); v.onseeked = () => { clearTimeout(t); r(true); }; v.currentTime = ts; });
      }
      if (!okSeek) continue;
      tx.drawImage(v, 0, 0, 24, 48); const d = tx.getImageData(0, 0, 24, 48).data, g = [];
      for (let i = 0; i < d.length; i += 4) g.push(d[i] + d[i + 1] + d[i + 2]);
      if (prev) { let diff = 0; for (let i = 0; i < g.length; i++) diff += Math.abs(g[i] - prev[i]); if (diff / g.length < 18) continue; }
      prev = g; x.drawImage(v, 0, 0, c.width, c.height);
      const id = x.getImageData(0, 0, c.width, c.height);
      onProg && onProg(Math.min(1, ts / dur));
      await onFrame({ width: c.width, height: c.height, data: id.data, t: ts });
    }
    URL.revokeObjectURL(url);
    return frames;
  }
  function imgToBlob(img) {
    const c = toCanvas(img); return new Promise(r => c.toBlob(r, "image/jpeg", .85));
  }
  async function readVideo(file, onStatus, learned) {
    onStatus && onStatus("Preparando el lector…");
    await getWorker();
    const groups = new Map(); // "88-82" -> {shots, imgs, arm, frame, g}
    let pct = 0, curKey = null;
    const finalize = async G => { if (!G || G.g) return; G.g = await WJReader.repair(G.shots, null, ocr); G.shots.forEach(x => { x.img = null; }); };
    const paused = on => { if (on && onStatus) onStatus("En pausa: vuelve a esta pestaña para que siga leyendo el vídeo."); };
    await videoFrames(file, p => { pct = Math.round(p * 100); }, async img => {
      onStatus && onStatus(`Leyendo el vídeo… ${pct}%` + (groups.size ? ` · ${groups.size} partida${groups.size > 1 ? "s" : ""} encontrada${groups.size > 1 ? "s" : ""}` : ""));
      if (!WJReader.layout(img)) return; // solo pantallas Results
      const r = await WJReader.readShot(img, ocr);
      if (!r.ok) return;
      const t = r.items.find(x => x.kind === "title"); if (!t) return;
      const k = t.me + "-" + t.opp;
      if (curKey && curKey !== k) await finalize(groups.get(curKey));
      curKey = k;
      let G = groups.get(k);
      if (!G) { G = { shots: [], arm: null, frame: null, g: null }; groups.set(k, G); }
      if (G.g) { G.g = null; } // volvió a una partida ya cerrada: se recalcula sin repasar
      G.shots.push({ items: r.items, img });
      if (!G.arm) { const a = await armiesFromCard(img, learned).catch(() => null); if (a) { G.arm = a; G.frame = await imgToBlob(img); } }
      if (!G.frame) G.frame = await imgToBlob(img);
    }, paused);
    // títulos mal leídos ("87-43" en vez de "87-45"): unir grupos pequeños con otro que comparta filas
    const rk = it => (it.label || "").toLowerCase().replace(/[^a-z]/g, "") + "|" + (it.values || []).join(",");
    const keysOf = G => new Set(G.shots.flatMap(x => x.items.filter(i => i.kind === "row" && (i.values || []).some(v => v)).map(rk)));
    for (const [k, G] of [...groups.entries()].sort((a, b) => a[1].shots.length - b[1].shots.length)) {
      const [a, b] = k.split("-").map(Number), mine = keysOf(G);
      let best = null, bs = 0;
      for (const [k2, H] of groups) {
        if (k2 === k || H.shots.length <= G.shots.length) continue;
        const [c, d] = k2.split("-").map(Number);
        const oneDigit = (x, y) => { const X = String(x), Y = String(y); return X.length === Y.length && [...X].filter((ch, i) => ch !== Y[i]).length === 1; };
        if (!((a === c && oneDigit(b, d)) || (b === d && oneDigit(a, c)))) continue;
        const other = keysOf(H); let n = 0; mine.forEach(x => { if (other.has(x)) n++; });
        if (n > bs) { bs = n; best = H; }
      }
      if (best && bs >= 2) { best.shots.push(...G.shots); best.g = null; if (!best.arm) { best.arm = G.arm; best.frame = best.frame || G.frame; } groups.delete(k); }
    }
    const out = [];
    for (const G of groups.values()) {
      if (!G.g) await finalize(G);
      const g = G.g || WJReader.mergeShots(G.shots);
      g.armies = G.arm;
      g.frameBlob = G.frame || null;
      out.push(g);
    }
    return out;
  }

  window.Lector = { readPhotos, readVideo, getWorker, findCard, featOf, loadRefs, rankArmies };
})();
