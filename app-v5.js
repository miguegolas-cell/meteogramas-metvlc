'use strict';

const VERSION_METVLC = '5.0.0';

const CONFIG = {
  puntoInicial: { lat: 39.4699, lon: -0.3763, nombre: 'València' },
  zonaHoraria: 'Europe/Madrid',
  apiForecast: 'https://api.open-meteo.com/v1/forecast',
  apiGfs: 'https://api.open-meteo.com/v1/gfs',
  nivelesPerfilGfs: [1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 675, 650, 625, 600, 575, 550, 525, 500, 475, 450, 425, 400, 375, 350, 325, 300, 275, 250, 225, 200],
  apiGeocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  limiteProvincia: "https://mapas.fomento.gob.es/arcgis/rest/services/SIU/ENTIDADES_TERRITORIALES_EGRN/MapServer/2/query?where=CodINE%3D%2746%27&outFields=NAMEUNIT%2CCodINE&returnGeometry=true&outSR=4326&f=geojson",
  modelos: {
    best_match: {
      id: 'best_match',
      nombre: 'Mejor ajuste Open-Meteo',
      corto: 'Mejor ajuste',
      maxDias: 10,
      probPrecipitacion: true,
      variablesAvanzadas: ['lifted_index', 'convective_inhibition', 'boundary_layer_height'],
      ayuda: 'Selección automática y combinación de los modelos más adecuados para el punto.'
    },
    ecmwf_ifs: {
      id: 'ecmwf_ifs',
      nombre: 'ECMWF IFS HRES · 9 km',
      corto: 'ECMWF IFS',
      maxDias: 10,
      probPrecipitacion: false,
      variablesAvanzadas: ['convective_inhibition', 'boundary_layer_height'],
      ayuda: 'Modelo global ECMWF IFS HRES a 9 km. Alcance del visor limitado a 10 días.'
    },
    dwd_icon_seamless: {
      id: 'dwd_icon_seamless',
      nombre: 'DWD ICON · global/europeo',
      corto: 'DWD ICON',
      maxDias: 7,
      probPrecipitacion: false,
      variablesAvanzadas: [],
      ayuda: 'Serie ICON integrada por Open-Meteo; para Valencia combina el modelo global y el europeo.'
    },
    ncep_gfs_seamless: {
      id: 'ncep_gfs_seamless',
      nombre: 'NOAA GFS · global',
      corto: 'NOAA GFS',
      maxDias: 10,
      probPrecipitacion: true,
      variablesAvanzadas: ['lifted_index', 'convective_inhibition', 'boundary_layer_height'],
      ayuda: 'Modelo global GFS de NOAA. Incluye probabilidad de precipitación calculada con GEFS.'
    },
    meteofrance_seamless: {
      id: 'meteofrance_seamless',
      nombre: 'Météo-France · AROME/ARPEGE',
      corto: 'Météo-France',
      maxDias: 3,
      probPrecipitacion: false,
      variablesAvanzadas: [],
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
  pbl: '#267a68',
  perfilTemp: '#d84532',
  perfilRocio: '#1e78b4',
  hodografa: '#5d45a5'
};

const estado = {
  mapa: null,
  marcador: null,
  limite: null,
  capaLimite: null,
  graficos: {},
  punto: { ...CONFIG.puntoInicial },
  datos: null,
  perfilGfs: null,
  fuentesVariables: {},
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

  const selectorPerfil = $('horaPerfil');
  if (selectorPerfil) selectorPerfil.addEventListener('change', actualizarPerfilVertical);
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
  estado.perfilGfs = null;
  estado.fuentesVariables = {};
  prepararSelectorPerfil(null);

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

    const consultas = await Promise.allSettled([
      consultarVariablesAvanzadas(lat, lon, dias, modelo, datos.hourly.time),
      consultarApoyoGfs(lat, lon, dias, datos.hourly.time),
      consultarPerfilGfs(lat, lon, dias)
    ]);

    const datosAvanzados = consultas[0].status === 'fulfilled' ? consultas[0].value : {};
    const apoyoGfs = consultas[1].status === 'fulfilled' ? consultas[1].value : {};
    const perfilGfs = consultas[2].status === 'fulfilled' ? consultas[2].value : null;

    combinarDatosAvanzados(datos, datosAvanzados);
    normalizarDatosOpcionales(datos);
    aplicarApoyoGfs(datos, apoyoGfs, modelo);

    estado.punto = { lat, lon, nombre };
    estado.datos = datos;
    estado.perfilGfs = perfilGfs;
    estado.modelo = modelo.id;

    actualizarEstadoVariablesAvanzadas(datos, modelo);
    actualizarCabeceraPunto(datos, modelo);
    actualizarResumen(datos);
    actualizarGraficos(datos);
    actualizarTablaDiaria(datos);
    actualizarTablaNocturna(datos);
    prepararSelectorPerfil(perfilGfs);

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


async function consultarApoyoGfs(lat, lon, dias, tiemposBase) {
  const variables = [
    'temperature_850hPa', 'cape', 'convective_inhibition',
    'lifted_index', 'boundary_layer_height'
  ];

  try {
    return await solicitarGfsVariables(lat, lon, dias, variables, tiemposBase);
  } catch (error) {
    console.warn('Consulta de apoyo GFS agrupada no disponible; se prueban variables por separado.', error);
    const resultados = await Promise.allSettled(
      variables.map(variable => solicitarGfsVariables(lat, lon, dias, [variable], tiemposBase))
    );
    return resultados.reduce((acumulado, resultado) => {
      if (resultado.status === 'fulfilled') Object.assign(acumulado, resultado.value);
      return acumulado;
    }, {});
  }
}

async function solicitarGfsVariables(lat, lon, dias, variables, tiemposBase = null) {
  const url = new URL(CONFIG.apiGfs);
  url.search = new URLSearchParams({
    latitude: lat.toFixed(5),
    longitude: lon.toFixed(5),
    hourly: variables.join(','),
    forecast_days: String(dias),
    timezone: CONFIG.zonaHoraria,
    wind_speed_unit: 'kmh'
  });

  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    let detalle = '';
    try { detalle = (await respuesta.json()).reason || ''; } catch { detalle = ''; }
    throw new Error(detalle || `GFS: HTTP ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  if (!datos?.hourly?.time?.length) throw new Error('GFS no devolvió datos horarios.');

  const salida = {};
  variables.forEach(variable => {
    const serie = extraerSerieVariable(datos.hourly, variable);
    if (Array.isArray(serie)) {
      salida[variable] = tiemposBase
        ? alinearSerie(tiemposBase, datos.hourly.time, serie)
        : serie;
    }
  });
  if (!tiemposBase) salida.time = datos.hourly.time;
  return salida;
}

async function consultarPerfilGfs(lat, lon, dias) {
  const niveles = CONFIG.nivelesPerfilGfs;
  const termodinamicas = ['temperature_2m', 'dew_point_2m'];
  const viento = ['wind_speed_10m', 'wind_direction_10m'];
  niveles.forEach(nivel => {
    termodinamicas.push(
      `temperature_${nivel}hPa`,
      `dew_point_${nivel}hPa`,
      `geopotential_height_${nivel}hPa`
    );
    viento.push(`wind_speed_${nivel}hPa`, `wind_direction_${nivel}hPa`);
  });

  const [termo, vientoDatos] = await Promise.all([
    solicitarPerfilGfsGrupo(lat, lon, dias, termodinamicas),
    solicitarPerfilGfsGrupo(lat, lon, dias, viento)
  ]);

  if (!termo?.hourly?.time?.length) throw new Error('El perfil GFS no contiene horas.');
  const hourly = { ...termo.hourly };
  const tiemposBase = termo.hourly.time;

  Object.entries(vientoDatos.hourly || {}).forEach(([clave, valores]) => {
    if (clave === 'time') return;
    hourly[clave] = alinearSerie(tiemposBase, vientoDatos.hourly.time, valores);
  });

  return { ...termo, hourly };
}

async function solicitarPerfilGfsGrupo(lat, lon, dias, variables) {
  const url = new URL(CONFIG.apiGfs);
  url.search = new URLSearchParams({
    latitude: lat.toFixed(5),
    longitude: lon.toFixed(5),
    hourly: variables.join(','),
    forecast_days: String(dias),
    timezone: CONFIG.zonaHoraria,
    wind_speed_unit: 'ms'
  });

  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    let detalle = '';
    try { detalle = (await respuesta.json()).reason || ''; } catch { detalle = ''; }
    throw new Error(detalle || `Perfil GFS: HTTP ${respuesta.status}`);
  }
  return respuesta.json();
}

function serieTieneDatos(serie) {
  return Array.isArray(serie) && serie.some(valor => valor != null && Number.isFinite(Number(valor)));
}

function aplicarApoyoGfs(datos, apoyoGfs, modelo) {
  const h = datos.hourly;

  if (serieTieneDatos(apoyoGfs.temperature_850hPa)) {
    h.temperature_850hPa = apoyoGfs.temperature_850hPa;
    estado.fuentesVariables.temperature_850hPa = 'NOAA GFS';
  }

  ['cape', 'convective_inhibition', 'lifted_index', 'boundary_layer_height'].forEach(variable => {
    if (serieTieneDatos(h[variable])) {
      estado.fuentesVariables[variable] = modelo.corto;
      return;
    }
    if (serieTieneDatos(apoyoGfs[variable])) {
      h[variable] = apoyoGfs[variable];
      estado.fuentesVariables[variable] = 'NOAA GFS (apoyo)';
    }
  });
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
    .filter(([, clave]) => serieTieneDatos(h[clave]))
    .map(([nombre, clave]) => `${nombre} (${estado.fuentesVariables[clave] || modelo.corto})`);
  const ausentes = variables
    .filter(([, clave]) => !serieTieneDatos(h[clave]))
    .map(([nombre]) => nombre);
  const textoDisponibles = disponibles.length ? `Disponibles: ${disponibles.join(', ')}.` : 'No se han recibido variables avanzadas.';
  const textoAusentes = ausentes.length ? ` No disponibles: ${ausentes.join(', ')}.` : '';
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
  const recuperacion = calcularRecuperacionNocturna(datos);

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

  const temperatura850Disponible = serieTieneDatos(h.temperature_850hPa);
  $('estadoTemp850').hidden = false;
  $('estadoTemp850').textContent = temperatura850Disponible
    ? 'La temperatura a 850 hPa se muestra siempre con NOAA GFS, aunque el modelo principal seleccionado sea otro.'
    : 'No ha sido posible obtener la temperatura a 850 hPa desde NOAA GFS.';

  crearGrafico('termico', 'graficoTermico', {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [
        linea('Temperatura 2 m °C', h.temperature_2m, COLORES.temperatura, 'y'),
        ...(temperatura850Disponible
          ? [linea('Temperatura 850 hPa · GFS °C', h.temperature_850hPa, COLORES.temperatura850, 'y', 2, true)]
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

  actualizarGraficoCapeCin(h, etiquetas, modelo);

  crearGraficoOpcional({
    clave: 'li', canvasId: 'graficoLi', estadoId: 'sinDatosLi', etiquetas,
    datos: h.lifted_index, etiqueta: `Lifted Index · ${estado.fuentesVariables.lifted_index || modelo.corto}`, color: COLORES.li, tipo: 'line', unidad: 'LI',
    mensaje: 'No se ha podido obtener Lifted Index del modelo principal ni del apoyo GFS.'
  });


  crearGraficoOpcional({
    clave: 'pbl', canvasId: 'graficoPbl', estadoId: 'sinDatosPbl', etiquetas,
    datos: h.boundary_layer_height, etiqueta: `Altura PBL · ${estado.fuentesVariables.boundary_layer_height || modelo.corto}`, color: COLORES.pbl, tipo: 'line', unidad: 'm',
    mensaje: 'No se ha podido obtener altura de la PBL del modelo principal ni del apoyo GFS.'
  });
}


function actualizarGraficoCapeCin(h, etiquetas, modelo) {
  const canvas = $('graficoCapeCin');
  const aviso = $('sinDatosCapeCin');
  const capeDisponible = serieTieneDatos(h.cape);
  const cinDisponible = serieTieneDatos(h.convective_inhibition);

  const fuenteCape = estado.fuentesVariables.cape || modelo.corto;
  const fuenteCin = estado.fuentesVariables.convective_inhibition || modelo.corto;
  const fuenteTexto = $('fuenteCapeCin');
  if (fuenteTexto) {
    fuenteTexto.textContent = `Fuentes: CAPE ${fuenteCape} · CIN ${fuenteCin}.`;
  }

  if (!capeDisponible && !cinDisponible) {
    if (estado.graficos.capeCin) {
      estado.graficos.capeCin.destroy();
      delete estado.graficos.capeCin;
    }
    canvas.hidden = true;
    aviso.textContent = 'No se han podido obtener CAPE ni CIN del modelo principal ni del apoyo GFS.';
    aviso.hidden = false;
    return;
  }

  canvas.hidden = false;
  aviso.hidden = true;
  const datasets = [];
  if (capeDisponible) datasets.push(barras(`CAPE · ${fuenteCape}`, h.cape, COLORES.cape, 'y'));
  if (cinDisponible) datasets.push(linea(`CIN · ${fuenteCin}`, h.convective_inhibition, COLORES.cin, 'y', 2));

  crearGrafico('capeCin', 'graficoCapeCin', {
    type: 'bar',
    data: { labels: etiquetas, datasets },
    options: {
      ...opcionesComunes(),
      scales: {
        x: escalaX(),
        y: {
          title: { display: true, text: 'Energía (J/kg)' },
          grid: { color: contexto => contexto.tick.value === 0 ? 'rgba(25,45,60,.42)' : 'rgba(127,151,170,.18)' }
        }
      }
    }
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
  const h = datos.hourly;
  const cuerpo = $('tablaDiaria');
  cuerpo.innerHTML = '';

  d.time.forEach((fecha, i) => {
    const capeHorario = h.time
      .map((tiempo, indice) => tiempo.slice(0, 10) === fecha ? h.cape[indice] : null)
      .filter(valor => valor != null && Number.isFinite(Number(valor)));
    const capeMax = d.cape_max[i] != null ? d.cape_max[i] : (capeHorario.length ? Math.max(...capeHorario) : null);

    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td><strong>${formatearDia(fecha)}</strong></td>
      <td>${formato(d.temperature_2m_min[i], 1)} / ${formato(d.temperature_2m_max[i], 1)} °C</td>
      <td>${formato(d.relative_humidity_2m_min[i], 0)} / ${formato(d.relative_humidity_2m_max[i], 0)} %</td>
      <td>${formato(d.vapour_pressure_deficit_max[i], 2)} kPa</td>
      <td>${formato(d.wind_gusts_10m_max[i], 0)} km/h</td>
      <td>${rumbo(d.wind_direction_10m_dominant[i])}</td>
      <td>${formato(d.precipitation_sum[i], 1)} mm</td>
      <td>${formato(capeMax, 0)} J/kg</td>`;
    cuerpo.appendChild(fila);
  });
}

function calcularNoches(datos) {
  const h = datos.hourly;
  const d = datos.daily;
  const noches = [];
  if (!h?.time?.length || !d?.time?.length || !d.sunset || !d.sunrise) return noches;

  for (let i = 0; i < d.time.length - 1; i += 1) {
    const inicio = d.sunset[i];
    const fin = d.sunrise[i + 1];
    if (!inicio || !fin) continue;

    const indices = h.time
      .map((tiempo, indice) => ({ tiempo, indice }))
      .filter(item => item.tiempo >= inicio && item.tiempo <= fin)
      .map(item => item.indice);
    if (indices.length < 4) continue;

    const temperaturas = indices.map(indice => h.temperature_2m[indice]).filter(Number.isFinite);
    const humedades = indices.map(indice => h.relative_humidity_2m[indice]).filter(Number.isFinite);
    const dpv = indices.map(indice => h.vapour_pressure_deficit[indice]).filter(Number.isFinite);
    if (!temperaturas.length || !humedades.length) continue;

    const tMin = Math.min(...temperaturas);
    const hrMax = Math.max(...humedades);
    const dpvMax = dpv.length ? Math.max(...dpv) : null;
    noches.push({
      fechaInicio: d.time[i],
      fechaFin: d.time[i + 1],
      inicio,
      fin,
      tMin,
      hrMax,
      dpvMax,
      tipoTermico: clasificarNocheCalida(tMin),
      recuperacion: clasificarRecuperacion(hrMax),
      recuperacionBaja: hrMax < 50
    });
  }
  return noches;
}

function calcularRecuperacionNocturna(datos) {
  const noches = calcularNoches(datos);
  if (!noches.length) return { clase: 'Sin datos', detalle: 'No hay suficientes horas nocturnas' };
  const peor = noches.reduce((a, b) => b.hrMax < a.hrMax ? b : a);
  return {
    clase: peor.recuperacion,
    detalle: `${formatearNoche(peor.fechaInicio, peor.fechaFin)}: HR máxima ${redondear(peor.hrMax, 0)} %`
  };
}

function actualizarTablaNocturna(datos) {
  const cuerpo = $('tablaNocturna');
  if (!cuerpo) return;
  const noches = calcularNoches(datos);
  datos._noches = noches;
  cuerpo.innerHTML = '';

  if (!noches.length) {
    cuerpo.innerHTML = '<tr><td colspan="7">No hay suficientes horas completas entre puesta de sol y amanecer.</td></tr>';
    return;
  }

  noches.forEach(noche => {
    const fila = document.createElement('tr');
    const esTorrida = noche.tipoTermico === 'Tórrida';
    const esCalida = noche.tipoTermico !== 'Normal';
    if (esTorrida || (esCalida && noche.recuperacionBaja)) fila.className = 'fila-alerta-alta';
    else if (esCalida || noche.recuperacionBaja) fila.className = 'fila-alerta-nocturna';

    const señales = [];
    if (esCalida) señales.push(`Noche ${noche.tipoTermico.toLowerCase()}`);
    if (noche.recuperacionBaja) señales.push('recuperación baja');
    const señal = señales.length ? señales.join(' + ') : 'Sin señal destacada';

    fila.innerHTML = `
      <td><strong>${formatearNoche(noche.fechaInicio, noche.fechaFin)}</strong></td>
      <td>${formato(noche.tMin, 1)} °C</td>
      <td><span class="insignia ${claseInsigniaNoche(noche.tipoTermico)}">${noche.tipoTermico}</span></td>
      <td>${formato(noche.hrMax, 0)} %</td>
      <td><span class="insignia ${noche.recuperacionBaja ? 'insignia-baja' : 'insignia-buena'}">${noche.recuperacion}</span></td>
      <td>${formato(noche.dpvMax, 2)} kPa</td>
      <td>${señal}</td>`;
    cuerpo.appendChild(fila);
  });
}

function clasificarNocheCalida(tMin) {
  if (!Number.isFinite(Number(tMin))) return 'Sin datos';
  if (tMin >= 30) return 'Tórrida';
  if (tMin >= 25) return 'Ecuatorial';
  if (tMin >= 20) return 'Tropical';
  return 'Normal';
}

function claseInsigniaNoche(tipo) {
  if (tipo === 'Tórrida') return 'insignia-torrida';
  if (tipo === 'Ecuatorial') return 'insignia-ecuatorial';
  if (tipo === 'Tropical') return 'insignia-tropical';
  return 'insignia-neutra';
}

function formatearNoche(fechaInicio, fechaFin) {
  const inicio = new Date(`${fechaInicio}T12:00:00`);
  const fin = new Date(`${fechaFin}T12:00:00`);
  const diaInicio = inicio.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  const diaFin = fin.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  return `${diaInicio} → ${diaFin}`;
}

function prepararSelectorPerfil(perfil) {
  const selector = $('horaPerfil');
  const estadoPerfil = $('estadoPerfil');
  if (!selector || !estadoPerfil) return;
  selector.innerHTML = '';

  if (!perfil?.hourly?.time?.length) {
    selector.disabled = true;
    selector.innerHTML = '<option>Perfil GFS no disponible</option>';
    estadoPerfil.textContent = 'No ha sido posible cargar los niveles de presión de GFS.';
    mostrarPerfilSinDatos('El perfil vertical GFS no está disponible para esta consulta.');
    return;
  }

  const tiempos = perfil.hourly.time;
  const ahora = Date.now();
  let indiceInicial = 0;
  let distanciaMinima = Infinity;

  tiempos.forEach((tiempo, indice) => {
    const fecha = new Date(tiempo);
    const distancia = Math.abs(fecha.getTime() - ahora);
    if (distancia < distanciaMinima) {
      distanciaMinima = distancia;
      indiceInicial = indice;
    }
    if (indice % 3 !== 0 && indice !== tiempos.length - 1) return;
    const opcion = document.createElement('option');
    opcion.value = String(indice);
    opcion.textContent = fecha.toLocaleString('es-ES', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    selector.appendChild(opcion);
  });

  const indicesOpciones = [...selector.options].map(opcion => Number(opcion.value));
  const indiceMasCercano = indicesOpciones.reduce((mejor, actual) =>
    Math.abs(actual - indiceInicial) < Math.abs(mejor - indiceInicial) ? actual : mejor,
  indicesOpciones[0]);
  selector.value = String(indiceMasCercano);
  selector.disabled = false;
  estadoPerfil.textContent = 'Fuente: NOAA GFS · perfil previsto, no observado.';
  actualizarPerfilVertical();
}

function mostrarPerfilSinDatos(mensaje) {
  ['perfil', 'hodografa'].forEach(clave => {
    if (estado.graficos[clave]) {
      estado.graficos[clave].destroy();
      delete estado.graficos[clave];
    }
  });
  const canvasPerfil = $('graficoPerfil');
  const canvasHodo = $('graficoHodografa');
  const avisoPerfil = $('sinDatosPerfil');
  const avisoHodo = $('sinDatosHodografa');
  if (canvasPerfil) canvasPerfil.hidden = true;
  if (canvasHodo) canvasHodo.hidden = true;
  if (avisoPerfil) { avisoPerfil.hidden = false; avisoPerfil.textContent = mensaje; }
  if (avisoHodo) { avisoHodo.hidden = false; avisoHodo.textContent = mensaje; }
  actualizarTarjetasPerfil(null);
}

function actualizarPerfilVertical() {
  const perfil = estado.perfilGfs;
  const selector = $('horaPerfil');
  if (!perfil?.hourly?.time?.length || !selector || selector.disabled) return;
  const indice = Number(selector.value);
  if (!Number.isInteger(indice)) return;

  const niveles = extraerNivelesPerfil(perfil, indice);
  if (niveles.length < 5) {
    mostrarPerfilSinDatos('No hay suficientes niveles atmosféricos válidos en esta hora.');
    return;
  }

  dibujarPerfilTermodinamico(niveles);
  dibujarHodografa(niveles);
  actualizarTarjetasPerfil({ perfil, indice, niveles });
  $('estadoPerfil').textContent = `NOAA GFS · ${formatearFechaHora(perfil.hourly.time[indice])} · ${niveles.length} niveles válidos.`;
}

function extraerNivelesPerfil(perfil, indice) {
  const elevacion = Number(estado.datos?.elevation ?? perfil.elevation ?? 0);
  return CONFIG.nivelesPerfilGfs.map(presion => {
    const temperatura = numeroSeguro(perfil.hourly[`temperature_${presion}hPa`]?.[indice]);
    const rocio = numeroSeguro(perfil.hourly[`dew_point_${presion}hPa`]?.[indice]);
    const velocidad = numeroSeguro(perfil.hourly[`wind_speed_${presion}hPa`]?.[indice]);
    const direccion = numeroSeguro(perfil.hourly[`wind_direction_${presion}hPa`]?.[indice]);
    const altura = numeroSeguro(perfil.hourly[`geopotential_height_${presion}hPa`]?.[indice]);
    return {
      presion, temperatura, rocio, velocidad, direccion, altura,
      alturaAgl: altura == null ? null : altura - elevacion
    };
  }).filter(nivel =>
    nivel.altura != null && nivel.alturaAgl > -50 &&
    (nivel.temperatura != null || nivel.rocio != null || nivel.velocidad != null)
  );
}

function dibujarPerfilTermodinamico(niveles) {
  const canvas = $('graficoPerfil');
  const aviso = $('sinDatosPerfil');
  canvas.hidden = false;
  aviso.hidden = true;

  const puntosTemperatura = niveles
    .filter(n => n.temperatura != null)
    .map(n => ({ x: n.temperatura, y: n.presion, altura: n.altura }));
  const puntosRocio = niveles
    .filter(n => n.rocio != null)
    .map(n => ({ x: n.rocio, y: n.presion, altura: n.altura }));

  crearGrafico('perfil', 'graficoPerfil', {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Temperatura', data: puntosTemperatura, parsing: false,
          borderColor: COLORES.perfilTemp, backgroundColor: COLORES.perfilTemp,
          borderWidth: 2.5, pointRadius: 2.5, pointHoverRadius: 5, tension: .12
        },
        {
          label: 'Punto de rocío', data: puntosRocio, parsing: false,
          borderColor: COLORES.perfilRocio, backgroundColor: COLORES.perfilRocio,
          borderWidth: 2.5, pointRadius: 2.5, pointHoverRadius: 5, tension: .12
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: contexto => `${contexto.dataset.label}: ${formato(contexto.parsed.x, 1)} °C · ${contexto.parsed.y} hPa · ${formato(contexto.raw.altura, 0)} m s.n.m.`
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Temperatura (°C)' }, grid: { color: 'rgba(127,151,170,.18)' } },
        y: {
          type: 'logarithmic', reverse: true, min: 200, max: 1000,
          title: { display: true, text: 'Presión (hPa)' },
          ticks: {
            callback: valor => [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200].includes(Number(valor)) ? valor : ''
          }
        }
      }
    }
  });
}

function dibujarHodografa(niveles) {
  const canvas = $('graficoHodografa');
  const aviso = $('sinDatosHodografa');
  const puntos = niveles
    .filter(n => n.velocidad != null && n.direccion != null && n.alturaAgl != null)
    .sort((a, b) => a.altura - b.altura)
    .map(n => {
      const comp = componentesViento(n.velocidad, n.direccion);
      return { x: comp.u, y: comp.v, presion: n.presion, altura: n.altura, alturaAgl: n.alturaAgl, velocidad: n.velocidad, direccion: n.direccion };
    });

  if (puntos.length < 3) {
    canvas.hidden = true;
    aviso.hidden = false;
    aviso.textContent = 'No hay suficientes niveles de viento para construir la hodógrafa.';
    return;
  }

  canvas.hidden = false;
  aviso.hidden = true;
  const maxAbs = Math.max(10, ...puntos.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
  const limite = Math.ceil(maxAbs / 5) * 5;

  crearGrafico('hodografa', 'graficoHodografa', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Viento por niveles', data: puntos, parsing: false, showLine: true,
        borderColor: COLORES.hodografa, backgroundColor: COLORES.hodografa,
        borderWidth: 2, pointRadius: 3.5, pointHoverRadius: 6, tension: .15
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: contexto => `${contexto.raw.presion} hPa · ${formato(contexto.raw.alturaAgl, 0)} m AGL · ${formato(contexto.raw.velocidad, 1)} m/s de ${rumbo(contexto.raw.direccion)}`
          }
        }
      },
      scales: {
        x: { min: -limite, max: limite, title: { display: true, text: 'Componente U (m/s, este +)' } },
        y: { min: -limite, max: limite, title: { display: true, text: 'Componente V (m/s, norte +)' } }
      }
    }
  });
}

