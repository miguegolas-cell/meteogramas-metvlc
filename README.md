# Meteogramas MetVlc · versión 5.0

Visor meteorológico para la provincia de Valencia.

## Archivos que deben quedar en la raíz de GitHub Pages

- `index.html`
- `estilos-v5.css`
- `app-v5.js`
- `README.md`

Puedes borrar de `main` los archivos antiguos `app.js`, `estilos.css`, `app-v4.js` y `estilos-v4.css` después de subir esta versión.

## Novedades

- Un gráfico por fila.
- Temperatura a 850 hPa obtenida siempre de NOAA GFS.
- CAPE y CIN en un mismo gráfico.
- Apoyo GFS para LI, CIN, CAPE y PBL cuando el modelo principal no los entrega.
- Perfil vertical previsto GFS con selector de fecha y hora.
- Perfil temperatura/punto de rocío, hodógrafa, Haines, LCL, nivel de 0 °C, cizalladura e inversiones.
- Tabla de noches tropicales, ecuatoriales y tórridas.
- Clasificación de recuperación nocturna usando la HR máxima entre puesta de sol y amanecer.

## Publicación

Sube los cuatro archivos a la raíz del repositorio. Después abre GitHub Pages y realiza una recarga forzada con `Ctrl + F5`.

Los datos son predicciones automáticas. No sustituyen los avisos ni las predicciones oficiales de AEMET.
