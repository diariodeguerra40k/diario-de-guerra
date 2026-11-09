# Diario de Guerra 40k

Web para guardar el historial de partidas de Warhammer 40.000 y ver estadísticas.
Cada jugador entra con su cuenta y solo ve sus partidas.

- Lee las capturas de la pantalla «Results» del War Journal (app oficial) en el propio móvil, gratis (Tesseract).
- Reconoce los ejércitos por la ilustración de la tarjeta y aprende cuando el usuario corrige.
- Cuentas y datos en Supabase (`supabase/schema.sql`).
- Publicada con GitHub Pages.

`diario.html` se genera con `tools/build_index.py` a partir de la vista previa.

## Herramientas de Guerra (Warhammelgas)

- `index.html`: portada con inicio de sesión (las mismas cuentas de Supabase del Diario) y los 3 accesos.
- `calculadora.html`: Matriz de Duelos. Las listas de cada usuario se guardan en la tabla `calc_docs` (`supabase/calculadora.sql`).
- `matrices.html`: matrices de equipo. Datos compartidos por todo el equipo en Firebase (el mismo proyecto que la versión de Netlify).
- `diario.html`: historial de partidas.
- `js/sesion.js`: sesión compartida entre páginas.