function actualizarTarjetasPerfil(contexto) {
  const ids = ['perfilHainesBajo', 'perfilHainesMedio', 'perfilHainesAlto', 'perfilLcl', 'perfilCero', 'perfilShear6', 'perfilShear3', 'perfilInversion'];
  if (!contexto) {
    ids.forEach(id => { if ($(id)) $(id).textContent = '—'; });
    return;
  }

  const { perfil, indice, niveles } = contexto;
  $('perfilHainesBajo').textContent = formatearHaines(calcularHaines(perfil, indice, 'bajo'));
  $('perfilHainesMedio').textContent = formatearHaines(calcularHaines(perfil, indice, 'medio'));
  $('perfilHainesAlto').textContent = formatearHaines(calcularHaines(perfil, indice, 'alto'));

  const t = numeroSeguro(perfil.hourly.temperature_2m?.[indice]);
  const td = numeroSeguro(perfil.hourly.dew_point_2m?.[indice]);
  const lcl = t != null && td != null ? Math.max(0, 125 * (t - td)) : null;
  $('perfilLcl').textContent = lcl == null ? '—' : `${formato(lcl, 0)} m`;

  const nivelCero = calcularNivelCero(niveles);
  $('perfilCero').textContent = nivelCero == null ? '—' : `${formato(nivelCero, 0)} m`;

  const velocidadSuperficie = numeroSeguro(perfil.hourly.wind_speed_10m?.[indice]);
  const direccionSuperficie = numeroSeguro(perfil.hourly.wind_direction_10m?.[indice]);
  const shear3 = calcularCizalladura(niveles, velocidadSuperficie, direccionSuperficie, 3000);
  const shear6 = calcularCizalladura(niveles, velocidadSuperficie, direccionSuperficie, 6000);
  $('perfilShear3').textContent = shear3 == null ? '—' : `${formato(shear3, 1)} m/s`;
  $('perfilShear6').textContent = shear6 == null ? '—' : `${formato(shear6, 1)} m/s`;

  const inversion = detectarInversionBaja(niveles);
  $('perfilInversion').textContent = inversion ? `${formato(inversion.deltaT, 1)} °C` : 'No detectada';
  $('perfilInversion').title = inversion
    ? `${formato(inversion.z1, 0)}–${formato(inversion.z2, 0)} m AGL`
    : 'No se detecta aumento térmico superior a 0,5 °C entre niveles consecutivos hasta 3 km AGL.';
}

