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
- `estilos-v62.css`
- `app-v62.js`
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


## Ajuste v6.2 de escalas de inestabilidad

- Se mantienen las bandas coloreadas dentro de CAPE/CIN y LI.
- El eje Y vuelve a mostrar únicamente valores numéricos.
- CAPE: 0–100 residual; 100–300 baja; 300–700 moderada; 700–1200 alta; 1200–2000 muy alta; >2000 extrema.
- CIN (valores negativos): 0 a −15 escasa; −15 a −35 débil; −35 a −75 moderada; −75 a −125 fuerte; <−125 muy fuerte.
- LI: >+2 estable; 0 a +2 casi neutro; 0 a −2 baja; −2 a −4 moderada; −4 a −6 alta; <−6 muy alta/extrema.

Estas bandas son orientativas y están adaptadas al contexto mediterráneo valenciano. No son umbrales oficiales ni sustituyen el análisis del perfil, la convergencia, la orografía, la humedad y la cizalladura.
