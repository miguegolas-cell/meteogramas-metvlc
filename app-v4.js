'use strict';

const VERSION_METVLC = '4.1.0';

const CONFIG = {
  puntoInicial: { lat: 39.4699, lon: -0.3763, nombre: 'València' },
  zonaHoraria: 'Europe/Madrid',
  apiForecast: 'https://api.open-meteo.com/v1/forecast',
  apiGeocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  limiteProvincia: "https://mapas.fomento.gob.es/arcgis/rest/services/SIU/ENTIDADES_TERRITORIALES_EGRN/MapServer/2/query?where=CodINE%3D%2746%27&outFields=NAMEUNIT%2CCodINE&returnGeometry=true&outSR=4326&f=geojson",
  modelos: {
    best_match: {
      id: 'best_match',
      nombre: 'Mejor ajuste Open-Meteo',
      corto: 'Mejor ajuste',
      maxDias: 10,
      probPrecipitacion: true,
      variablesAvanzadas: ['temperature_850hPa', 'lifted_index', 'convective_inhibition', 'boundary_layer_height'],
      ayuda: 'Selección automática y combinación de los modelos más adecuados para el punto.'
    },
    ecmwf_ifs: {
      id: 'ecmwf_ifs',
      nombre: 'ECMWF IFS HRES · 9 km',
      corto: 'ECMWF IFS',
      maxDias: 10,
      probPrecipitacion: false,
      variablesAvanzadas: ['temperature_850hPa', 'convective_inhibition', 'boundary_layer_height'],
      ayuda: 'Modelo global ECMWF IFS HRES a 9 km. Alcance del visor limitado a 10 días.'
    },
    dwd_icon_seamless: {
      id: 'dwd_icon_seamless',
      nombre: 'DWD ICON · global/europeo',
      corto: 'DWD ICON',
      maxDias: 7,
      probPrecipitacion: false,
      variablesAvanzadas: ['temperature_850hPa'],
      ayuda: 'Serie ICON integrada por Open-Meteo; para Valencia combina el modelo global y el europeo.'
    },
    ncep_gfs_seamless: {
      id: 'ncep_gfs_seamless',
      nombre: 'NOAA GFS · global',
      corto: 'NOAA GFS',
      maxDias: 10,
      probPrecipitacion: true,
      variablesAvanzadas: ['temperature_850hPa', 'lifted_index', 'convective_inhibition', 'boundary_layer_height'],
      ayuda: 'Modelo global GFS de NOAA. Incluye probabilidad de precipitación calculada con GEFS.'
    },
    meteofrance_seamless: {
      id: 'meteofrance_seamless',
      nombre: 'Météo-France · AROME/ARPEGE',
      corto: 'Météo-France',
      maxDias: 3,
      probPrecipitacion: false,
      variablesAvanzadas: ['temperature_850hPa'],
      ayuda: 'Serie Météo-France AROME/ARPEGE. En esta interfaz se limita a 72 horas.'
    }
  }
};

const COLORES = {
  temperatura: '#e24a33',
  temperatura850: '#9c3d88',
  rocio: '#2586c4',
  humedad: '#16835d',
  dpv: '#d17900',
  viento: '#2373b5',
  racha: '#b93030',
  precip: '#157dcc',
  prob: '#7655b5',
  nubeBaja: '#7993a7',
  nubeMedia: '#9a8ab8',
  nubeAlta: '#c1a469',
  cape: '#8b3ba7',
  li: '#245ea8',
  cin: '#b46b18',
  pbl: '#267a68'
};

const estado = {
  mapa: null,
  marcador: null,
  limite: null,
  capaLimite: null,
  graficos: {},
  punto: { ...CONFIG.puntoInicial },
  datos: null,
  modelo: 'best_match'
};

const $ = (id) => document.getElementById(id);

function iniciar() {
  configurarChart();
  iniciarMapa();
  enlazarEventos();
  ajustarPeriodosAlModelo();
  cargarLimiteProvincia();
  consultarPrediccion(CONFIG.puntoInicial.lat, CONFIG.puntoInicial.lon, CONFIG.puntoInicial.nombre);
}

function configurarChart() {
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.color = '#526474';
  Chart.defaults.borderColor = 'rgba(127, 151, 170, .18)';
  Chart.defaults.animation.duration = 350;
}