function calcularHaines(perfil, indice, tipo) {
  const valor = (variable, nivel) => numeroSeguro(perfil.hourly[`${variable}_${nivel}hPa`]?.[indice]);
  let estabilidad;
  let sequedad;
  let a;
  let b;

  if (tipo === 'bajo') {
    const t950 = valor('temperature', 950); const t850 = valor('temperature', 850); const td850 = valor('dew_point', 850);
    if ([t950, t850, td850].some(v => v == null)) return null;
    estabilidad = t950 - t850; sequedad = t850 - td850;
    a = estabilidad <= 3 ? 1 : estabilidad <= 7 ? 2 : 3;
    b = sequedad <= 5 ? 1 : sequedad <= 9 ? 2 : 3;
  } else if (tipo === 'medio') {
    const t850 = valor('temperature', 850); const t700 = valor('temperature', 700); const td850 = valor('dew_point', 850);
    if ([t850, t700, td850].some(v => v == null)) return null;
    estabilidad = t850 - t700; sequedad = t850 - td850;
    a = estabilidad <= 5 ? 1 : estabilidad <= 10 ? 2 : 3;
    b = sequedad <= 5 ? 1 : sequedad <= 12 ? 2 : 3;
  } else {
    const t700 = valor('temperature', 700); const t500 = valor('temperature', 500); const td700 = valor('dew_point', 700);
    if ([t700, t500, td700].some(v => v == null)) return null;
    estabilidad = t700 - t500; sequedad = t700 - td700;
    a = estabilidad <= 17 ? 1 : estabilidad <= 21 ? 2 : 3;
    b = sequedad <= 14 ? 1 : sequedad <= 20 ? 2 : 3;
  }
  return { valor: a + b, estabilidad, sequedad };
}

