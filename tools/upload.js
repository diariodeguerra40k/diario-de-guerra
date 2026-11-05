/* ---------- Leer capturas con el lector gratuito (en el propio móvil) ---------- */
let draftArm = null; // ilustraciones de la captura, para aprender si el usuario corrige el ejército
const ARMY_NAME = f => ARMIES.find(a => a.replace(/[^a-z]/gi, "").toLowerCase() === f.replace(/[^a-z]/gi, "").toLowerCase()) || "";
function lastMyArmy(){ const c = {}; realGames.forEach(g => { if(g.me?.army) c[g.me.army] = (c[g.me.army]||0) + 1; }); return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0] || (ls("dg40k.last")||{}).army || ""; }
function fromReader(r){
  const side = (S, k) => ({ name: "", army: "", detachment: "",
    primary: { name: S.primary.name || "", rounds: S.primary.rounds.slice(0,5) },
    secondaries: S.secondaries.map(x => ({ name: x.name, rounds: x.rounds.slice(0,5) })),
    cp: S.cp.slice(0,5), painted: S.painted ?? 10 });
  const g = { me: side(r.me, "me"), opp: side(r.opp, "opp"), date: r.date || null, source: "lector" };
  if(r.names?.opp) g.opp.name = r.names.opp;
  const warn = [];
  // ejércitos por la ilustración
  draftArm = null;
  if(r.armies){
    draftArm = { me: r.armies.featMe, opp: r.armies.featOpp, guessMe: "", guessOpp: "" };
    const top = (list) => list && list[0] && list[0].score > 0.7 && (!list[1] || list[0].score - list[1].score >= 0.06) ? ARMY_NAME(list[0].army) : "";
    const habit = lastMyArmy();
    const meList = r.armies.me || [], oppList = r.armies.opp || [];
    g.me.army = (habit && meList.slice(0,3).some(x => ARMY_NAME(x.army) === habit)) ? habit : top(meList);
    g.opp.army = top(oppList);
    draftArm.guessMe = g.me.army; draftArm.guessOpp = g.opp.army;
    draftArm.sugMe = meList.slice(0,3).map(x => ARMY_NAME(x.army)).filter(Boolean);
    draftArm.sugOpp = oppList.slice(0,3).map(x => ARMY_NAME(x.army)).filter(Boolean);
  }
  // comprobaciones con los totales de la propia captura
  for(const k of ["me","opp"]){
    const S = r[k], who = k === "me" ? "tus" : "del rival";
    if(S.check.primary === false) warn.push(`la primaria ${who} no suma lo que pone (${S.totals.primary})`);
    if(S.check.secondary === false) warn.push(`las secundarias ${who} no suman lo que pone (${S.totals.secondary})`);
    if(S.secondaries.some(x => x.unknownName)) warn.push(`hay alguna secundaria ${who === "tus" ? "tuya" : "del rival"} con el nombre mal leído`);
    if(S.primary.unknown || S.secondaries.some(x => x.unknown)) warn.push(`hay alguna casilla ${who === "tus" ? "tuya" : "del rival"} que no he podido leer`);
  }
  if(r.title){
    if(total(g.me) !== r.title.me) warn.push(`tu total da ${total(g.me)} y la captura dice ${r.title.me}`);
    if(total(g.opp) !== r.title.opp) warn.push(`el total del rival da ${total(g.opp)} y la captura dice ${r.title.opp}`);
  }
  if(!g.me.secondaries.length || !g.opp.secondaries.length) warn.push("faltan secundarias de algún jugador: quizá falta alguna captura");
  if(r.me.totals.secondary == null || r.opp.totals.secondary == null) warn.push("no he visto entera la pantalla: sube capturas que cubran desde arriba hasta abajo");
  return { g, warn, title: r.title };
}
function reviewText(x, prefix){
  const a = x.g.me.army && x.g.opp.army ? `${x.g.me.army} contra ${x.g.opp.army}. ` : "";
  const missing = !x.g.me.army || !x.g.opp.army ? " Elige el ejército que falta (te dejo sugerencias)." : " Comprueba que los ejércitos son correctos.";
  return (prefix || "Leído. ") + a + (x.warn.length ? "Ojo: " + x.warn.join("; ") + ". Revisa esas casillas." : "Todo cuadra con los totales de la captura.") + missing + " Completa layout y destacamentos.";
}
async function readImage(blobIn){
  const blobs = Array.isArray(blobIn) ? blobIn.slice(0,6) : [blobIn];
  draftImg = await shrink(blobs[0]); setStep(1);
  try{
    const r = await Lector.readPhotos(blobs, m => status(m), learnedRefs);
    status("");
    if(!r){ status("No encuentro la tabla de resultados en la captura. Sube la pantalla «Results» del War Journal o rellénalo a mano.", true); return; }
    const x = fromReader(r);
    startReview(x.g, reviewText(x));
  }catch(e){
    console.error(e);
    status("No se pudo leer la captura. Puedes rellenar los datos a mano.", true);
    startReview(null, "Rellena los datos de la partida.");
  }
}
/* ---------- Vídeo con varias partidas ---------- */
let videoQueue = [], videoTotal = 0;
async function readVideo(file){
  setStep(1); videoQueue = []; videoTotal = 0;
  try{
    const found = await Lector.readVideo(file, m => status(m), learnedRefs);
    const all = found.map(r => ({ ...fromReader(r), frame: r.frameBlob })).sort((a,b) => (a.g.date||"").localeCompare(b.g.date||""));
    const isDup = x => games.some(h => h.date === x.g.date && x.title && total(h.me) === x.title.me && total(h.opp) === x.title.opp);
    const fresh = all.filter(x => !isDup(x)), dups = all.length - fresh.length;
    if(!fresh.length){ status(all.length ? `He encontrado ${all.length} partida${all.length>1?"s":""} en el vídeo, pero ya ${all.length>1?"están":"está"} en tu historial.` : "No he encontrado ninguna pantalla de resultados en el vídeo.", !all.length); return; }
    videoQueue = fresh; videoTotal = fresh.length;
    status(`He encontrado ${all.length} partida${all.length>1?"s":""}${dups?` (${dups} ya estaba${dups>1?"n":""} en tu historial)`:""}. Revísalas una a una.`);
    nextFromVideo();
  }catch(e){
    console.error(e);
    status("No se pudo leer el vídeo. Prueba con un vídeo MP4 o MOV más corto, o sube capturas.", true);
  }
}
async function nextFromVideo(){
  const x = videoQueue.shift(); if(!x) return false;
  draftImg = x.frame ? await shrink(x.frame) : null;
  draftArm = null;
  const n = videoTotal - videoQueue.length;
  startReview(x.g, reviewText(x, `Partida ${n} de ${videoTotal} del vídeo. `) + (videoQueue.length ? " Al guardar pasarás a la siguiente; «Cancelar» la salta." : ""));
  return true;
}
function pickFiles(list){
  const fs = [...(list||[])], vid = fs.find(f => f.type.startsWith("video/")), imgs = fs.filter(f => f.type.startsWith("image/"));
  if(vid) return readVideo(vid);
  if(imgs.length) readImage(imgs.slice(0,6));
}
/* si el usuario corrige el ejército, guardar la huella de la ilustración para acertar la próxima vez (para todos) */
function learnArmies(d){
  const a = draftArm; draftArm = null; if(!a || !sb) return;
  const rows = [];
  if(a.me && d.me.army && d.me.army !== a.guessMe) rows.push({ army: d.me.army, feat: a.me });
  if(a.opp && d.opp.army && d.opp.army !== a.guessOpp) rows.push({ army: d.opp.army, feat: a.opp });
  // también refuerza aciertos de facciones con pocas referencias aprendidas
  for(const [f, arm] of [[a.me, d.me.army], [a.opp, d.opp.army]]) if(f && arm && !rows.some(r => r.army === arm) && learnedRefs.filter(r => r.army === arm).length < 3) rows.push({ army: arm, feat: f });
  if(rows.length){ learnedRefs.push(...rows.map(r => ({ army: r.army, feat: r.feat }))); sb.from("army_refs").insert(rows).then(()=>{}, ()=>{}); }
}
function renderArmySug(){
  for(const k of ["me","opp"]){
    const inp = $("#"+k+"Army"); inp.parentElement.querySelectorAll(".arm-sug").forEach(n => n.remove());
    const list = draftArm && (k === "me" ? draftArm.sugMe : draftArm.sugOpp);
    if(!list || !list.length) continue;
    const d = document.createElement("div"); d.className = "arm-sug";
    d.innerHTML = `<span class="muted">${inp.value ? "¿No es? Prueba:" : "Por la ilustración, ¿es…?"}</span>` + list.filter(a => a !== inp.value).map(a => `<button type="button" data-arm="${esc(a)}">${esc(a)}</button>`).join("");
    d.onclick = e => { const b = e.target.closest("[data-arm]"); if(!b) return; inp.value = b.dataset.arm; inp.dispatchEvent(new Event("input", {bubbles:true})); renderArmySug(); };
    inp.parentElement.append(d);
  }
}