function iniciarMapa() {
  estado.mapa = L.map('mapa', { zoomControl: true }).setView([39.45, -0.65], 8);

  const callejero = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  });

  const relieve = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'OpenTopoMap · &copy; OpenStreetMap'
  });

  callejero.addTo(estado.mapa);
  L.control.layers({ 'Callejero': callejero, 'Relieve': relieve }, null, { collapsed: true }).addTo(estado.mapa);

  estado.marcador = L.marker([CONFIG.puntoInicial.lat, CONFIG.puntoInicial.lon], { draggable: true }).addTo(estado.mapa);
  estado.marcador.bindTooltip('Punto de predicción', { permanent: false });

  estado.mapa.on('click', (evento) => seleccionarPunto(evento.latlng.lat, evento.latlng.lng, 'Punto seleccionado'));
  estado.marcador.on('dragend', () => {
    const p = estado.marcador.getLatLng();
    seleccionarPunto(p.lat, p.lng, 'Punto seleccionado');
  });
}

async function cargarLimiteProvincia() {
  try {
    const respuesta = await fetch(CONFIG.limiteProvincia);
    if (!respuesta.ok) throw new Error(`Límite provincial: HTTP ${respuesta.status}`);
    const geojson = await respuesta.json();
    if (!geojson.features?.length) throw new Error('El servicio no devolvió la geometría provincial.');

    estado.limite = geojson.features[0];
    estado.capaLimite = L.geoJSON(geojson, {
      style: {
        color: '#0b5fa5',
        weight: 3,
        opacity: .9,
        fillColor: '#3c91c9',
        fillOpacity: .07
      }
    }).addTo(estado.mapa);

    estado.mapa.fitBounds(estado.capaLimite.getBounds(), { padding: [18, 18] });
  } catch (error) {
    console.warn(error);
    mostrarAviso('No se ha podido cargar el límite provincial. El mapa seguirá operativo, pero no podrá validar si el punto está dentro de Valencia.');
  }
}

function enlazarEventos() {
  $('periodo').addEventListener('change', () => {
    consultarPrediccion(estado.punto.lat, estado.punto.lon, estado.punto.nombre);
  });

  $('modelo').addEventListener('change', () => {
    ajustarPeriodosAlModelo();
    consultarPrediccion(estado.punto.lat, estado.punto.lon, estado.punto.nombre);
  });

  $('formBusqueda').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    await buscarLocalidad($('buscador').value.trim());
  });

  $('btnUbicacion').addEventListener('click', usarUbicacion);
}

function puntoDentroProvincia(lat, lon) {
  if (!estado.limite || typeof turf === 'undefined') return true;
  try {
    return turf.booleanPointInPolygon(turf.point([lon, lat]), estado.limite);
  } catch {
    return true;
  }
}

function seleccionarPunto(lat, lon, nombre) {
  if (!puntoDentroProvincia(lat, lon)) {
    mostrarAviso('Selecciona un punto situado dentro de la provincia de Valencia.');
    if (estado.marcador) estado.marcador.setLatLng([estado.punto.lat, estado.punto.lon]);
    return;
  }

  consultarPrediccion(lat, lon, nombre);
}

