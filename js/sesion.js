/* Sesión compartida entre las páginas de la web (inicio, calculadora, matrices, diario).
   Supabase guarda la sesión en el navegador para esta web, así que si entras en una
   página ya estás dentro en todas. Requiere vendor/supabase.js y js/config.js antes. */
(function(){
  var sb = (window.supabase && window.DG_CONFIG) ? supabase.createClient(DG_CONFIG.url, DG_CONFIG.key) : null;
  var INICIO = "inicio.html"; // en la prueba; al final pasará a ser index.html

  function nombre(user){
    if(!user) return "";
    return ((user.user_metadata && user.user_metadata.name) || user.email.split("@")[0]).split(" ")[0];
  }

  // Barra fina arriba: volver al inicio, quién eres y salir.
  function barra(user){
    if(document.getElementById("dgBarra")) return;
    var css = document.createElement("style");
    css.textContent = "#dgBarra{position:sticky;top:0;z-index:9000;display:flex;align-items:center;gap:12px;padding:8px 16px;background:#111214;color:#eee;font:600 14px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif}" +
      "#dgBarra a{color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:6px}#dgBarra a:hover{text-decoration:underline}" +
      "#dgBarra .q{margin-left:auto;color:#b9b7b1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#dgBarra button{all:unset;cursor:pointer;color:#ff8d9b;font-weight:600}#dgBarra button:hover{text-decoration:underline}";
    document.head.appendChild(css);
    var b = document.createElement("div");
    b.id = "dgBarra";
    b.innerHTML = '<a href="' + INICIO + '">&larr; Inicio</a><span class="q"></span><button type="button">Salir</button>';
    b.querySelector(".q").textContent = "Hola, " + nombre(user);
    b.querySelector("button").onclick = async function(){ await sb.auth.signOut(); location.href = INICIO; };
    document.body.insertBefore(b, document.body.firstChild);
  }

  // Para las páginas internas: si no hay sesión, manda a la página de inicio para entrar
  // y, al entrar, vuelve aquí.
  async function exigir(){
    if(!sb){ return null; }
    var r = await sb.auth.getSession();
    var s = r.data && r.data.session;
    if(!s){
      var aqui = location.pathname.split("/").pop() + location.search + location.hash;
      location.replace(INICIO + "?volver=" + encodeURIComponent(aqui));
      return null;
    }
    barra(s.user);
    return s;
  }

  window.DGSesion = { sb: sb, nombre: nombre, exigir: exigir, barra: barra };
})();
