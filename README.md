# Meteogramas MetVlc v6.5

El modelo principal también controla la fuente del perfil vertical:

- **NOAA GFS seleccionado:** Skew‑T, perfil T/Td, hodógrafa, Haines, cizalladura y diagnóstico de mezcla con GFS.
- **Météo‑France seleccionado:** los mismos productos con **AROME France estándar de 2,5 km**.
- **Mejor ajuste, ECMWF o ICON:** el meteograma conserva el modelo elegido y el perfil vertical utiliza GFS como fuente de apoyo, indicado en pantalla.

GFS aporta 37 niveles entre 1000 y 100 hPa en esta interfaz. AROME aporta 24 niveles entre 1000 y 100 hPa y queda limitado aproximadamente a 2 días. No se mezclan niveles de GFS y AROME dentro de un mismo Skew‑T.

Sube `index.html`, `app-v65.js`, `estilos-v65.css` y las carpetas `datos`, `scripts` y `.github`. Después elimina `app-v64.js` y `estilos-v64.css` cuando compruebes que v6.5 carga correctamente.
