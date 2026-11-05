/* ---------- Cuentas y almacenamiento: Supabase (cada usuario solo ve lo suyo) ---------- */
let games = [], realGames = [], storeMode = "loading", uid = null, learnedRefs = [];
const LS_KEY = "dg40k.games";
const sb = (window.supabase && window.DG_CONFIG && DG_CONFIG.url && DG_CONFIG.key) ? supabase.createClient(DG_CONFIG.url, DG_CONFIG.key) : null;

function gateHTML(mode, msg){
  const reg = mode === "signup", reset = mode === "reset", newpw = mode === "newpw";
  return `<div class="gate-card">
    <div class="gate-brand"><svg width="54" height="54" viewBox="0 0 44 44" aria-hidden="true"><path d="M22 2 L40 9 V22 C40 32 32 39.5 22 42 C12 39.5 4 32 4 22 V9 Z" fill="var(--red)"/><path d="M22 8 V36 M12 17 H32" stroke="#fff" stroke-width="4"/><circle cx="22" cy="17" r="4.5" fill="var(--band)" stroke="#fff" stroke-width="2"/></svg>
      <div><div class="t">Diario de <em>Guerra</em></div><small>Registro de batallas · Warhammer 40.000</small></div></div>
    ${newpw ? `<h2>Nueva contraseña</h2>` : reset ? `<h2>Recuperar contraseña</h2><p class="muted">Te enviaremos un correo con un enlace para poner una contraseña nueva.</p>` :
      `<div class="gate-tabs" role="tablist"><button type="button" role="tab" data-gmode="login" aria-selected="${!reg}">Entrar</button><button type="button" role="tab" data-gmode="signup" aria-selected="${reg}">Crear cuenta</button></div>`}
    <form id="gateForm" novalidate>
      ${reg ? `<label>Tu nombre de jugador<input id="gName" autocomplete="nickname" required maxlength="40" placeholder="Por ejemplo, Miquel"></label>` : ""}
      ${newpw ? "" : `<label>Correo electrónico<input id="gEmail" type="email" autocomplete="email" required placeholder="tu@correo.com"></label>`}
      ${reset ? "" : `<label>Contraseña<input id="gPass" type="password" autocomplete="${reg||newpw ? "new-password" : "current-password"}" required minlength="6" placeholder="${reg||newpw ? "Mínimo 6 caracteres" : ""}"></label>`}
      <p class="gate-msg" id="gateMsg" role="status">${msg || ""}</p>
      <button class="primary" type="submit" id="gateBtn">${newpw ? "Guardar contraseña" : reset ? "Enviar enlace" : reg ? "Crear cuenta y entrar" : "Entrar"}</button>
      ${mode === "login" ? `<button type="button" class="ghost" data-gmode="reset">¿Has olvidado la contraseña?</button>` : ""}
      ${reset ? `<button type="button" class="ghost" data-gmode="login">Volver</button>` : ""}
    </form></div>`;
}
let gateMode = "login";
function showGate(mode, msg){
  gateMode = mode || "login";
  const g = $("#authGate"); g.innerHTML = gateHTML(gateMode, msg); g.hidden = false; document.body.classList.add("gated");
  const f = g.querySelector("input"); if(f && matchMedia("(min-width:700px)").matches) f.focus();
}
function hideGate(){ $("#authGate").hidden = true; $("#authGate").innerHTML = ""; document.body.classList.remove("gated"); }
const AUTH_ERR = m => /invalid login/i.test(m) ? "Correo o contraseña incorrectos." :
  /already registered|already exists/i.test(m) ? "Ya hay una cuenta con ese correo. Pulsa «Entrar»." :
  /password.*(6|short|least)/i.test(m) ? "La contraseña tiene que tener al menos 6 caracteres." :
  /email.*invalid|invalid.*email|valid email/i.test(m) ? "Ese correo no parece válido." :
  /rate|too many/i.test(m) ? "Demasiados intentos seguidos. Espera un minuto y vuelve a probar." :
  /not confirmed/i.test(m) ? "Tienes que confirmar el correo: revisa tu bandeja de entrada." :
  "No se ha podido completar. Comprueba la conexión e inténtalo otra vez.";