async function buscarLocalidad(texto) {
  if (texto.length < 2) {
    mostrarAviso('Escribe al menos dos caracteres para buscar una localidad.');
    return;
  }

  try {
    setEstadoApi('Buscando localidad…');
    const url = new URL(CONFIG.apiGeocoding);
    url.search = new URLSearchParams({
      name: texto,
      count: '10',
      language: 'es',
      format: 'json',
      countryCode: 'ES'
    });

    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`Geocodificación: HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    const resultados = (datos.results || []).filter(r => {
      const coincideValencia = /valenc/i.test(r.admin1 || '') && /val[eè]ncia|valencia/i.test(r.admin2 || '');
      return estado.limite ? puntoDentroProvincia(r.latitude, r.longitude) : coincideValencia;
    });

    mostrarResultadosBusqueda(resultados);
    setEstadoApi('Preparado para consultar');
  } catch (error) {
    console.error(error);
    mostrarAviso('No se ha podido realizar la búsqueda de localidades.');
    setEstadoApi('Error de búsqueda');
  }
}

function mostrarResultadosBusqueda(resultados) {
  const caja = $('resultadosBusqueda');
  caja.innerHTML = '';

  if (!resultados.length) {
    caja.innerHTML = '<div class="resultado"><strong>Sin resultados</strong><span>No se encontró una localidad dentro de la provincia.</span></div>';
    caja.hidden = false;
    return;
  }

  resultados.slice(0, 6).forEach(resultado => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'resultado';
    boton.innerHTML = `<strong>${escapar(resultado.name)}</strong><span>${escapar([resultado.admin3, resultado.admin2, resultado.admin1].filter(Boolean).join(' · '))}</span>`;
    boton.addEventListener('click', () => {
      caja.hidden = true;
      $('buscador').value = resultado.name;
      estado.mapa.setView([resultado.latitude, resultado.longitude], 11);
      consultarPrediccion(resultado.latitude, resultado.longitude, resultado.name);
    });
    caja.appendChild(boton);
  });

  caja.hidden = false;
}

function usarUbicacion() {
  if (!navigator.geolocation) {
    mostrarAviso('El navegador no permite obtener la ubicación.');
    return;
  }

  setEstadoApi('Obteniendo ubicación…');
  navigator.geolocation.getCurrentPosition(
    posicion => {
      const { latitude, longitude } = posicion.coords;
      if (!puntoDentroProvincia(latitude, longitude)) {
        mostrarAviso('Tu ubicación actual está fuera de la provincia de Valencia.');
        setEstadoApi('Preparado para consultar');
        return;
      }
      estado.mapa.setView([latitude, longitude], 11);
      consultarPrediccion(latitude, longitude, 'Mi ubicación');
    },
    () => {
      mostrarAviso('No ha sido posible obtener la ubicación. Revisa los permisos del navegador.');
      setEstadoApi('Ubicación no disponible');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function consultarPrediccion(lat, lon, nombre) {
  const modelo = obtenerModeloSeleccionado();
  const dias = Math.min(Number($('periodo').value || 7), modelo.maxDias);
  ocultarAviso();
  mostrarCargando(true);
  setEstadoApi(`Actualizando ${modelo.corto}…`);

  try {
    const url = construirUrlForecast(lat, lon, dias, modelo);
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
      let detalle = '';
      try {
        const errorApi = await respuesta.json();
        detalle = errorApi.reason || '';
      } catch {
        detalle = '';
      }
      throw new Error(detalle || `Open-Meteo: HTTP ${respuesta.status}`);
    }
    const datos = await respuesta.json();
    validarRespuesta(datos);

    const datosAvanzados = await consultarVariablesAvanzadas(lat, lon, dias, modelo, datos.hourly.time);
    combinarDatosAvanzados(datos, datosAvanzados);

    estado.punto = { lat, lon, nombre };
    estado.datos = datos;
    estado.modelo = modelo.id;
    normalizarDatosOpcionales(datos);
    actualizarEstadoVariablesAvanzadas(datos, modelo);
    actualizarCabeceraPunto(datos, modelo);
    actualizarResumen(datos);
    actualizarGraficos(datos);
    actualizarTablaDiaria(datos);

    estado.marcador.setLatLng([lat, lon]);
    setEstadoApi(`${modelo.corto} actualizado · v${VERSION_METVLC}`);
  } catch (error) {
    console.error(error);
    mostrarAviso(`No se ha podido cargar la predicción. ${error.message || ''}`);
    setEstadoApi('Error al consultar');
  } finally {
    mostrarCargando(false);
  }
}

function construirUrlForecast(lat, lon, dias, modelo) {
  const url = new URL(CONFIG.apiForecast);
  const hourly = [
    'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'vapour_pressure_deficit',
    'precipitation', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'cape'
  ];
  if (modelo.probPrecipitacion) hourly.splice(5, 0, 'precipitation_probability');

  const daily = [
    'temperature_2m_max', 'temperature_2m_min', 'relative_humidity_2m_max',
    'relative_humidity_2m_min', 'precipitation_sum', 'wind_gusts_10m_max',
    'wind_direction_10m_dominant', 'vapour_pressure_deficit_max', 'cape_max',
    'sunrise', 'sunset'
  ];

  const parametros = {
    latitude: lat.toFixed(5),
    longitude: lon.toFixed(5),
    hourly: hourly.join(','),
    daily: daily.join(','),
    forecast_days: String(dias),
    timezone: CONFIG.zonaHoraria,
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm'
  };
  // En "Mejor ajuste" Open-Meteo selecciona el modelo automáticamente;
  // no debe enviarse un identificador de modelo ficticio.
  if (modelo.id !== 'best_match') parametros.models = modelo.id;
  url.search = new URLSearchParams(parametros);
  return url;
}

async function consultarVariablesAvanzadas(lat, lon, dias, modelo, tiemposBase) {
  const variables = modelo.variablesAvanzadas || [];
  if (!variables.length) return {};

  try {
    return await solicitarVariablesAvanzadas(lat, lon, dias, modelo, variables, tiemposBase);
  } catch (error) {
    console.warn('Consulta avanzada agrupada no disponible; se prueban variables por separado.', error);
    const resultados = await Promise.allSettled(
      variables.map(variable => solicitarVariablesAvanzadas(lat, lon, dias, modelo, [variable], tiemposBase))
    );
    return resultados.reduce((acumulado, resultado) => {
      if (resultado.status === 'fulfilled') Object.assign(acumulado, resultado.value);
      return acumulado;
    }, {});
  }
}

async function solicitarVariablesAvanzadas(lat, lon, dias, modelo, variables, tiemposBase) {
  const url = new URL(CONFIG.apiForecast);
  const parametros = {
    latitude: lat.toFixed(5),
    longitude: lon.toFixed(5),
    hourly: variables.join(','),
    forecast_days: String(dias),
    timezone: CONFIG.zonaHoraria,
    wind_speed_unit: 'kmh'
  };
  if (modelo.id !== 'best_match') parametros.models = modelo.id;
  url.search = new URLSearchParams(parametros);

  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`Variables avanzadas: HTTP ${respuesta.status}`);
  const datos = await respuesta.json();
  if (!datos?.hourly?.time?.length) throw new Error('Sin datos avanzados horarios.');

  const salida = {};
  variables.forEach(variable => {
    const serie = extraerSerieVariable(datos.hourly, variable);
    if (Array.isArray(serie)) {
      salida[variable] = alinearSerie(tiemposBase, datos.hourly.time, serie);
    }
  });
  return salida;
}

function extraerSerieVariable(hourly, variable) {
  if (Array.isArray(hourly?.[variable])) return hourly[variable];
  // Algunas respuestas identifican la serie añadiendo el modelo al nombre.
  const claveAlternativa = Object.keys(hourly || {}).find(clave =>
    clave.startsWith(`${variable}_`) && Array.isArray(hourly[clave])
  );
  return claveAlternativa ? hourly[claveAlternativa] : null;
}

function alinearSerie(tiemposBase, tiemposSerie, valores) {
  const porHora = new Map(tiemposSerie.map((tiempo, i) => [tiempo, valores[i]]));
  return tiemposBase.map(tiempo => porHora.has(tiempo) ? porHora.get(tiempo) : null);
}

function combinarDatosAvanzados(datos, datosAvanzados) {
  Object.entries(datosAvanzados).forEach(([variable, serie]) => {
    datos.hourly[variable] = serie;
  });
}

function validarRespuesta(datos) {
  if (!datos?.hourly?.time?.length) throw new Error('La respuesta no contiene datos horarios.');
}

function obtenerModeloSeleccionado() {
  return CONFIG.modelos[$('modelo').value] || CONFIG.modelos.best_match;
}

function ajustarPeriodosAlModelo() {
  const modelo = obtenerModeloSeleccionado();
  const selectorPeriodo = $('periodo');
  const opciones = [...selectorPeriodo.options];

  opciones.forEach(opcion => {
    opcion.disabled = Number(opcion.value) > modelo.maxDias;
  });

  if (Number(selectorPeriodo.value) > modelo.maxDias) {
    const permitidas = opciones
      .filter(opcion => !opcion.disabled)
      .map(opcion => Number(opcion.value));
    selectorPeriodo.value = String(Math.max(...permitidas));
  }

  $('ayudaModelo').textContent = modelo.ayuda;
}

function normalizarDatosOpcionales(datos) {
  const cantidad = datos.hourly.time.length;
  const opcionalesHorarias = [
    'precipitation_probability', 'temperature_850hPa', 'cape', 'lifted_index',
    'convective_inhibition', 'boundary_layer_height'
  ];

  opcionalesHorarias.forEach(variable => {
    if (!Array.isArray(datos.hourly[variable])) datos.hourly[variable] = Array(cantidad).fill(null);
  });

  const cantidadDias = datos.daily?.time?.length || 0;
  if (datos.daily && !Array.isArray(datos.daily.cape_max)) {
    datos.daily.cape_max = Array(cantidadDias).fill(null);
  }
}

function actualizarEstadoVariablesAvanzadas(datos, modelo) {
  const h = datos.hourly;
  const variables = [
    ['CAPE', 'cape'],
    ['LI', 'lifted_index'],
    ['CIN', 'convective_inhibition'],
    ['PBL', 'boundary_layer_height'],
    ['T850', 'temperature_850hPa']
  ];
  const disponibles = variables
    .filter(([, clave]) => Array.isArray(h[clave]) && h[clave].some(valor => valor != null && Number.isFinite(Number(valor))))
    .map(([nombre]) => nombre);
  const ausentes = variables.map(([nombre]) => nombre).filter(nombre => !disponibles.includes(nombre));
  const textoDisponibles = disponibles.length ? `Disponibles: ${disponibles.join(', ')}.` : 'No se han recibido variables avanzadas.';
  const textoAusentes = ausentes.length ? ` No disponibles con ${modelo.corto}: ${ausentes.join(', ')}.` : '';
  const elemento = $('estadoVariablesAvanzadas');
  if (elemento) elemento.textContent = `${textoDisponibles}${textoAusentes} · Visor v${VERSION_METVLC}`;
}

function actualizarCabeceraPunto(datos, modelo) {
  $('nombreLugar').textContent = estado.punto.nombre;
  $('coordenadas').textContent = `${estado.punto.lat.toFixed(4)}, ${estado.punto.lon.toFixed(4)}`;
  $('altitud').textContent = `Altitud del modelo: ${redondear(datos.elevation, 0)} m`;
  $('modeloTexto').textContent = `Modelo: ${modelo.nombre}`;
  $('modeloFuente').textContent = modelo.nombre;
  $('periodoTexto').textContent = `Próximos ${$('periodo').value === '3' ? '3 días' : `${$('periodo').value} días`} · Hora local peninsular`;
}

function actualizarResumen(datos) {
  const h = datos.hourly;
  const iHr = indiceMin(h.relative_humidity_2m);
  const iDpv = indiceMax(h.vapour_pressure_deficit);
  const iRacha = indiceMax(h.wind_gusts_10m);
  const iCape = indiceMax(h.cape);
  const precipitacion = suma(h.precipitation);
  const recuperacion = calcularRecuperacionNocturna(h);

  $('resHrMin').textContent = formato(h.relative_humidity_2m[iHr], 0, ' %');
  $('resHrHora').textContent = formatearFechaHora(h.time[iHr]);
  $('resDpvMax').textContent = formato(h.vapour_pressure_deficit[iDpv], 2, ' kPa');
  $('resDpvHora').textContent = formatearFechaHora(h.time[iDpv]);
  $('resRacha').textContent = formato(h.wind_gusts_10m[iRacha], 0, ' km/h');
  $('resRachaHora').textContent = formatearFechaHora(h.time[iRacha]);
  $('resPrecip').textContent = formato(precipitacion, 1, ' mm');
  $('resCape').textContent = formato(h.cape[iCape], 0, ' J/kg');
  $('resCapeNivel').textContent = clasificarCape(h.cape[iCape]);
  $('resRecuperacion').textContent = recuperacion.clase;
  $('resRecuperacionDetalle').textContent = recuperacion.detalle;

  const horaCritica = iDpv;
  const direccion = rumbo(h.wind_direction_10m[horaCritica]);
  const modelo = CONFIG.modelos[estado.modelo] || CONFIG.modelos.best_match;
  $('informeOperativo').innerHTML = [
    `<strong>${modelo.corto}:</strong>`,
    `<strong>Mayor DPV:</strong> ${formato(h.vapour_pressure_deficit[horaCritica], 2, ' kPa')} el ${formatearFechaHora(h.time[horaCritica])}.`,
    `En esa hora se prevén ${formato(h.temperature_2m[horaCritica], 1, ' °C')}, HR del ${formato(h.relative_humidity_2m[horaCritica], 0, ' %')} y rachas de ${formato(h.wind_gusts_10m[horaCritica], 0, ' km/h')} del ${direccion}.`,
    `<strong>Recuperación nocturna más baja:</strong> ${recuperacion.detalle}.`
  ].join(' ');
}

function actualizarGraficos(datos) {
  const h = datos.hourly;
  const etiquetas = h.time.map(formatearEtiquetaEje);
  const comunes = opcionesComunes(etiquetas.length);
  const modelo = CONFIG.modelos[estado.modelo] || CONFIG.modelos.best_match;

  const temperatura850Disponible = h.temperature_850hPa.some(valor => valor != null && Number.isFinite(Number(valor)));
  $('estadoTemp850').hidden = temperatura850Disponible;
  $('estadoTemp850').textContent = temperatura850Disponible
    ? ''
    : `${modelo.corto} no proporciona temperatura a 850 hPa para esta consulta.`;

  crearGrafico('termico', 'graficoTermico', {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [
        linea('Temperatura 2 m °C', h.temperature_2m, COLORES.temperatura, 'y'),
        ...(temperatura850Disponible
          ? [linea('Temperatura 850 hPa °C', h.temperature_850hPa, COLORES.temperatura850, 'y', 2, true)]
          : []),
        linea('Punto de rocío °C', h.dew_point_2m, COLORES.rocio, 'y'),
        linea('Humedad %', h.relative_humidity_2m, COLORES.humedad, 'y1', 1.8)
      ]
    },
    options: {
      ...comunes,
      scales: {
        x: escalaX(),
        y: { position: 'left', title: { display: true, text: 'Temperatura (°C)' } },
        y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'Humedad (%)' } }
      }
    }
  });

  crearGrafico('viento', 'graficoViento', {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [
        relleno('Viento km/h', h.wind_speed_10m, COLORES.viento, 'y'),
        linea('Rachas km/h', h.wind_gusts_10m, COLORES.racha, 'y', 2)
      ]
    },
    options: {
      ...comunes,
      plugins: {
        ...comunes.plugins,
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const i = items[0].dataIndex;
              return `Dirección: ${rumbo(h.wind_direction_10m[i])} (${redondear(h.wind_direction_10m[i], 0)}°)`;
            }
          }
        }
      },
      scales: { x: escalaX(), y: { beginAtZero: true, title: { display: true, text: 'km/h' } } }
    }
  });
  actualizarTiraDireccionViento(h.time, h.wind_direction_10m);

  crearGrafico('precipitacion', 'graficoPrecipitacion', {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [
        barras('Precipitación mm', h.precipitation, COLORES.precip, 'y'),
        ...(h.precipitation_probability.some(valor => valor != null)
          ? [linea('Probabilidad %', h.precipitation_probability, COLORES.prob, 'y1', 1.8)]
          : [])
      ]
    },
    options: {
      ...comunes,
      scales: {
        x: escalaX(),
        y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Precipitación (mm)' } },
        y1: { min: 0, max: 100, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Probabilidad (%)' } }
      }
    }
  });

  crearGrafico('dpv', 'graficoDpv', {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [relleno('DPV kPa', h.vapour_pressure_deficit, COLORES.dpv, 'y')]
    },
    options: {
      ...comunes,
      scales: {
        x: escalaX(),
        y: { beginAtZero: true, title: { display: true, text: 'DPV (kPa)' } }
      }
    }
  });

  crearGraficoOpcional({
    clave: 'cape', canvasId: 'graficoCape', estadoId: 'sinDatosCape', etiquetas,
    datos: h.cape, etiqueta: 'CAPE J/kg', color: COLORES.cape, tipo: 'bar', unidad: 'J/kg',
    mensaje: `${modelo.corto} no proporciona CAPE para esta consulta.`
  });

  crearGraficoOpcional({
    clave: 'li', canvasId: 'graficoLi', estadoId: 'sinDatosLi', etiquetas,
    datos: h.lifted_index, etiqueta: 'Lifted Index', color: COLORES.li, tipo: 'line', unidad: 'LI',
    mensaje: `${modelo.corto} no proporciona Lifted Index a través de Open-Meteo.`
  });

  crearGraficoOpcional({
    clave: 'cin', canvasId: 'graficoCin', estadoId: 'sinDatosCin', etiquetas,
    datos: h.convective_inhibition, etiqueta: 'CIN J/kg', color: COLORES.cin, tipo: 'bar', unidad: 'J/kg',
    mensaje: `${modelo.corto} no proporciona inhibición convectiva a través de Open-Meteo.`
  });

  crearGraficoOpcional({
    clave: 'pbl', canvasId: 'graficoPbl', estadoId: 'sinDatosPbl', etiquetas,
    datos: h.boundary_layer_height, etiqueta: 'Altura PBL m', color: COLORES.pbl, tipo: 'line', unidad: 'm',
    mensaje: `${modelo.corto} no proporciona altura de la PBL a través de Open-Meteo.`
  });
}

function actualizarTiraDireccionViento(tiempos, direcciones) {
  const caja = $('tiraDireccionViento');
  if (!caja) return;
  const paso = Math.max(1, Math.ceil(tiempos.length / 16));
  const indices = [];
  for (let i = 0; i < tiempos.length; i += paso) indices.push(i);

  caja.innerHTML = indices.map(i => {
    const grados = Number(direcciones[i]);
    if (!Number.isFinite(grados)) return '';
    const hora = new Date(tiempos[i]).toLocaleString('es-ES', { day: '2-digit', hour: '2-digit' });
    const giro = (grados + 180) % 360;
    return `<span class="direccion-item" title="${formatearFechaHora(tiempos[i])}: viento de ${rumbo(grados)} (${redondear(grados, 0)}°)">
      <span class="flecha" style="transform: rotate(${giro}deg)">↑</span>
      <strong>${rumbo(grados)}</strong><small>${hora}</small>
    </span>`;
  }).join('');
}

function crearGraficoOpcional({ clave, canvasId, estadoId, etiquetas, datos, etiqueta, color, tipo, unidad, mensaje }) {
  const canvas = $(canvasId);
  const aviso = $(estadoId);
  const disponible = Array.isArray(datos) && datos.some(valor => valor != null && Number.isFinite(Number(valor)));

  if (!disponible) {
    if (estado.graficos[clave]) {
      estado.graficos[clave].destroy();
      delete estado.graficos[clave];
    }
    canvas.hidden = true;
    aviso.textContent = mensaje;
    aviso.hidden = false;
    return;
  }

  canvas.hidden = false;
  aviso.hidden = true;
  const dataset = tipo === 'bar'
    ? barras(etiqueta, datos, color, 'y')
    : relleno(etiqueta, datos, color, 'y');

  crearGrafico(clave, canvasId, {
    type: tipo === 'bar' ? 'bar' : 'line',
    data: { labels: etiquetas, datasets: [dataset] },
    options: {
      ...opcionesComunes(etiquetas.length),
      scales: {
        x: escalaX(),
        y: { beginAtZero: tipo !== 'line' || clave === 'pbl', title: { display: true, text: unidad } }
      }
    }
  });
}

function opcionesComunes() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    elements: { point: { radius: 0, hoverRadius: 3 } },
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 14, usePointStyle: true, padding: 14 } },
      tooltip: { enabled: true }
    }
  };
}

function escalaX() {
  return {
    grid: { display: false },
    ticks: { autoSkip: true, maxTicksLimit: 14, maxRotation: 0, font: { size: 10 } }
  };
}

function linea(etiqueta, datos, color, eje = 'y', ancho = 2, discontinua = false) {
  return {
    type: 'line', label: etiqueta, data: datos, borderColor: color, backgroundColor: color,
    yAxisID: eje, borderWidth: ancho, tension: .25, spanGaps: true,
    borderDash: discontinua ? [5, 4] : [], pointRadius: 0
  };
}

function relleno(etiqueta, datos, color, eje = 'y') {
  return {
    type: 'line', label: etiqueta, data: datos, borderColor: color,
    backgroundColor: hexadecimalA_RGBA(color, .15), yAxisID: eje,
    borderWidth: 2, tension: .25, fill: true, pointRadius: 0
  };
}

function barras(etiqueta, datos, color, eje = 'y') {
  return {
    type: 'bar', label: etiqueta, data: datos, backgroundColor: hexadecimalA_RGBA(color, .65),
    borderColor: color, yAxisID: eje, borderWidth: .5, barPercentage: .85, categoryPercentage: .95
  };
}

function crearGrafico(clave, canvasId, config) {
  if (estado.graficos[clave]) estado.graficos[clave].destroy();
  estado.graficos[clave] = new Chart($(canvasId), config);
}

function actualizarTablaDiaria(datos) {
  const d = datos.daily;
  const cuerpo = $('tablaDiaria');
  cuerpo.innerHTML = '';

  d.time.forEach((fecha, i) => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td><strong>${formatearDia(fecha)}</strong></td>
      <td>${formato(d.temperature_2m_min[i], 1)} / ${formato(d.temperature_2m_max[i], 1)} °C</td>
      <td>${formato(d.relative_humidity_2m_min[i], 0)} / ${formato(d.relative_humidity_2m_max[i], 0)} %</td>
      <td>${formato(d.vapour_pressure_deficit_max[i], 2)} kPa</td>
      <td>${formato(d.wind_gusts_10m_max[i], 0)} km/h</td>
      <td>${rumbo(d.wind_direction_10m_dominant[i])}</td>
      <td>${formato(d.precipitation_sum[i], 1)} mm</td>
      <td>${formato(d.cape_max[i], 0)} J/kg</td>`;
    cuerpo.appendChild(fila);
  });
}

