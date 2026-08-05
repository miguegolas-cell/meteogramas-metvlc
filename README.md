# Meteogramas MetVlc · versión 6.1

Visor meteorológico para la provincia de Valencia.

## Novedades

- Skew-T / log-P previsto con NOAA GFS.
- Temperatura, punto de rocío y trayectoria de una parcela superficial.
- Adiabáticas secas, pseudo-adiabáticas húmedas y líneas de razón de mezcla.
- CAPE y CIN calculados y sombreados en el propio perfil.
- Niveles LCL/NCL, LFC/NCA, EL/NE, CCL/NCC, nivel de 0 °C y PBL.
- Se mantienen el perfil simple, la hodógrafa, Haines, cizalladura y las tablas nocturnas.

## Archivos que deben quedar en la raíz de GitHub Pages

- `index.html`
- `estilos-v61.css`
- `app-v61.js`
- `README.md`

Borra los archivos JavaScript y CSS de versiones anteriores para evitar confusiones. El `index.html` incluye versión en la URL de los recursos para evitar la caché.

## Nota técnica

El Skew-T es un perfil previsto de GFS, no un radiosondeo observado. CAPE, CIN y niveles termodinámicos se calculan en el navegador mediante una parcela superficial y pueden diferir de los campos nativos del modelo.


## Ajustes de la versión 6.1
- Resumen operativo centrado en el día actual y la próxima noche.
- Escalas cualitativas MetVlc para CAPE, CIN y LI.
- Selector temporal del perfil mediante barra deslizante.
- Eliminado el bloque de helicidad/SRH.
- Dirección del viento cada 3 horas con desplazamiento horizontal.
- El mapa ocupa toda la altura disponible del panel.