function formatearHaines(resultado) {
  if (!resultado) return '—';
  const nivel = resultado.valor <= 3 ? 'Muy bajo' : resultado.valor === 4 ? 'Bajo' : resultado.valor === 5 ? 'Moderado' : 'Alto';
  return `${resultado.valor} · ${nivel}`;
}

function calcularNivelCero(niveles) {
  const ordenados = niveles
    .filter(n => n.temperatura != null && n.alturaAgl != null)
    .sort((a, b) => a.alturaAgl - b.alturaAgl);
  for (let i = 0; i < ordenados.length - 1; i += 1) {
    const inferior = ordenados[i];
    const superior = ordenados[i + 1];
    if (inferior.temperatura >= 0 && superior.temperatura <= 0) {
      const fraccion = (0 - inferior.temperatura) / (superior.temperatura - inferior.temperatura);
      return inferior.alturaAgl + fraccion * (superior.alturaAgl - inferior.alturaAgl);
    }
  }
  return null;
}

function calcularCizalladura(niveles, velocidadSuperficie, direccionSuperficie, alturaObjetivo) {
  if (velocidadSuperficie == null || direccionSuperficie == null) return null;
  const validos = niveles.filter(n => n.velocidad != null && n.direccion != null && n.alturaAgl != null && n.alturaAgl >= 0);
  if (!validos.length) return null;
  const nivel = validos.reduce((mejor, actual) =>
    Math.abs(actual.alturaAgl - alturaObjetivo) < Math.abs(mejor.alturaAgl - alturaObjetivo) ? actual : mejor
  );
  if (Math.abs(nivel.alturaAgl - alturaObjetivo) > 1400) return null;
  const superficie = componentesViento(velocidadSuperficie, direccionSuperficie);
  const altura = componentesViento(nivel.velocidad, nivel.direccion);
  return Math.hypot(altura.u - superficie.u, altura.v - superficie.v);
}

function detectarInversionBaja(niveles) {
  const ordenados = niveles
    .filter(n => n.temperatura != null && n.alturaAgl != null && n.alturaAgl >= 0 && n.alturaAgl <= 3000)
    .sort((a, b) => a.alturaAgl - b.alturaAgl);
  let mejor = null;
  for (let i = 0; i < ordenados.length - 1; i += 1) {
    const inferior = ordenados[i];
    const superior = ordenados[i + 1];
    const deltaT = superior.temperatura - inferior.temperatura;
    if (deltaT >= 0.5 && (!mejor || deltaT > mejor.deltaT)) {
      mejor = { deltaT, z1: inferior.alturaAgl, z2: superior.alturaAgl };
    }
  }
  return mejor;
}

function componentesViento(velocidad, direccion) {
  const radianes = Number(direccion) * Math.PI / 180;
  return {
    u: -Number(velocidad) * Math.sin(radianes),
    v: -Number(velocidad) * Math.cos(radianes)
  };
}

function numeroSeguro(valor) {
  if (valor == null || !Number.isFinite(Number(valor))) return null;
  return Number(valor);
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