function calcularRecuperacionNocturna(hourly) {
  const noches = new Map();
  hourly.time.forEach((fechaIso, i) => {
    const fecha = new Date(fechaIso);
    const hora = fecha.getHours();
    if (hora >= 21 || hora <= 7) {
      const clave = hora >= 21
        ? fechaIso.slice(0, 10)
        : new Date(fecha.getTime() - 86400000).toISOString().slice(0, 10);
      const valor = hourly.relative_humidity_2m[i];
      if (valor == null) return;
      if (!noches.has(clave)) noches.set(clave, []);
      noches.get(clave).push(valor);
    }
  });

  const resultados = [...noches.entries()]
    .filter(([, valores]) => valores.length >= 4)
    .map(([fecha, valores]) => ({ fecha, max: Math.max(...valores) }));

  if (!resultados.length) return { clase: 'Sin datos', detalle: 'No hay suficientes horas nocturnas' };
  const peor = resultados.reduce((a, b) => b.max < a.max ? b : a);
  return {
    clase: clasificarRecuperacion(peor.max),
    detalle: `${formatearDia(peor.fecha)}: HR máxima ${redondear(peor.max, 0)} %`
  };
}

function clasificarRecuperacion(hr) {
  if (hr >= 70) return 'Buena';
  if (hr >= 50) return 'Moderada';
  if (hr >= 30) return 'Deficiente';
  return 'Muy deficiente';
}

