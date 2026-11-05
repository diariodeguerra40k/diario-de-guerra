# Convierte la vista previa (artifact de Claude) en la web propia con Supabase y lector gratuito.
# Uso: python3 tools/build_index.py <vista-previa.html> index.html
import re, sys, json

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()

def rep(old, new, count=1, regex=False):
    global s
    if regex:
        s2, n = re.subn(old, new, s, count=count, flags=re.S)
    else:
        n = s.count(old)
        s2 = s.replace(old, new, count if count else -1)
    if n == 0:
        raise SystemExit("NO ENCONTRADO: " + (old[:80] if isinstance(old, str) else str(old)))
    s = s2

# ---------- cabecera de documento ----------
rep('<title>Diario de Guerra 40k</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n',
    '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '<meta name="theme-color" content="#141414">\n'
    '<title>Diario de Guerra 40k</title>\n'
    '<link rel="icon" href="img/icono.svg" type="image/svg+xml">\n')
rep('</style>\n\n<header class="bar">', '</style>\n<link rel="stylesheet" href="css/extra.css">\n</head>\n<body>\n<div id="authGate" class="gate" hidden></div>\n<header class="bar">')

# ---------- quitar imágenes embebidas que ya no se usan ----------
rep(r'const EXAMPLE_IMG = "data:[^"]*";', 'const EXAMPLE_IMG = "";', regex=True)
rep(r'const ARMY_REF = "data:[^"]*";', 'const ARMY_REF = "";', regex=True)
# partidas de Miquel: fuera del código (se importan desde seed/ solo con el enlace de importación)
rep(r'const REAL_GAMES = \[.*?\];\n', 'const REAL_GAMES = [];\n', regex=True)

# ---------- aviso de cuenta ----------
rep('<div class="notice" id="storageNote"><span class="pill warn" id="storagePill">Conectando</span><span class="grow" id="storageText">Preparando tu historial…</span></div>',
    '<div class="notice" id="storageNote"><span class="pill warn" id="storagePill">Conectando</span><span class="grow" id="storageText">Preparando tu historial…</span><button type="button" class="ghost" id="logoutBtn" hidden>Cerrar sesión</button></div>')

# ---------- quitar "lo que vendrá" y el botón de ejemplo ----------
rep(r'\n  <section class="panel roadmap" id="roadmap">.*?</section>', '', regex=True)
rep('<strong>Arrastra aquí la captura de resultados</strong>', '<strong>Sube las capturas o el vídeo de la partida</strong>')
rep('<span class="muted">¿No tienes una a mano?</span><button id="useExample">Probar con la captura de ejemplo</button>', '<span class="muted">¿Prefieres escribirlo tú?</span>')
rep(r'\$\("#useExample"\)\.onclick = .*?\n', '', regex=True)
rep('La pantalla «Results» del War Journal: 1 o 2 fotos de la misma partida (por ejemplo, la parte de arriba y la de abajo). También puedes subir un vídeo grabando la pantalla con varias partidas.',
    'La pantalla «Results» del War Journal: haz capturas mientras bajas hasta el final (normalmente 3 o 4) y súbelas todas juntas. O mejor aún, graba un vídeo de la pantalla bajando despacio: sirve para una o varias partidas. Todo se lee en tu móvil, gratis.')

# ---------- almacenamiento: Supabase ----------
a = s.index('/* ---------- Storage: private per-user store')
b = s.index('let defaultName = "Yo";')
s = s[:a] + open(sys.path[0] + "/store.js", encoding="utf-8").read() + "\n" + s[b:]

# sin datos de ejemplo para usuarios nuevos
rep('function makeExamples(){\n  return REAL_GAMES.map(g => g.id==="oct1" ? { ...JSON.parse(JSON.stringify(g)), img:EXAMPLE_IMG } : JSON.parse(JSON.stringify(g)));\n}',
    'function makeExamples(){ return []; }')
rep('''  if(storeMode==="cloud"){ pill.className="pill ok"; pill.textContent="Privado"; txt.textContent="Tus partidas se guardan en tu cuenta y solo las ves tú. Cada persona que abra esta página tiene su propio historial."; }
  else if(storeMode==="local"){ pill.className="pill warn"; pill.textContent="Este navegador"; txt.textContent="No hay sesión con cuenta, así que las partidas se guardan solo en este navegador."; }''',
    '''  if(storeMode==="cloud"){ pill.className="pill ok"; pill.textContent="Privado"; txt.textContent = (realGames.length ? "" : "Aún no tienes partidas: ve a «Subir partida» y sube las capturas de la pantalla Results. ") + `Has entrado como ${defaultName}. Tus partidas solo las ves tú.`; $("#logoutBtn").hidden = false; }
  else if(storeMode==="error"){ pill.className="pill warn"; pill.textContent="Sin conexión"; txt.textContent="No se ha podido cargar tu historial. Comprueba la conexión y recarga la página."; }''')

# editar en bloque (antes copiaba los ejemplos): ahora solo la partida tocada
rep('''  const wasExample = realGames.length === 0;
  const targets = (wasExample ? games : games.filter(g => g.id === id)).map(g => JSON.parse(JSON.stringify(g)));''',
    '''  const targets = games.filter(g => g.id === id).map(g => JSON.parse(JSON.stringify(g)));''')

# ---------- lectura: OCR gratuito en vez de Claude ----------
a = s.index('let draft = null, draftImg = null, sampleFn = null;')
b = s.index('function setStep(n){')
s = s[:a] + 'let draft = null, draftImg = null;\n' + s[b:]
a = s.index('async function readImage(blobIn, isExample){')
b = s.index('function blankSide(name){')
s = s[:a] + open(sys.path[0] + "/upload.js", encoding="utf-8").read() + "\n" + s[b:]
rep('$("#cancelBtn").onclick = async () => { draft = null; draftImg = null; if(await nextFromVideo()) return; status(""); setStep(1); };',
    '$("#cancelBtn").onclick = async () => { draft = null; draftImg = null; draftArm = null; if(await nextFromVideo()) return; status(""); setStep(1); };')
# al guardar: aprender la ilustración si el usuario corrigió el ejército
rep('  try{ await saveGame(draft); ls("dg40k.last"',
    '  try{ learnArmies(draft); await saveGame(draft); ls("dg40k.last"')

rep('  setStep(2); window.scrollTo({top:0});\n}', '  setStep(2); window.scrollTo({top:0}); renderArmySug();\n}')

rep('const MISSIONS = CAT_ORDER.flatMap(a=>MATRIX[a]);', 'const MISSIONS = CAT_ORDER.flatMap(a=>MATRIX[a]);\nif(window.WJReader) WJReader.setPrimaries(MISSIONS);')

# ---------- scripts externos (antes del script principal) ----------
rep('<datalist id="armies"></datalist>',
    '<script src="vendor/supabase.js"></script>\n<script src="vendor/tesseract/tesseract.min.js"></script>\n'
    '<script src="js/config.js"></script>\n<script src="js/facciones.js"></script>\n<script src="js/reader.js"></script>\n<script src="js/lector.js"></script>\n'
    '<datalist id="armies"></datalist>')

# arranque: primero la sesión
rep('refresh(); initStore();\n</script>', 'refresh(); initStore();\n</script>\n</body>\n</html>')

open(dst, "w", encoding="utf-8").write(s)
print("ok", len(s))
