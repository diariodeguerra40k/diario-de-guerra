/* Calculadora (Matriz de Duelos) en la web propia.
   La calculadora se escribió para guardar en la cuenta de Claude (window.claude.use('db')).
   Aquí se le da la misma interfaz, pero guardando en Supabase con la cuenta de Herramientas de Guerra
   (tabla calc_docs). También recoge las listas que llegan desde la página antigua (#importar=…).
   Requiere js/sesion.js antes. */
(function(){
  var sb = window.DGSesion && DGSesion.sb;
  var IMP = "#importar=";

  // Sesión: si no hay, sesion.js manda a la portada para entrar y luego vuelve aquí.
  var sesion = new Promise(function(res){
    function go(){ DGSesion.exigir().then(res, function(){ res(null); }); }
    if(document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  });

  function aviso(txt, mal){
    var t = document.createElement("div");
    t.textContent = txt;
    t.setAttribute("role", "status");
    t.style.cssText = "position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:10002;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:10px;font:600 15px system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.4);color:#fff;background:" + (mal ? "#b3362b" : "#2f7a4d");
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 7000);
  }

  async function descomprimir(b64){
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    while(b64.length % 4) b64 += "=";
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }

  // Listas de la página antigua: se añaden a la cuenta sin pisar las que ya existan aquí.
  var importacion = sesion.then(async function(s){
    if(!s || location.hash.indexOf(IMP) !== 0) return;
    var b64 = location.hash.slice(IMP.length);
    history.replaceState(null, "", location.pathname + location.search);
    try{
      var d = await descomprimir(decodeURIComponent(b64));
      var filas = [];
      (d.lists || []).forEach(function(v){ if(v && v.id) filas.push({ col: "lists", id: String(v.id), data: v }); });
      (d.lunits || []).forEach(function(v){ if(v && v.id != null) filas.push({ col: "lunits", id: String(v.id) + "_" + (v.k || 0), data: v }); });
      if(!filas.length){ aviso("No había listas guardadas en la calculadora antigua."); return; }
      var r = await sb.from("calc_docs").upsert(filas, { onConflict: "user_id,col,id", ignoreDuplicates: true });
      if(r.error) throw r.error;
      var n = (d.lists || []).length;
      aviso(n === 1 ? "Recuperada 1 lista de la calculadora antigua." : "Recuperadas " + n + " listas de la calculadora antigua.");
    }catch(e){
      console.error(e);
      aviso("No se pudieron recuperar las listas antiguas. Vuelve a abrir el enlace antiguo de la calculadora y pulsa el botón otra vez.", true);
    }
  });

  // Misma forma que la base de datos de Claude que usaba la calculadora:
  // db.doc('data/users/<id>/profile').collection(nombre) → get(), doc(id).set(), doc(id).delete()
  function coleccion(col){
    return {
      get: async function(){
        var r = await sb.from("calc_docs").select("id,data").eq("col", col);
        if(r.error) throw r.error;
        return { docs: r.data.map(function(f){ return { id: f.id, data: function(){ return f.data; } }; }) };
      },
      doc: function(id){
        return {
          set: async function(obj){
            var r = await sb.from("calc_docs").upsert({ col: col, id: String(id), data: obj, updated_at: new Date().toISOString() }, { onConflict: "user_id,col,id" });
            if(r.error) throw r.error;
          },
          delete: async function(){
            var r = await sb.from("calc_docs").delete().eq("col", col).eq("id", String(id));
            if(r.error) throw r.error;
          }
        };
      }
    };
  }
  var db = { doc: function(){ return { collection: coleccion }; } };

  // Guardar archivos (exportar PNG/CSV): descarga normal del navegador.
  var descargas = {
    save: async function(o){
      var data = o.data, blob = data instanceof Blob ? data : new Blob([data], { type: o.type || o.mimeType || "application/octet-stream" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = o.filename || "archivo";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
    }
  };

  window.claude = {
    use: async function(nombre){
      var s = await sesion;
      if(nombre === "downloads") return descargas;
      if(!s) return null;
      await importacion;
      if(nombre === "db") return db;
      if(nombre === "user") return { id: async function(){ return s.user.id; } };
      return null;
    }
  };
})();