function clasificarCape(cape) {
  if (cape == null) return 'Sin datos';
  if (cape < 100) return 'Muy baja';
  if (cape < 300) return 'Baja';
  if (cape < 700) return 'Moderada';
  if (cape < 1200) return 'Alta';
  return 'Muy alta';
}

function rumbo(grados) {
  if (grados == null || Number.isNaN(Number(grados))) return '—';
  const rumbos = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return rumbos[Math.round((Number(grados) % 360) / 22.5) % 16];
}

function indiceMin(valores) {
  let indice = 0;
  valores.forEach((valor, i) => {
    if (valor != null && (valores[indice] == null || valor < valores[indice])) indice = i;
  });
  return indice;
}

function indiceMax(valores) {
  let indice = 0;
  valores.forEach((valor, i) => {
    if (valor != null && (valores[indice] == null || valor > valores[indice])) indice = i;
  });
  return indice;
}

function suma(valores) {
  return valores.reduce((total, valor) => total + (Number(valor) || 0), 0);
}

function formato(valor, decimales = 0, sufijo = '') {
  if (valor == null || Number.isNaN(Number(valor))) return `—${sufijo}`;
  return `${Number(valor).toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}${sufijo}`;
}

function redondear(valor, decimales = 0) {
  if (valor == null || Number.isNaN(Number(valor))) return '—';
  return Number(Number(valor).toFixed(decimales));
}

function formatearFechaHora(iso) {
  const fecha = new Date(iso);
  return fecha.toLocaleString('es-ES', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatearEtiquetaEje(iso) {
  const fecha = new Date(iso);
  const hora = fecha.getHours();
  if (hora === 0) return fecha.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit' });
  return `${String(hora).padStart(2, '0')} h`;
}

function formatearDia(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
}

function hexadecimalA_RGBA(hex, alfa) {
  const limpio = hex.replace('#', '');
  const r = parseInt(limpio.slice(0, 2), 16);
  const g = parseInt(limpio.slice(2, 4), 16);
  const b = parseInt(limpio.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto || '';
  return div.innerHTML;
}

function mostrarCargando(visible) {
  $('cargando').hidden = !visible;
}

function mostrarAviso(mensaje) {
  const caja = $('mensajeError');
  caja.textContent = mensaje;
  caja.hidden = false;
}

function ocultarAviso() {
  $('mensajeError').hidden = true;
}

function setEstadoApi(texto) {
  $('estadoApi').textContent = texto;
}

window.addEventListener('DOMContentLoaded', iniciar);