document.addEventListener("click", e => { const b = e.target.closest("[data-gmode]"); if(b && $("#authGate").contains(b)) showGate(b.dataset.gmode); });
document.addEventListener("submit", async e => {
  if(e.target.id !== "gateForm") return; e.preventDefault();
  const msg = $("#gateMsg"), btn = $("#gateBtn"), v = id => ($(id)?.value || "").trim();
  const email = v("#gEmail"), pass = $("#gPass")?.value || "", name = v("#gName");
  if(gateMode === "signup" && !name){ msg.textContent = "Escribe tu nombre de jugador."; return; }
  if(gateMode !== "newpw" && !/^\S+@\S+\.\S+$/.test(email)){ msg.textContent = "Escribe un correo válido."; return; }
  if(gateMode !== "reset" && pass.length < 6){ msg.textContent = "La contraseña tiene que tener al menos 6 caracteres."; return; }
  btn.disabled = true; msg.textContent = "Un momento…";
  try{
    let r;
    if(gateMode === "login") r = await sb.auth.signInWithPassword({ email, password: pass });
    else if(gateMode === "signup") r = await sb.auth.signUp({ email, password: pass, options: { data: { name } } });
    else if(gateMode === "reset") r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    else r = await sb.auth.updateUser({ password: pass });
    if(r.error) throw r.error;
    if(gateMode === "reset"){ msg.textContent = "Listo. Revisa tu correo y abre el enlace para poner una contraseña nueva."; btn.disabled = false; return; }
    if(gateMode === "signup" && !r.data.session){ msg.textContent = "Cuenta creada. Revisa tu correo para confirmarla y después entra."; btn.disabled = false; return; }
    if(gateMode === "newpw"){ toast("Contraseña cambiada"); history.replaceState(null, "", location.pathname); }
  }catch(err){ msg.textContent = AUTH_ERR(String(err?.message || err)); btn.disabled = false; }
});

async function loadGames(){
  const { data, error } = await sb.from("games").select("id,data,created_at").order("created_at");
  if(error) throw error;
  realGames = data.map(r => ({ ...r.data, id: r.id }));
  storeMode = "cloud"; refresh();
}
async function loadLearned(){
  try{ const { data } = await sb.from("army_refs").select("army,feat").limit(2000); learnedRefs = (data || []).map(r => ({ army: r.army, feat: r.feat })); }catch(e){}
}
let started = false;
async function onSession(session){
  if(!session){ uid = null; realGames = []; storeMode = "loading"; started = false; refresh(); showGate(gateMode === "signup" ? "signup" : "login"); return; }
  if(started && uid === session.user.id) return;
  started = true; uid = session.user.id;
  defaultName = (session.user.user_metadata?.name || session.user.email.split("@")[0]).split(" ")[0];
  hideGate();
  try{ await loadGames(); loadLearned(); maybeImport(); }
  catch(e){ storeMode = "error"; refresh(); }
}
async function initStore(){
  if(!sb){ storeMode = "error"; refresh(); showGate("login", "La web aún no está conectada a la base de datos."); return; }
  sb.auth.onAuthStateChange((ev, session) => {
    if(ev === "PASSWORD_RECOVERY"){ showGate("newpw"); return; }
    setTimeout(() => onSession(session), 0);
  });
  const { data } = await sb.auth.getSession();
  if(!data.session) showGate("login");
}
$("#logoutBtn").onclick = async () => { await sb.auth.signOut(); location.hash = "panel"; };

const isUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
async function saveGame(g){
  const body = JSON.parse(JSON.stringify(g)); delete body.example; const id = body.id; delete body.id;
  if(isUuid(id)){
    const { error } = await sb.from("games").update({ data: body, updated_at: new Date().toISOString() }).eq("id", id);
    if(error) throw error;
    realGames = realGames.map(x => x.id === id ? { ...body, id } : x);
  } else {
    const { data, error } = await sb.from("games").insert({ data: body }).select("id").single();
    if(error) throw error;
    realGames = realGames.concat({ ...body, id: data.id });
  }
  refresh();
}
async function deleteGame(id){
  const { error } = await sb.from("games").delete().eq("id", id);
  if(error) throw error;
  realGames = realGames.filter(x => x.id !== id); refresh();
}

/* Importar las partidas de octubre de Miquel (solo con el enlace #importar-octubre) */
async function maybeImport(){
  if(location.hash !== "#importar-octubre") return;
  history.replaceState(null, "", location.pathname + "#historial"); route();
  try{
    const list = await (await fetch("seed/partidas-octubre-2026.json")).json();
    const have = new Set(realGames.map(g => g.date + "|" + total(g.me) + "|" + total(g.opp)));
    const fresh = list.filter(g => !have.has(g.date + "|" + total(g.me) + "|" + total(g.opp)));
    if(!fresh.length){ toast("Esas partidas ya están en tu historial"); return; }
    if(!confirm(`¿Añadir a tu historial ${fresh.length} partidas de octubre?`)) return;
    for(const g of fresh){ const c = JSON.parse(JSON.stringify(g)); delete c.id; delete c.example; c.me.name = c.me.name || defaultName; await saveGame(c); }
    toast(`${fresh.length} partidas añadidas`);
  }catch(e){ toast("No se pudieron importar las partidas"); }
}
