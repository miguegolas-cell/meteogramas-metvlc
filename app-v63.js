'use strict';

const VERSION_METVLC = '6.3.0';

const CONFIG = {
  puntoInicial: { lat: 39.4699, lon: -0.3763, nombre: 'València' },
  zonaHoraria: 'Europe/Madrid',
  apiForecast: 'https://api.open-meteo.com/v1/forecast',
  apiGfs: 'https://api.open-meteo.com/v1/gfs',
  archivoObservacionesAemet: 'datos/observaciones_aemet.json',
  umbralEstacionCercanaKm: 40,
  umbralEstacionUtilKm: 80,
  nivelesPerfilGfs: [1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 675, 650, 625, 600, 575, 550, 525, 500, 475, 450, 425, 400, 375, 350, 325, 300, 275, 250, 225, 200, 175, 150, 125, 100],
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
  hodografa: '#5d45a5',
  parcela: '#202b33',
  capeArea: 'rgba(226,74,51,.24)',
  cinArea: 'rgba(37,134,196,.20)',
  disparo: '#cf7b13',
  mixing: '#7a4ba0',
  construccionMezcla: '#2a8c78'
};


const bandasOperativasPlugin = {
  id: 'bandasOperativas',
  beforeDraw(chart, _args, opciones) {
    if (!opciones?.bandas?.length || !chart.chartArea) return;
    const { ctx, chartArea, scales } = chart;
    const escala = scales[opciones.eje || 'y'];
    if (!escala) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
    ctx.clip();
    opciones.bandas.forEach(banda => {
      const y1 = escala.getPixelForValue(banda.desde);
      const y2 = escala.getPixelForValue(banda.hasta);
      const top = Math.min(y1, y2);
      const alto = Math.abs(y2 - y1);
      ctx.fillStyle = banda.color;
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, alto);
      if (alto > 18 && banda.etiqueta) {
        ctx.fillStyle = banda.texto || 'rgba(35,55,70,.72)';
        ctx.font = '600 10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(banda.etiqueta, chartArea.right - 7, top + alto / 2);
      }
    });
    ctx.restore();
  }
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
  modelo: 'best_match',
  observaciones: null
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
  Chart.register(bandasOperativasPlugin);
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
  window.addEventListener('resize', () => estado.mapa?.invalidateSize());
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
    setTimeout(() => estado.mapa.invalidateSize(), 100);
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
  if (selectorPerfil) {
    let temporizadorPerfil;
    selectorPerfil.addEventListener('input', () => {
      actualizarTextoHoraPerfil();
      clearTimeout(temporizadorPerfil);
      temporizadorPerfil = setTimeout(actualizarPerfilVertical, 90);
    });
    selectorPerfil.addEventListener('change', actualizarPerfilVertical);
  }
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
    actualizarObservacionesActuales(lat, lon, datos);

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
    current: 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure',
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
  const grupos = [
    ['temperature_2m', 'dew_point_2m', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m', 'surface_pressure']
  ];

  // Las consultas se dividen para evitar URLs demasiado largas y respuestas parciales.
  trocear(niveles, 10).forEach(bloque => {
    grupos.push(bloque.flatMap(nivel => [
      `temperature_${nivel}hPa`,
      `relative_humidity_${nivel}hPa`,
      `dew_point_${nivel}hPa`,
      `geopotential_height_${nivel}hPa`
    ]));
  });
  trocear(niveles, 19).forEach(bloque => {
    grupos.push(bloque.flatMap(nivel => [
      `wind_speed_${nivel}hPa`,
      `wind_direction_${nivel}hPa`
    ]));
  });

  const resultados = await Promise.allSettled(
    grupos.map(variables => solicitarPerfilGfsRobusto(lat, lon, dias, variables))
  );
  const validos = resultados
    .filter(resultado => resultado.status === 'fulfilled' && resultado.value?.hourly?.time?.length)
    .map(resultado => resultado.value);

  if (!validos.length) throw new Error('El perfil GFS no contiene horas.');

  const base = validos[0];
  const tiemposBase = base.hourly.time;
  const hourly = { time: tiemposBase };

  validos.forEach(datos => {
    Object.entries(datos.hourly || {}).forEach(([clave, valores]) => {
      if (clave === 'time' || !Array.isArray(valores)) return;
      hourly[clave] = datos.hourly.time === tiemposBase
        ? valores
        : alinearSerie(tiemposBase, datos.hourly.time, valores);
    });
  });

  return {
    ...base,
    hourly,
    gruposFallidos: resultados.filter(resultado => resultado.status === 'rejected').length
  };
}

function trocear(lista, tamano) {
  const salida = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

async function solicitarPerfilGfsRobusto(lat, lon, dias, variables) {
  try {
    return await solicitarPerfilGfsGrupo(lat, lon, dias, variables);
  } catch (error) {
    if (variables.length <= 2) throw error;
    const mitad = Math.ceil(variables.length / 2);
    const resultados = await Promise.allSettled([
      solicitarPerfilGfsRobusto(lat, lon, dias, variables.slice(0, mitad)),
      solicitarPerfilGfsRobusto(lat, lon, dias, variables.slice(mitad))
    ]);
    const validos = resultados
      .filter(resultado => resultado.status === 'fulfilled' && resultado.value?.hourly?.time?.length)
      .map(resultado => resultado.value);
    if (!validos.length) throw error;
    return combinarBloquesPerfil(validos);
  }
}

function combinarBloquesPerfil(bloques) {
  const base = bloques[0];
  const tiemposBase = base.hourly.time;
  const hourly = { time: tiemposBase };
  bloques.forEach(datos => {
    Object.entries(datos.hourly || {}).forEach(([clave, valores]) => {
      if (clave === 'time' || !Array.isArray(valores)) return;
      hourly[clave] = alinearSerie(tiemposBase, datos.hourly.time, valores);
    });
  });
  return { ...base, hourly };
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
  const datos = await respuesta.json();
  if (!datos?.hourly?.time?.length) throw new Error('El bloque del perfil GFS no contiene horas.');
  return datos;
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
  const d = datos.daily;
  const hoyLocal = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CONFIG.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  let iHoy = d.time.indexOf(hoyLocal);
  if (iHoy < 0) iHoy = 0;

  $('resTemperaturaHoy').textContent = `${formato(d.temperature_2m_min[iHoy], 1)} / ${formato(d.temperature_2m_max[iHoy], 1)} °C`;
  $('resHumedadHoy').textContent = `${formato(d.relative_humidity_2m_min[iHoy], 0)} / ${formato(d.relative_humidity_2m_max[iHoy], 0)} %`;

  const indicesHoy = h.time
    .map((tiempo, indice) => tiempo.slice(0, 10) === d.time[iHoy] ? indice : null)
    .filter(indice => indice != null);
  const iRachaHoy = indicesHoy.reduce((mejor, actual) => {
    if (mejor == null) return actual;
    return Number(h.wind_gusts_10m[actual]) > Number(h.wind_gusts_10m[mejor]) ? actual : mejor;
  }, null);
  $('resRachaHoy').textContent = iRachaHoy == null ? '—' : formato(h.wind_gusts_10m[iRachaHoy], 0, ' km/h');
  $('resRachaHoyHora').textContent = iRachaHoy == null ? 'Sin datos horarios' : formatearFechaHora(h.time[iRachaHoy]);

  const direccionHoy = d.wind_direction_10m_dominant[iHoy];
  $('resVientoHoy').textContent = Number.isFinite(Number(direccionHoy)) ? rumbo(direccionHoy) : '—';
  $('resVientoHoyDetalle').textContent = Number.isFinite(Number(direccionHoy))
    ? `${redondear(direccionHoy, 0)}° · dirección predominante diaria`
    : 'Dirección no disponible';

  const noches = calcularNoches(datos);
  const ahora = Date.now();
  const proximaNoche = noches.find(noche => new Date(noche.fin).getTime() >= ahora) || noches[0];
  if (proximaNoche) {
    $('resRecuperacion').textContent = proximaNoche.recuperacion;
    $('resRecuperacionDetalle').textContent = `${formatearNoche(proximaNoche.fechaInicio, proximaNoche.fechaFin)} · HR máx. ${redondear(proximaNoche.hrMax, 0)} % · mín. ${redondear(proximaNoche.tMin, 1)} °C`;
  } else {
    $('resRecuperacion').textContent = 'Sin datos';
    $('resRecuperacionDetalle').textContent = 'No hay una noche completa disponible';
  }

  const iDpv = indiceMax(h.vapour_pressure_deficit);
  const direccionDpv = rumbo(h.wind_direction_10m[iDpv]);
  $('resDpvMax').textContent = formato(h.vapour_pressure_deficit[iDpv], 2, ' kPa');
  $('resDpvCondiciones').textContent = `${formatearFechaHora(h.time[iDpv])} · ${formato(h.temperature_2m[iDpv], 1, ' °C')} · HR ${formato(h.relative_humidity_2m[iDpv], 0, ' %')} · viento ${formato(h.wind_speed_10m[iDpv], 0, ' km/h')} de ${direccionDpv} · racha ${formato(h.wind_gusts_10m[iDpv], 0, ' km/h')}`;

  const modelo = CONFIG.modelos[estado.modelo] || CONFIG.modelos.best_match;
  $('informeOperativo').innerHTML = [
    `<strong>${modelo.corto} · hoy:</strong> máxima ${formato(d.temperature_2m_max[iHoy], 1, ' °C')}, mínima ${formato(d.temperature_2m_min[iHoy], 1, ' °C')}; HR mínima ${formato(d.relative_humidity_2m_min[iHoy], 0, ' %')} y máxima ${formato(d.relative_humidity_2m_max[iHoy], 0, ' %')}.`,
    `<strong>Viento:</strong> predominante ${Number.isFinite(Number(direccionHoy)) ? rumbo(direccionHoy) : 'no disponible'} y racha máxima ${formato(d.wind_gusts_10m_max[iHoy], 0, ' km/h')}.`,
    proximaNoche ? `<strong>Próxima noche:</strong> recuperación ${proximaNoche.recuperacion.toLowerCase()} con HR máxima ${formato(proximaNoche.hrMax, 0, ' %')}.` : '',
    `<strong>Pico de DPV del periodo:</strong> ${formato(h.vapour_pressure_deficit[iDpv], 2, ' kPa')} el ${formatearFechaHora(h.time[iDpv])}, con ${formato(h.temperature_2m[iDpv], 1, ' °C')}, HR ${formato(h.relative_humidity_2m[iDpv], 0, ' %')} y viento ${formato(h.wind_speed_10m[iDpv], 0, ' km/h')} de ${direccionDpv}.`
  ].filter(Boolean).join(' ');
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

  actualizarGraficoLi(h, etiquetas, modelo);


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
  if (fuenteTexto) fuenteTexto.textContent = `Fuentes: CAPE ${fuenteCape} · CIN ${fuenteCin}. Bandas operativas MetVlc adaptadas al contexto valenciano; interpretación conjunta con forzamiento y orografía.`;

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
  const capeMax = capeDisponible ? Math.max(...h.cape.filter(Number.isFinite)) : 0;
  const cinMin = cinDisponible ? Math.min(...h.convective_inhibition.filter(Number.isFinite)) : 0;
  const maxY = Math.max(2000, Math.ceil(capeMax / 100) * 100);
  const minY = Math.min(-125, Math.floor(cinMin / 25) * 25);

  crearGrafico('capeCin', 'graficoCapeCin', {
    type: 'bar',
    data: { labels: etiquetas, datasets },
    options: {
      ...opcionesComunes(),
      plugins: {
        ...opcionesComunes().plugins,
        bandasOperativas: {
          bandas: [
            { desde: minY, hasta: -125, etiqueta: 'Inhibición muy fuerte', color: 'rgba(120,57,38,.09)' },
            { desde: -125, hasta: -75, etiqueta: 'Inhibición fuerte', color: 'rgba(160,79,41,.085)' },
            { desde: -75, hasta: -35, etiqueta: 'Inhibición moderada', color: 'rgba(196,119,49,.08)' },
            { desde: -35, hasta: -15, etiqueta: 'Inhibición débil', color: 'rgba(222,163,77,.075)' },
            { desde: -15, hasta: 0, etiqueta: 'Inhibición escasa', color: 'rgba(239,205,126,.07)' },
            { desde: 0, hasta: 100, etiqueta: 'CAPE residual', color: 'rgba(96,155,109,.055)' },
            { desde: 100, hasta: 300, etiqueta: 'CAPE baja', color: 'rgba(116,177,110,.065)' },
            { desde: 300, hasta: 700, etiqueta: 'CAPE moderada', color: 'rgba(226,184,72,.075)' },
            { desde: 700, hasta: 1200, etiqueta: 'CAPE alta', color: 'rgba(226,125,55,.08)' },
            { desde: 1200, hasta: 2000, etiqueta: 'CAPE muy alta', color: 'rgba(211,84,49,.085)' },
            { desde: 2000, hasta: maxY, etiqueta: 'CAPE extrema', color: 'rgba(172,45,48,.095)' }
          ]
        }
      },
      scales: {
        x: escalaX(),
        y: {
          min: minY,
          max: maxY,
          title: { display: true, text: 'CAPE (+) / CIN (−) · J/kg' },
          grid: { color: contexto => contexto.tick.value === 0 ? 'rgba(25,45,60,.5)' : 'rgba(127,151,170,.18)' },
          afterBuildTicks: escala => {
            const candidatos = [minY, -125, -75, -35, -15, 0, 100, 300, 700, 1200, 2000, maxY];
            escala.ticks = [...new Set(candidatos.filter(v => v >= minY && v <= maxY))].sort((a,b) => a-b).map(value => ({ value }));
          },
          ticks: {
            callback: value => Number(value).toLocaleString('es-ES')
          }
        }
      }
    }
  });
}

function actualizarGraficoLi(h, etiquetas, modelo) {
  const canvas = $('graficoLi');
  const aviso = $('sinDatosLi');
  const datos = h.lifted_index;
  if (!serieTieneDatos(datos)) {
    if (estado.graficos.li) { estado.graficos.li.destroy(); delete estado.graficos.li; }
    canvas.hidden = true;
    aviso.textContent = 'No se ha podido obtener Lifted Index del modelo principal ni del apoyo GFS.';
    aviso.hidden = false;
    return;
  }
  canvas.hidden = false;
  aviso.hidden = true;
  const minimo = Math.min(...datos.filter(Number.isFinite));
  const maximo = Math.max(...datos.filter(Number.isFinite));
  const minY = Math.min(-8, Math.floor(minimo));
  const maxY = Math.max(4, Math.ceil(maximo));
  crearGrafico('li', 'graficoLi', {
    type: 'line',
    data: { labels: etiquetas, datasets: [relleno(`Lifted Index · ${estado.fuentesVariables.lifted_index || modelo.corto}`, datos, COLORES.li, 'y')] },
    options: {
      ...opcionesComunes(etiquetas.length),
      plugins: {
        ...opcionesComunes().plugins,
        bandasOperativas: {
          bandas: [
            { desde: minY, hasta: -6, etiqueta: 'Muy alta', color: 'rgba(199,67,57,.09)' },
            { desde: -6, hasta: -4, etiqueta: 'Alta', color: 'rgba(226,125,55,.09)' },
            { desde: -4, hasta: -2, etiqueta: 'Moderada', color: 'rgba(226,184,72,.09)' },
            { desde: -2, hasta: 0, etiqueta: 'Baja', color: 'rgba(116,177,110,.08)' },
            { desde: 0, hasta: 2, etiqueta: 'Casi neutro', color: 'rgba(99,155,191,.07)' },
            { desde: 2, hasta: maxY, etiqueta: 'Estable', color: 'rgba(118,139,157,.07)' }
          ]
        }
      },
      scales: {
        x: escalaX(),
        y: {
          min: minY,
          max: maxY,
          title: { display: true, text: 'LI (°C)' },
          afterBuildTicks: escala => { escala.ticks = [-8,-6,-4,-2,0,2,4].filter(v => v >= minY && v <= maxY).map(value => ({ value })); },
          ticks: { callback: value => Number(value).toLocaleString('es-ES') }
        }
      }
    }
  });
}

function actualizarTiraDireccionViento(tiempos, direcciones) {
  const caja = $('tiraDireccionViento');
  if (!caja) return;
  const paso = 3; // una marca cada 3 horas; la tira se desplaza horizontalmente
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
  const textoHora = $('horaPerfilTexto');
  const estadoPerfil = $('estadoPerfil');
  if (!selector || !estadoPerfil || !textoHora) return;

  if (!perfil?.hourly?.time?.length) {
    selector.disabled = true;
    selector.min = '0'; selector.max = '0'; selector.value = '0';
    textoHora.textContent = 'Perfil GFS no disponible';
    estadoPerfil.textContent = 'No ha sido posible cargar los niveles de presión de GFS.';
    mostrarPerfilSinDatos('El perfil vertical GFS no está disponible para esta consulta.');
    return;
  }

  const tiempos = perfil.hourly.time;
  const ahora = Date.now();
  let indiceInicial = 0;
  let distanciaMinima = Infinity;
  tiempos.forEach((tiempo, indice) => {
    const distancia = Math.abs(new Date(tiempo).getTime() - ahora);
    if (distancia < distanciaMinima) { distanciaMinima = distancia; indiceInicial = indice; }
  });

  selector.min = '0';
  selector.max = String(tiempos.length - 1);
  selector.step = '1';
  selector.value = String(indiceInicial);
  selector.disabled = false;
  estadoPerfil.textContent = 'Fuente: NOAA GFS · desplaza la barra para cambiar la hora del perfil.';
  actualizarTextoHoraPerfil();
  actualizarPerfilVertical();
}

function actualizarTextoHoraPerfil() {
  const selector = $('horaPerfil');
  const textoHora = $('horaPerfilTexto');
  const tiempos = estado.perfilGfs?.hourly?.time;
  if (!selector || !textoHora || !tiempos?.length) return;
  const indice = Math.max(0, Math.min(tiempos.length - 1, Number(selector.value) || 0));
  textoHora.textContent = new Date(tiempos[indice]).toLocaleString('es-ES', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
  });
}

function mostrarPerfilSinDatos(mensaje) {
  ['skewt', 'perfil', 'hodografa'].forEach(clave => {
    if (estado.graficos[clave]) {
      estado.graficos[clave].destroy();
      delete estado.graficos[clave];
    }
  });
  const canvasSkewT = $('graficoSkewT');
  const canvasPerfil = $('graficoPerfil');
  const canvasHodo = $('graficoHodografa');
  const avisoSkewT = $('sinDatosSkewT');
  const avisoPerfil = $('sinDatosPerfil');
  const avisoHodo = $('sinDatosHodografa');
  if (canvasSkewT) canvasSkewT.hidden = true;
  if (canvasPerfil) canvasPerfil.hidden = true;
  if (canvasHodo) canvasHodo.hidden = true;
  if (avisoSkewT) { avisoSkewT.hidden = false; avisoSkewT.textContent = mensaje; }
  if (avisoPerfil) { avisoPerfil.hidden = false; avisoPerfil.textContent = mensaje; }
  if (avisoHodo) { avisoHodo.hidden = false; avisoHodo.textContent = mensaje; }
  actualizarTarjetasPerfil(null);
  actualizarTablaNivelesPerfil([]);
}

function actualizarPerfilVertical() {
  const perfil = estado.perfilGfs;
  const selector = $('horaPerfil');
  if (!perfil?.hourly?.time?.length || !selector || selector.disabled) return;
  const indice = Number(selector.value);
  if (!Number.isInteger(indice)) return;
  actualizarTextoHoraPerfil();

  const niveles = extraerNivelesPerfil(perfil, indice);
  if (niveles.length < 5) {
    mostrarPerfilSinDatos('No hay suficientes niveles atmosféricos válidos en esta hora.');
    return;
  }

  const diagnostico = calcularDiagnosticoTermodinamico(perfil, indice, niveles);
  dibujarSkewT(niveles, diagnostico);
  dibujarPerfilTermodinamico(niveles);
  dibujarHodografa(niveles);
  actualizarTarjetasPerfil({ perfil, indice, niveles, diagnostico });
  actualizarTablaNivelesPerfil(niveles);
  const nivelesTemperatura = niveles.filter(nivel => nivel.temperatura != null).length;
  const nivelesRocio = niveles.filter(nivel => nivel.rocio != null).length;
  const fallos = Number(perfil.gruposFallidos || 0);
  $('estadoPerfil').textContent = `NOAA GFS · ${formatearFechaHora(perfil.hourly.time[indice])} · T: ${nivelesTemperatura} niveles · Td: ${nivelesRocio} niveles${fallos ? ` · ${fallos} bloque(s) reintentables sin respuesta` : ''}.`;
}

function extraerNivelesPerfil(perfil, indice) {
  const elevacion = Number(estado.datos?.elevation ?? perfil.elevation ?? 0);
  return CONFIG.nivelesPerfilGfs.map(presion => {
    const temperatura = numeroSeguro(perfil.hourly[`temperature_${presion}hPa`]?.[indice]);
    const humedad = numeroSeguro(perfil.hourly[`relative_humidity_${presion}hPa`]?.[indice]);
    const rocioApi = numeroSeguro(perfil.hourly[`dew_point_${presion}hPa`]?.[indice]);
    const rocioCalculado = temperatura != null && humedad != null
      ? calcularPuntoRocio(temperatura, humedad)
      : null;
    const rocio = rocioApi ?? rocioCalculado;
    const velocidad = numeroSeguro(perfil.hourly[`wind_speed_${presion}hPa`]?.[indice]);
    const direccion = numeroSeguro(perfil.hourly[`wind_direction_${presion}hPa`]?.[indice]);
    const alturaApi = numeroSeguro(perfil.hourly[`geopotential_height_${presion}hPa`]?.[indice]);
    const altura = alturaApi ?? alturaEstandarPresion(presion);
    return {
      presion,
      temperatura,
      humedad,
      rocio,
      rocioCalculado: rocioApi == null && rocioCalculado != null,
      velocidad,
      direccion,
      altura,
      alturaAgl: altura == null ? null : altura - elevacion
    };
  }).filter(nivel => nivel.temperatura != null || nivel.rocio != null || nivel.humedad != null);
}

function calcularPuntoRocio(temperatura, humedadRelativa) {
  const hr = Math.min(100, Math.max(0.1, Number(humedadRelativa)));
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(hr / 100) + (a * temperatura) / (b + temperatura);
  const td = (b * gamma) / (a - gamma);
  return Number.isFinite(td) ? td : null;
}

function alturaEstandarPresion(presion) {
  const altura = 44330 * (1 - Math.pow(Number(presion) / 1013.25, 0.1903));
  return Number.isFinite(altura) ? altura : null;
}


const TERMO = Object.freeze({
  rd: 287.05,
  rv: 461.5,
  cp: 1004.0,
  epsilon: 0.622,
  g: 9.80665,
  kappa: 287.05 / 1004.0,
  skew: 34
});

function presionAY(presion) {
  return Math.log(1000 / Number(presion));
}

function skewX(temperatura, presion) {
  return Number(temperatura) + TERMO.skew * presionAY(presion);
}

function presionDesdeY(y) {
  return 1000 / Math.exp(Number(y));
}

function presionSaturacion(temperaturaC) {
  const t = Number(temperaturaC);
  return 6.112 * Math.exp((17.67 * t) / (t + 243.5));
}

function razonMezclaDesdeRocio(presionHpa, rocioC) {
  const e = Math.min(presionHpa * 0.98, presionSaturacion(rocioC));
  return TERMO.epsilon * e / Math.max(0.01, presionHpa - e);
}

function razonMezclaSaturacion(presionHpa, temperaturaK) {
  const e = Math.min(presionHpa * 0.98, presionSaturacion(temperaturaK - 273.15));
  return TERMO.epsilon * e / Math.max(0.01, presionHpa - e);
}

function temperaturaVirtual(temperaturaK, razonMezcla) {
  return temperaturaK * (1 + 0.61 * Math.max(0, razonMezcla || 0));
}

function calcularLclBolton(p0, t0C, td0C) {
  const t0 = t0C + 273.15;
  const td0 = td0C + 273.15;
  const tlcl = 1 / (1 / (td0 - 56) + Math.log(t0 / td0) / 800) + 56;
  const pLcl = p0 * Math.pow(tlcl / t0, 1 / TERMO.kappa);
  return { presion: pLcl, temperaturaK: tlcl };
}

function derivadaPseudoAdiabatica(temperaturaK, presionPa) {
  const presionHpa = presionPa / 100;
  const rs = razonMezclaSaturacion(presionHpa, temperaturaK);
  const lv = 2.501e6 - 2361 * (temperaturaK - 273.15);
  const numerador = TERMO.rd * temperaturaK + lv * rs;
  const denominador = TERMO.cp + (lv * lv * rs * TERMO.epsilon) / (TERMO.rd * temperaturaK * temperaturaK);
  return (numerador / denominador) / presionPa;
}

function integrarPseudoAdiabatica(tInicialK, pInicialHpa, pFinalHpa) {
  if (pFinalHpa === pInicialHpa) return tInicialK;
  let t = tInicialK;
  let p = pInicialHpa * 100;
  const objetivo = pFinalHpa * 100;
  const direccion = objetivo < p ? -1 : 1;
  while ((direccion < 0 && p > objetivo) || (direccion > 0 && p < objetivo)) {
    const paso = direccion * Math.min(250, Math.abs(objetivo - p));
    const k1 = derivadaPseudoAdiabatica(t, p);
    const k2 = derivadaPseudoAdiabatica(t + 0.5 * paso * k1, p + 0.5 * paso);
    const k3 = derivadaPseudoAdiabatica(t + 0.5 * paso * k2, p + 0.5 * paso);
    const k4 = derivadaPseudoAdiabatica(t + paso * k3, p + paso);
    t += (paso / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    p += paso;
  }
  return t;
}

function interpolarLogPresion(presion, puntos, campo) {
  const validos = puntos
    .filter(p => Number.isFinite(Number(p.presion)) && Number.isFinite(Number(p[campo])))
    .sort((a, b) => b.presion - a.presion);
  if (!validos.length) return null;
  if (presion > validos[0].presion || presion < validos[validos.length - 1].presion) return null;
  const exacto = validos.find(p => Math.abs(p.presion - presion) < 0.001);
  if (exacto) return Number(exacto[campo]);
  for (let i = 0; i < validos.length - 1; i += 1) {
    const a = validos[i];
    const b = validos[i + 1];
    if (presion <= a.presion && presion >= b.presion) {
      const lp = Math.log(presion);
      const f = (lp - Math.log(a.presion)) / (Math.log(b.presion) - Math.log(a.presion));
      return Number(a[campo]) + f * (Number(b[campo]) - Number(a[campo]));
    }
  }
  return null;
}

function construirPresionesDensas(pSuperficie, pTope, extras = []) {
  const lista = [];
  for (let p = pSuperficie; p >= pTope; p -= 5) lista.push(p);
  lista.push(pTope, ...extras.filter(p => p <= pSuperficie && p >= pTope));
  return [...new Set(lista.map(p => Math.round(p * 100) / 100))].sort((a, b) => b - a);
}

function calcularDiagnosticoTermodinamico(perfil, indice, niveles) {
  const elevacion = Number(estado.datos?.elevation ?? perfil.elevation ?? 0);
  const t0 = numeroSeguro(perfil.hourly.temperature_2m?.[indice]);
  const hr0 = numeroSeguro(perfil.hourly.relative_humidity_2m?.[indice]);
  const td0 = numeroSeguro(perfil.hourly.dew_point_2m?.[indice]) ?? (t0 != null && hr0 != null ? calcularPuntoRocio(t0, hr0) : null);
  let p0 = numeroSeguro(perfil.hourly.surface_pressure?.[indice]);
  const nivelesValidos = niveles
    .filter(n => n.temperatura != null && n.rocio != null && n.altura != null)
    .filter(n => n.alturaAgl == null || n.alturaAgl >= -100)
    .sort((a, b) => b.presion - a.presion);
  if (p0 == null) p0 = nivelesValidos[0]?.presion ?? 1000;
  if ([t0, td0, p0].some(v => v == null) || nivelesValidos.length < 4) return null;

  const ambiente = [
    { presion: p0, temperatura: t0, rocio: td0, altura: elevacion, alturaAgl: 0 }
  ];
  nivelesValidos.forEach(n => {
    if (n.presion < p0 - 0.2) ambiente.push({ ...n });
  });
  ambiente.sort((a, b) => b.presion - a.presion);
  const pTope = Math.max(100, ambiente[ambiente.length - 1].presion);
  const lclBase = calcularLclBolton(p0, t0, td0);
  const presiones = construirPresionesDensas(p0, pTope, [...ambiente.map(n => n.presion), lclBase.presion]);
  const w0 = razonMezclaDesdeRocio(p0, td0);
  let ultimaPSaturada = lclBase.presion;
  let ultimaTSaturada = lclBase.temperaturaK;

  const perfilDenso = presiones.map(p => {
    const tEnv = interpolarLogPresion(p, ambiente, 'temperatura');
    const tdEnv = interpolarLogPresion(p, ambiente, 'rocio');
    const z = interpolarLogPresion(p, ambiente, 'altura');
    let tParcelaK;
    let wParcela;
    if (p >= lclBase.presion) {
      tParcelaK = (t0 + 273.15) * Math.pow(p / p0, TERMO.kappa);
      wParcela = w0;
    } else {
      tParcelaK = integrarPseudoAdiabatica(ultimaTSaturada, ultimaPSaturada, p);
      ultimaPSaturada = p;
      ultimaTSaturada = tParcelaK;
      wParcela = razonMezclaSaturacion(p, tParcelaK);
    }
    const wEnv = tdEnv == null ? 0 : razonMezclaDesdeRocio(p, tdEnv);
    const tvParcela = temperaturaVirtual(tParcelaK, wParcela);
    const tvEnv = tEnv == null ? null : temperaturaVirtual(tEnv + 273.15, wEnv);
    return {
      presion: p,
      temperatura: tEnv,
      rocio: tdEnv,
      altura: z,
      alturaAgl: z == null ? null : z - elevacion,
      parcela: tParcelaK - 273.15,
      tvParcela,
      tvEnv,
      deltaTv: tvEnv == null ? null : tvParcela - tvEnv
    };
  }).filter(p => p.temperatura != null && p.altura != null && p.deltaTv != null);

  const lcl = completarNivelPorPresion(lclBase.presion, perfilDenso);
  const cruces = detectarNivelesFlotabilidad(perfilDenso, lclBase.presion);
  const lfc = cruces.lfc;
  const el = cruces.el;
  const energia = integrarCapeCin(perfilDenso, lfc, el);
  const ccl = calcularCcl(ambiente, p0, td0);
  const cero = calcularNivelPorTemperatura(ambiente, 0, elevacion);
  const pbl = calcularNivelPbl(perfil, indice, perfilDenso, elevacion);
  const temperaturaDisparo = calcularTemperaturaDisparo(ccl, p0);
  const mixing = calcularPotencialMixing({ perfil, indice, niveles, perfilDenso, pbl, superficie: { presion: p0, temperatura: t0, rocio: td0, altura: elevacion } });
  const zonas = construirZonasFlotabilidad(perfilDenso, lclBase.presion, lfc, el);

  return {
    superficie: { presion: p0, temperatura: t0, rocio: td0, altura: elevacion },
    perfil: perfilDenso,
    cape: energia.cape,
    cin: energia.cin,
    temperaturaDisparo,
    mixing,
    zonas,
    niveles: { lcl, lfc, el, ccl, cero, pbl }
  };
}

function completarNivelPorPresion(presion, perfil) {
  const temperatura = interpolarLogPresion(presion, perfil, 'temperatura');
  const altura = interpolarLogPresion(presion, perfil, 'altura');
  if (temperatura == null || altura == null) return null;
  const elevacion = Number(estado.datos?.elevation ?? 0);
  return { presion, temperatura, altura, alturaAgl: altura - elevacion };
}

function interpolarCruce(a, b, campo = 'deltaTv') {
  const va = Number(a[campo]);
  const vb = Number(b[campo]);
  if (!Number.isFinite(va) || !Number.isFinite(vb) || va === vb) return null;
  const f = -va / (vb - va);
  if (f < 0 || f > 1) return null;
  const lnP = Math.log(a.presion) + f * (Math.log(b.presion) - Math.log(a.presion));
  const lerp = clave => Number(a[clave]) + f * (Number(b[clave]) - Number(a[clave]));
  return {
    presion: Math.exp(lnP),
    temperatura: lerp('temperatura'),
    parcela: lerp('parcela'),
    altura: lerp('altura'),
    alturaAgl: lerp('alturaAgl'),
    deltaTv: 0
  };
}

function detectarNivelesFlotabilidad(perfil, pLcl) {
  const sobreLcl = perfil.filter(p => p.presion <= pLcl + 0.1);
  let lfc = null;
  let el = null;
  const umbral = 0.03;
  for (let i = 0; i < sobreLcl.length - 1; i += 1) {
    const a = sobreLcl[i];
    const b = sobreLcl[i + 1];
    const da = a.deltaTv - umbral;
    const db = b.deltaTv - umbral;
    if (!lfc && da <= 0 && db > 0) lfc = interpolarCruce({ ...a, deltaTv: da }, { ...b, deltaTv: db });
    if (!lfc && i === 0 && da > 0) lfc = completarNivelPorPresion(pLcl, perfil);
    if (lfc && da > 0 && db <= 0) el = interpolarCruce({ ...a, deltaTv: da }, { ...b, deltaTv: db });
  }
  return { lfc, el };
}

function integrarCapeCin(perfil, lfc, el) {
  if (!lfc) return { cape: 0, cin: 0 };
  let cape = 0;
  let cin = 0;
  const pLfc = lfc?.presion ?? null;
  const pEl = el?.presion ?? perfil[perfil.length - 1]?.presion;
  for (let i = 0; i < perfil.length - 1; i += 1) {
    const a = perfil[i];
    const b = perfil[i + 1];
    const pMed = Math.sqrt(a.presion * b.presion);
    const dln = Math.log(a.presion / b.presion);
    const energia = TERMO.rd * 0.5 * (a.deltaTv + b.deltaTv) * dln;
    if (pLfc != null && pMed <= pLfc && pMed >= pEl && energia > 0) cape += energia;
    if ((pLfc == null || pMed >= pLfc) && energia < 0) cin += energia;
  }
  return { cape: Math.max(0, cape), cin: Math.min(0, cin) };
}

function calcularCcl(ambiente, p0, td0) {
  const w = razonMezclaDesdeRocio(p0, td0);
  const puntos = ambiente.map(n => {
    const e = (w * n.presion) / (TERMO.epsilon + w);
    const ln = Math.log(Math.max(0.01, e) / 6.112);
    const tMezcla = (243.5 * ln) / (17.67 - ln);
    return { ...n, diferencia: n.temperatura - tMezcla, tMezcla };
  });
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const a = puntos[i];
    const b = puntos[i + 1];
    if (a.diferencia === 0 || a.diferencia * b.diferencia <= 0) {
      const cruce = interpolarCruce({ ...a, deltaTv: a.diferencia, parcela: a.tMezcla }, { ...b, deltaTv: b.diferencia, parcela: b.tMezcla });
      if (cruce) return cruce;
    }
  }
  return null;
}


function calcularTemperaturaDisparo(ccl, pSuperficie) {
  if (!ccl?.presion || !Number.isFinite(Number(pSuperficie))) return null;
  const tCcl = numeroSeguro(ccl.temperatura) ?? numeroSeguro(ccl.parcela);
  if (tCcl == null) return null;
  return (tCcl + 273.15) * Math.pow(Number(pSuperficie) / Number(ccl.presion), TERMO.kappa) - 273.15;
}

function humedadDesdeTemperaturaYRocio(temperatura, rocio) {
  if (![temperatura, rocio].every(v => Number.isFinite(Number(v)))) return null;
  const es = 6.112 * Math.exp((17.67 * Number(temperatura)) / (Number(temperatura) + 243.5));
  const e = 6.112 * Math.exp((17.67 * Number(rocio)) / (Number(rocio) + 243.5));
  return Math.max(0, Math.min(100, 100 * e / es));
}

function calcularPotencialMixing({ perfil, indice, niveles, perfilDenso, pbl, superficie }) {
  if (!pbl?.presion || !Number.isFinite(Number(pbl.alturaAgl))) return null;
  const tTecho = interpolarLogPresion(pbl.presion, perfilDenso, 'temperatura');
  const tdTecho = interpolarLogPresion(pbl.presion, perfilDenso, 'rocio');
  if (tTecho == null) return null;
  const temperaturaMezcla = (tTecho + 273.15) * Math.pow(superficie.presion / pbl.presion, TERMO.kappa) - 273.15;
  const temperaturaSuperficie = Number(superficie.temperatura);
  const vientoSuperficie = numeroSeguro(perfil.hourly.wind_speed_10m?.[indice]) ?? 0;
  const direccionSuperficie = numeroSeguro(perfil.hourly.wind_direction_10m?.[indice]);
  const capa = niveles
    .filter(n => n.alturaAgl != null && n.alturaAgl >= 0 && n.alturaAgl <= pbl.alturaAgl + 250)
    .filter(n => n.velocidad != null)
    .sort((a, b) => a.alturaAgl - b.alturaAgl);
  const vientoMaximo = capa.length ? capa.reduce((max, n) => n.velocidad > max.velocidad ? n : max, capa[0]) : null;
  const nivelTecho = niveles
    .filter(n => n.alturaAgl != null && n.alturaAgl >= 0)
    .sort((a, b) => Math.abs(a.presion - pbl.presion) - Math.abs(b.presion - pbl.presion))[0] || null;
  const hrTecho = numeroSeguro(nivelTecho?.humedad) ?? humedadDesdeTemperaturaYRocio(tTecho, tdTecho);
  const depresionRocio = tdTecho == null ? null : tTecho - tdTecho;
  const excesoViento = vientoMaximo ? Math.max(0, vientoMaximo.velocidad - vientoSuperficie) : 0;
  const inversion = detectarInversionBaja(niveles);
  const margenTemperatura = temperaturaSuperficie - temperaturaMezcla;

  let puntos = 0;
  if (pbl.alturaAgl >= 800) puntos += 1;
  if (pbl.alturaAgl >= 1500) puntos += 1;
  if (margenTemperatura >= -2) puntos += 1;
  if (excesoViento >= 3) puntos += 1;       // m/s, ~11 km/h
  if (excesoViento >= 7) puntos += 1;       // m/s, ~25 km/h
  if ((hrTecho != null && hrTecho <= 35) || (depresionRocio != null && depresionRocio >= 12)) puntos += 1;
  if (inversion && inversion.z1 < 700) puntos -= 1;
  puntos = Math.max(0, Math.min(6, puntos));

  let categoria = 'Bajo';
  let clase = 'bajo';
  if (puntos >= 6) { categoria = 'Muy alto'; clase = 'muy-alto'; }
  else if (puntos >= 4) { categoria = 'Alto'; clase = 'alto'; }
  else if (puntos >= 2) { categoria = 'Moderado'; clase = 'moderado'; }

  const razones = [];
  razones.push(`PBL de ${formato(pbl.alturaAgl, 0)} m AGL`);
  razones.push(margenTemperatura >= 0
    ? `la temperatura prevista supera en ${formato(margenTemperatura, 1)} °C la necesaria para mezclar hasta su techo`
    : `faltan aproximadamente ${formato(Math.abs(margenTemperatura), 1)} °C para mezclar en seco hasta su techo`);
  if (vientoMaximo) razones.push(`máximo de ${formato(vientoMaximo.velocidad * 3.6, 0)} km/h a ${formato(vientoMaximo.alturaAgl, 0)} m AGL`);
  if (hrTecho != null) razones.push(`HR cercana al techo de ${formato(hrTecho, 0)} %`);
  if (inversion && inversion.z1 < 700) razones.push('una inversión baja puede limitar el acoplamiento');

  return {
    puntos, categoria, clase,
    temperaturaMezcla,
    temperaturaSuperficie,
    margenTemperatura,
    vientoSuperficie,
    direccionSuperficie,
    vientoMaximo,
    excesoViento,
    hrTecho,
    depresionRocio,
    nivelTecho,
    inversion,
    texto: razones.join('; ')
  };
}

function calcularNivelPorTemperatura(ambiente, objetivo, elevacion) {
  for (let i = 0; i < ambiente.length - 1; i += 1) {
    const a = ambiente[i];
    const b = ambiente[i + 1];
    if ((a.temperatura - objetivo) * (b.temperatura - objetivo) <= 0 && a.temperatura !== b.temperatura) {
      const f = (objetivo - a.temperatura) / (b.temperatura - a.temperatura);
      const lnP = Math.log(a.presion) + f * (Math.log(b.presion) - Math.log(a.presion));
      const altura = a.altura + f * (b.altura - a.altura);
      return { presion: Math.exp(lnP), temperatura: objetivo, altura, alturaAgl: altura - elevacion };
    }
  }
  return null;
}

function calcularNivelPbl(perfil, indice, perfilDenso, elevacion) {
  const tiempo = perfil.hourly.time?.[indice];
  const tiempos = estado.datos?.hourly?.time || [];
  const idx = tiempos.indexOf(tiempo);
  const alturaAgl = idx >= 0 ? numeroSeguro(estado.datos.hourly.boundary_layer_height?.[idx]) : null;
  if (alturaAgl == null) return null;
  const altura = elevacion + alturaAgl;
  const ordenados = perfilDenso.filter(p => p.altura != null).sort((a, b) => a.altura - b.altura);
  for (let i = 0; i < ordenados.length - 1; i += 1) {
    const a = ordenados[i];
    const b = ordenados[i + 1];
    if (altura >= a.altura && altura <= b.altura) {
      const f = (altura - a.altura) / (b.altura - a.altura);
      const lnP = Math.log(a.presion) + f * (Math.log(b.presion) - Math.log(a.presion));
      return { presion: Math.exp(lnP), altura, alturaAgl };
    }
  }
  return null;
}

function construirZonasFlotabilidad(perfil, pLcl, lfc, el) {
  const cape = [];
  const cin = [];
  if (!lfc) return { cape, cin };
  const pLfc = lfc?.presion ?? null;
  const pEl = el?.presion ?? perfil[perfil.length - 1]?.presion;
  for (let i = 0; i < perfil.length - 1; i += 1) {
    const a = perfil[i];
    const b = perfil[i + 1];
    const segmentos = dividirSegmentoPorCero(a, b);
    segmentos.forEach(([s1, s2]) => {
      const pMed = Math.sqrt(s1.presion * s2.presion);
      const signo = 0.5 * (s1.deltaTv + s2.deltaTv);
      const zona = signo > 0 && pLfc != null && pMed <= pLfc && pMed >= pEl
        ? cape
        : signo < 0 && pMed <= perfil[0].presion && (pLfc == null || pMed >= pLfc)
          ? cin
          : null;
      if (zona) zona.push([s1, s2]);
    });
  }
  return { cape, cin };
}

function dividirSegmentoPorCero(a, b) {
  if (a.deltaTv === 0 || b.deltaTv === 0 || a.deltaTv * b.deltaTv > 0) return [[a, b]];
  const cruce = interpolarCruce(a, b);
  return cruce ? [[a, cruce], [cruce, b]] : [[a, b]];
}

function generarAdiabaticasSecas(presiones) {
  const datasets = [];
  for (let theta = 250; theta <= 450; theta += 10) {
    datasets.push({
      label: `θ ${theta} K`, backgroundGuide: true, guideType: 'dry',
      data: presiones.map(p => ({ x: skewX(theta * Math.pow(p / 1000, TERMO.kappa) - 273.15, p), y: presionAY(p), presion: p })),
      parsing: false, showLine: true, pointRadius: 0, borderWidth: 0.65,
      borderColor: 'rgba(151,104,58,.24)', tension: 0
    });
  }
  return datasets;
}

function generarAdiabaticasHumedas(presiones) {
  return [-20, -10, 0, 10, 20, 30, 40].map(t0 => {
    let anteriorP = 1000;
    let anteriorT = t0 + 273.15;
    const puntos = presiones.map(p => {
      if (p !== 1000) anteriorT = integrarPseudoAdiabatica(anteriorT, anteriorP, p);
      anteriorP = p;
      return { x: skewX(anteriorT - 273.15, p), y: presionAY(p), presion: p };
    });
    return {
      label: `Pseudo ${t0} °C`, backgroundGuide: true, guideType: 'moist', data: puntos,
      parsing: false, showLine: true, pointRadius: 0, borderWidth: 0.75,
      borderColor: 'rgba(49,135,92,.27)', tension: 0
    };
  });
}

function generarLineasMezcla(presiones) {
  return [0.4, 1, 2, 4, 6, 8, 12, 16, 20].map(wg => {
    const w = wg / 1000;
    const puntos = presiones.filter(p => p >= 400).map(p => {
      const e = (w * p) / (TERMO.epsilon + w);
      const ln = Math.log(Math.max(0.01, e) / 6.112);
      const t = (243.5 * ln) / (17.67 - ln);
      return { x: skewX(t, p), y: presionAY(p), presion: p };
    });
    return {
      label: `${wg} g/kg`, backgroundGuide: true, guideType: 'mix', data: puntos,
      parsing: false, showLine: true, pointRadius: 0, borderWidth: 0.65,
      borderDash: [3, 3], borderColor: 'rgba(77,113,141,.22)', tension: 0
    };
  });
}


function generarLineasConstruccionSkewT(diagnostico) {
  const salida = [];
  const superficie = diagnostico?.superficie;
  if (!superficie?.presion) return salida;

  const ccl = diagnostico.niveles?.ccl;
  if (ccl?.presion) {
    const presiones = construirPresionesDensas(superficie.presion, ccl.presion, [ccl.presion]);
    const w = razonMezclaDesdeRocio(superficie.presion, superficie.rocio);
    salida.push({
      label: 'Razón de mezcla superficial → CCL', constructionGuide: true,
      data: presiones.map(p => {
        const e = (w * p) / (TERMO.epsilon + w);
        const ln = Math.log(Math.max(0.01, e) / 6.112);
        const t = (243.5 * ln) / (17.67 - ln);
        return { x: skewX(t, p), y: presionAY(p), temperatura: t, presion: p, alturaAgl: null };
      }),
      parsing: false, showLine: true, pointRadius: 0, borderWidth: 2,
      borderDash: [3, 4], borderColor: COLORES.construccionMezcla, tension: 0
    });

    if (Number.isFinite(Number(diagnostico.temperaturaDisparo))) {
      const t0k = diagnostico.temperaturaDisparo + 273.15;
      salida.push({
        label: `Adiabática seca de disparo (${formato(diagnostico.temperaturaDisparo, 1)} °C)`, constructionGuide: true,
        data: presiones.map(p => {
          const t = t0k * Math.pow(p / superficie.presion, TERMO.kappa) - 273.15;
          return { x: skewX(t, p), y: presionAY(p), temperatura: t, presion: p, alturaAgl: null };
        }),
        parsing: false, showLine: true, pointRadius: 0, borderWidth: 2.3,
        borderDash: [9, 4], borderColor: COLORES.disparo, tension: 0
      });
    }
  }

  const pbl = diagnostico.niveles?.pbl;
  const mixing = diagnostico.mixing;
  if (pbl?.presion && Number.isFinite(Number(mixing?.temperaturaMezcla))) {
    const presiones = construirPresionesDensas(superficie.presion, pbl.presion, [pbl.presion]);
    const t0k = mixing.temperaturaMezcla + 273.15;
    salida.push({
      label: `Mezcla seca hasta PBL (${formato(mixing.temperaturaMezcla, 1)} °C)`, constructionGuide: true,
      data: presiones.map(p => {
        const t = t0k * Math.pow(p / superficie.presion, TERMO.kappa) - 273.15;
        return { x: skewX(t, p), y: presionAY(p), temperatura: t, presion: p, alturaAgl: null };
      }),
      parsing: false, showLine: true, pointRadius: 0, borderWidth: 2.2,
      borderDash: [6, 3], borderColor: COLORES.mixing, tension: 0
    });
  }
  return salida;
}

const pluginSkewT = {
  id: 'metvlcSkewTOverlay',
  beforeDatasetsDraw(chart, args, opciones) {
    const diagnostico = opciones?.diagnostico;
    if (!diagnostico?.zonas) return;
    const { ctx, chartArea, scales } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();
    dibujarSegmentosArea(ctx, scales, diagnostico.zonas.cin, COLORES.cinArea);
    dibujarSegmentosArea(ctx, scales, diagnostico.zonas.cape, COLORES.capeArea);
    ctx.restore();
  },
  afterDatasetsDraw(chart, args, opciones) {
    const diagnostico = opciones?.diagnostico;
    if (!diagnostico?.niveles) return;
    const niveles = [
      ['LCL/NCL', diagnostico.niveles.lcl, '#5d45a5'],
      ['LFC/NCA', diagnostico.niveles.lfc, '#bb5b16'],
      ['EL/NE', diagnostico.niveles.el, '#8b3ba7'],
      ['CCL/NCC', diagnostico.niveles.ccl, '#16835d'],
      ['0 °C', diagnostico.niveles.cero, '#397ca8'],
      ['PBL', diagnostico.niveles.pbl, '#267a68']
    ].filter(([, nivel]) => nivel?.presion);
    const { ctx, chartArea, scales } = chart;
    ctx.save();
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    niveles.forEach(([etiqueta, nivel, color], indice) => {
      const y = scales.y.getPixelForValue(presionAY(nivel.presion));
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
      ctx.setLineDash([]);
      const texto = `${etiqueta} ${Math.round(nivel.presion)} hPa`;
      const ancho = ctx.measureText(texto).width + 7;
      const x = chartArea.right - ancho - 3;
      ctx.fillStyle = 'rgba(255,255,255,.86)';
      ctx.fillRect(x, y - 13 - (indice % 2) * 11, ancho, 13);
      ctx.fillStyle = color;
      ctx.fillText(texto, x + 3, y - 2 - (indice % 2) * 11);
    });
    ctx.restore();
  }
};

function dibujarSegmentosArea(ctx, scales, segmentos, color) {
  ctx.fillStyle = color;
  segmentos.forEach(([a, b]) => {
    const puntos = [
      [skewX(a.temperatura, a.presion), presionAY(a.presion)],
      [skewX(b.temperatura, b.presion), presionAY(b.presion)],
      [skewX(b.parcela, b.presion), presionAY(b.presion)],
      [skewX(a.parcela, a.presion), presionAY(a.presion)]
    ];
    ctx.beginPath();
    puntos.forEach(([x, y], i) => {
      const px = scales.x.getPixelForValue(x);
      const py = scales.y.getPixelForValue(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  });
}

function dibujarSkewT(niveles, diagnostico) {
  const canvas = $('graficoSkewT');
  const aviso = $('sinDatosSkewT');
  if (!diagnostico?.perfil?.length) {
    canvas.hidden = true;
    aviso.hidden = false;
    aviso.textContent = 'No se ha podido calcular la parcela o el perfil termodinámico avanzado.';
    return;
  }
  canvas.hidden = false;
  aviso.hidden = true;
  const presionesFondo = [];
  for (let p = 1000; p >= 100; p -= 10) presionesFondo.push(p);
  const ambienteT = diagnostico.perfil.map(p => ({ x: skewX(p.temperatura, p.presion), y: presionAY(p.presion), temperatura: p.temperatura, presion: p.presion, alturaAgl: p.alturaAgl }));
  const ambienteTd = diagnostico.perfil.map(p => ({ x: skewX(p.rocio, p.presion), y: presionAY(p.presion), temperatura: p.rocio, presion: p.presion, alturaAgl: p.alturaAgl }));
  const parcela = diagnostico.perfil.map(p => ({ x: skewX(p.parcela, p.presion), y: presionAY(p.presion), temperatura: p.parcela, presion: p.presion, alturaAgl: p.alturaAgl }));
  const lineasConstruccion = generarLineasConstruccionSkewT(diagnostico);
  const puntosConstruccion = lineasConstruccion.flatMap(d => d.data || []);
  const datosX = [...ambienteT, ...ambienteTd, ...parcela, ...puntosConstruccion].map(p => p.x).filter(Number.isFinite);
  const xMin = Math.floor((Math.min(-50, ...datosX) - 8) / 10) * 10;
  const xMax = Math.ceil((Math.max(55, ...datosX) + 8) / 10) * 10;
  const presionesTicks = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100];

  const datasets = [
    ...generarAdiabaticasSecas(presionesFondo),
    ...generarAdiabaticasHumedas(presionesFondo),
    ...generarLineasMezcla(presionesFondo),
    ...lineasConstruccion,
    {
      label: 'Temperatura ambiental', data: ambienteT, parsing: false, showLine: true,
      borderColor: COLORES.perfilTemp, backgroundColor: COLORES.perfilTemp,
      borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, tension: 0
    },
    {
      label: 'Punto de rocío', data: ambienteTd, parsing: false, showLine: true,
      borderColor: COLORES.perfilRocio, backgroundColor: COLORES.perfilRocio,
      borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, tension: 0
    },
    {
      label: 'Parcela superficial', data: parcela, parsing: false, showLine: true,
      borderColor: COLORES.parcela, backgroundColor: COLORES.parcela,
      borderWidth: 2.4, borderDash: [7, 4], pointRadius: 0, pointHoverRadius: 5, tension: 0
    }
  ];

  crearGrafico('skewt', 'graficoSkewT', {
    type: 'line',
    data: { datasets },
    plugins: [pluginSkewT],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        metvlcSkewTOverlay: { diagnostico },
        legend: {
          position: 'bottom',
          labels: { filter: item => !datasets[item.datasetIndex]?.backgroundGuide }
        },
        tooltip: {
          filter: contexto => !contexto.dataset.backgroundGuide,
          callbacks: {
            label: contexto => {
              const altura = Number.isFinite(Number(contexto.raw.alturaAgl)) ? ` · ${formato(contexto.raw.alturaAgl, 0)} m AGL` : '';
              return `${contexto.dataset.label}: ${formato(contexto.raw.temperatura, 1)} °C · ${formato(contexto.raw.presion, 0)} hPa${altura}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear', min: xMin, max: xMax,
          title: { display: true, text: 'Temperatura (°C en 1000 hPa) · isothermas inclinadas' },
          ticks: { stepSize: 10 },
          grid: { color: 'rgba(127,151,170,.14)' }
        },
        y: {
          type: 'linear', min: presionAY(1000), max: presionAY(100),
          title: { display: true, text: 'Presión (hPa, escala logarítmica)' },
          afterBuildTicks: eje => { eje.ticks = presionesTicks.map(p => ({ value: presionAY(p) })); },
          ticks: { callback: valor => Math.round(presionDesdeY(valor)) },
          grid: { color: 'rgba(90,111,127,.20)' }
        }
      }
    }
  });
}

function dibujarPerfilTermodinamico(niveles) {
  const canvas = $('graficoPerfil');
  const aviso = $('sinDatosPerfil');
  canvas.hidden = false;
  aviso.hidden = true;

  const puntosTemperatura = niveles
    .filter(n => n.temperatura != null)
    .map(n => ({ x: n.temperatura, y: n.presion, altura: n.altura, humedad: n.humedad }));
  const puntosRocio = niveles
    .filter(n => n.rocio != null)
    .map(n => ({ x: n.rocio, y: n.presion, altura: n.altura, humedad: n.humedad, calculado: n.rocioCalculado }));

  const presionesPresentes = niveles.map(n => n.presion).filter(Number.isFinite);
  const presionMaxima = Math.min(1000, Math.max(...presionesPresentes));
  const presionMinima = Math.max(100, Math.min(...presionesPresentes));

  crearGrafico('perfil', 'graficoPerfil', {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Temperatura', data: puntosTemperatura, parsing: false,
          borderColor: COLORES.perfilTemp, backgroundColor: COLORES.perfilTemp,
          borderWidth: 3, pointRadius: 3, pointHoverRadius: 6,
          tension: 0, spanGaps: false, showLine: true
        },
        {
          label: 'Punto de rocío', data: puntosRocio, parsing: false,
          borderColor: COLORES.perfilRocio, backgroundColor: COLORES.perfilRocio,
          borderWidth: 3, pointRadius: 3, pointHoverRadius: 6,
          tension: 0, spanGaps: false, showLine: true
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
            label: contexto => {
              const origen = contexto.dataset.label === 'Punto de rocío' && contexto.raw.calculado
                ? ' · calculado con T/HR'
                : '';
              return `${contexto.dataset.label}: ${formato(contexto.parsed.x, 1)} °C · ${contexto.parsed.y} hPa · ${formato(contexto.raw.altura, 0)} m s.n.m.${origen}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Temperatura y punto de rocío (°C)' },
          grid: { color: 'rgba(127,151,170,.18)' }
        },
        y: {
          type: 'logarithmic', reverse: true, min: presionMinima, max: presionMaxima,
          title: { display: true, text: 'Presión (hPa)' },
          ticks: {
            callback: valor => CONFIG.nivelesPerfilGfs.includes(Number(valor)) ? valor : ''
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

function actualizarTablaNivelesPerfil(niveles) {
  const cuerpo = $('tablaPerfilNiveles');
  if (!cuerpo) return;
  if (!Array.isArray(niveles) || !niveles.length) {
    cuerpo.innerHTML = '<tr><td colspan="7">Sin niveles disponibles para la hora seleccionada.</td></tr>';
    return;
  }

  cuerpo.innerHTML = niveles
    .slice()
    .sort((a, b) => b.presion - a.presion)
    .map(nivel => {
      const viento = nivel.velocidad == null
        ? '—'
        : `${formato(nivel.velocidad, 1)} m/s${nivel.direccion == null ? '' : ` · ${formato(nivel.direccion, 0)}°`}`;
      const origenRocio = nivel.rocioCalculado ? ' <span class="marca-calculado">calc.</span>' : '';
      return `<tr>
        <td><strong>${nivel.presion}</strong></td>
        <td>${nivel.altura == null ? '—' : formato(nivel.altura, 0)}</td>
        <td>${nivel.temperatura == null ? '—' : formato(nivel.temperatura, 1)}</td>
        <td>${nivel.rocio == null ? '—' : formato(nivel.rocio, 1)}${origenRocio}</td>
        <td>${nivel.humedad == null ? '—' : formato(nivel.humedad, 0)}</td>
        <td>${viento}</td>
        <td>${nivel.alturaAgl == null ? '—' : formato(nivel.alturaAgl, 0)}</td>
      </tr>`;
    }).join('');
}

function actualizarTarjetasPerfil(contexto) {
  const ids = [
    'perfilHainesBajo', 'perfilHainesMedio', 'perfilHainesAlto', 'perfilLcl', 'perfilLfc',
    'perfilEl', 'perfilCcl', 'perfilCapeCalc', 'perfilCinCalc', 'perfilPblNivel',
    'perfilCero', 'perfilShear6', 'perfilShear3', 'perfilInversion', 'perfilTempDisparoCard',
    'perfilTempDisparo', 'perfilTempMezcla', 'perfilVientoPbl', 'perfilSequedadPbl'
  ];
  if (!contexto) {
    ids.forEach(id => { if ($(id)) $(id).textContent = '—'; });
    if ($('estadoSkewT')) $('estadoSkewT').textContent = 'Sin datos termodinámicos disponibles.';
    return;
  }

  const { perfil, indice, niveles, diagnostico } = contexto;
  $('perfilHainesBajo').textContent = formatearHaines(calcularHaines(perfil, indice, 'bajo'));
  $('perfilHainesMedio').textContent = formatearHaines(calcularHaines(perfil, indice, 'medio'));
  $('perfilHainesAlto').textContent = formatearHaines(calcularHaines(perfil, indice, 'alto'));

  $('perfilCapeCalc').textContent = diagnostico?.cape == null ? '—' : `${formato(diagnostico.cape, 0)} J/kg`;
  $('perfilCinCalc').textContent = diagnostico?.cin == null ? '—' : `${formato(diagnostico.cin, 0)} J/kg`;
  $('perfilLcl').textContent = formatearNivelTermo(diagnostico?.niveles?.lcl);
  $('perfilLfc').textContent = formatearNivelTermo(diagnostico?.niveles?.lfc, 'No existe');
  $('perfilEl').textContent = formatearNivelTermo(diagnostico?.niveles?.el, 'No definido');
  $('perfilCcl').textContent = formatearNivelTermo(diagnostico?.niveles?.ccl, 'No definido');
  $('perfilPblNivel').textContent = formatearNivelTermo(diagnostico?.niveles?.pbl, 'No disponible');
  const temperaturaDisparo = diagnostico?.temperaturaDisparo;
  const textoDisparo = Number.isFinite(Number(temperaturaDisparo)) ? `${formato(temperaturaDisparo, 1)} °C` : 'No definida';
  $('perfilTempDisparoCard').textContent = textoDisparo;
  $('perfilTempDisparo').textContent = textoDisparo;
  actualizarDiagnosticoMixing(diagnostico?.mixing, diagnostico?.niveles?.pbl);

  const nivelCero = diagnostico?.niveles?.cero;
  $('perfilCero').textContent = formatearNivelTermo(nivelCero);

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

  const estadoTexto = $('estadoSkewT');
  if (estadoTexto) {
    const lfc = diagnostico?.niveles?.lfc ? `${formato(diagnostico.niveles.lfc.presion, 0)} hPa` : 'sin LFC';
    const el = diagnostico?.niveles?.el ? `${formato(diagnostico.niveles.el.presion, 0)} hPa` : 'sin EL cerrado';
    const disparo = Number.isFinite(Number(diagnostico?.temperaturaDisparo)) ? ` · T disparo ${formato(diagnostico.temperaturaDisparo, 1)} °C` : '';
    estadoTexto.textContent = `Parcela superficial · CAPE ${formato(diagnostico?.cape, 0)} J/kg · CIN ${formato(diagnostico?.cin, 0)} J/kg · ${lfc} · ${el}${disparo}.`;
  }
}


function actualizarDiagnosticoMixing(mixing, pbl) {
  const categoria = $('mixingCategoria');
  if (!mixing) {
    if (categoria) { categoria.textContent = 'No disponible'; categoria.className = 'insignia insignia-mixing'; }
    if ($('perfilTempMezcla')) $('perfilTempMezcla').textContent = '—';
    if ($('perfilVientoPbl')) $('perfilVientoPbl').textContent = '—';
    if ($('perfilSequedadPbl')) $('perfilSequedadPbl').textContent = '—';
    if ($('diagnosticoMixing')) $('diagnosticoMixing').textContent = 'No hay suficientes datos para evaluar la mezcla descendente.';
    return;
  }
  if (categoria) {
    categoria.textContent = `${mixing.categoria} · ${mixing.puntos}/6`;
    categoria.className = `insignia insignia-mixing mixing-${mixing.clase}`;
  }
  $('perfilTempMezcla').textContent = `${formato(mixing.temperaturaMezcla, 1)} °C`;
  $('perfilTempMezclaDetalle').textContent = `T prevista ${formato(mixing.temperaturaSuperficie, 1)} °C · margen ${mixing.margenTemperatura >= 0 ? '+' : ''}${formato(mixing.margenTemperatura, 1)} °C`;
  if (mixing.vientoMaximo) {
    $('perfilVientoPbl').textContent = `${formato(mixing.vientoMaximo.velocidad * 3.6, 0)} km/h`;
    $('perfilVientoPblDetalle').textContent = `${rumbo(mixing.vientoMaximo.direccion)} · ${formato(mixing.vientoMaximo.alturaAgl, 0)} m AGL · exceso ${formato(mixing.excesoViento * 3.6, 0)} km/h`;
  } else {
    $('perfilVientoPbl').textContent = '—';
    $('perfilVientoPblDetalle').textContent = 'Sin viento válido dentro de la PBL';
  }
  $('perfilSequedadPbl').textContent = mixing.hrTecho == null ? '—' : `${formato(mixing.hrTecho, 0)} % HR`;
  $('perfilSequedadPblDetalle').textContent = mixing.depresionRocio == null
    ? `Techo PBL ${formato(pbl?.alturaAgl, 0)} m AGL`
    : `Depresión T−Td ${formato(mixing.depresionRocio, 1)} °C cerca del techo`;
  $('diagnosticoMixing').innerHTML = `<strong>Potencial ${escapar(mixing.categoria.toLowerCase())}:</strong> ${escapar(mixing.texto)}. La mezcla puede transportar hacia superficie parte del viento y del aire seco de la capa, pero no garantiza que llegue íntegramente.`;
}

function formatearNivelTermo(nivel, vacio = '—') {
  if (!nivel || !Number.isFinite(Number(nivel.presion))) return vacio;
  const altura = Number.isFinite(Number(nivel.alturaAgl)) ? ` · ${formato(nivel.alturaAgl, 0)} m AGL` : '';
  return `${formato(nivel.presion, 0)} hPa${altura}`;
}

function calcularHaines(perfil, indice, tipo) {
  const valor = (variable, nivel) => numeroSeguro(perfil.hourly[`${variable}_${nivel}hPa`]?.[indice]);
  const rocioNivel = nivel => {
    const directo = valor('dew_point', nivel);
    if (directo != null) return directo;
    const temperatura = valor('temperature', nivel);
    const humedad = valor('relative_humidity', nivel);
    return temperatura != null && humedad != null ? calcularPuntoRocio(temperatura, humedad) : null;
  };
  let estabilidad;
  let sequedad;
  let a;
  let b;

  if (tipo === 'bajo') {
    const t950 = valor('temperature', 950); const t850 = valor('temperature', 850); const td850 = rocioNivel(850);
    if ([t950, t850, td850].some(v => v == null)) return null;
    estabilidad = t950 - t850; sequedad = t850 - td850;
    a = estabilidad <= 3 ? 1 : estabilidad <= 7 ? 2 : 3;
    b = sequedad <= 5 ? 1 : sequedad <= 9 ? 2 : 3;
  } else if (tipo === 'medio') {
    const t850 = valor('temperature', 850); const t700 = valor('temperature', 700); const td850 = rocioNivel(850);
    if ([t850, t700, td850].some(v => v == null)) return null;
    estabilidad = t850 - t700; sequedad = t850 - td850;
    a = estabilidad <= 5 ? 1 : estabilidad <= 10 ? 2 : 3;
    b = sequedad <= 5 ? 1 : sequedad <= 12 ? 2 : 3;
  } else {
    const t700 = valor('temperature', 700); const t500 = valor('temperature', 500); const td700 = rocioNivel(700);
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


async function actualizarObservacionesActuales(lat, lon, datosModelo) {
  const referencia = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  if ($('estadoObservaciones')) $('estadoObservaciones').textContent = 'Buscando estaciones…';
  if ($('tablaObservaciones')) $('tablaObservaciones').innerHTML = '<tr><td colspan="10">Consultando archivo AEMET…</td></tr>';
  try {
    const respuesta = await fetch(`${CONFIG.archivoObservacionesAemet}?t=${Date.now()}`, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const archivo = await respuesta.json();
    const estaciones = Array.isArray(archivo.stations) ? archivo.stations : [];
    if (!estaciones.length) throw new Error('El archivo no contiene estaciones.');
    if (`${estado.punto.lat.toFixed(4)},${estado.punto.lon.toFixed(4)}` !== referencia) return;

    const ordenadas = estaciones
      .map(estacion => ({ ...estacion, distancia: distanciaKm(lat, lon, estacion.lat, estacion.lon) }))
      .filter(estacion => Number.isFinite(estacion.distancia))
      .sort((a, b) => a.distancia - b.distancia);
    estado.observaciones = ordenadas;
    renderizarObservaciones(ordenadas, datosModelo, archivo.generated_at);
  } catch (error) {
    console.warn('Observaciones AEMET no disponibles:', error);
    if (`${estado.punto.lat.toFixed(4)},${estado.punto.lon.toFixed(4)}` !== referencia) return;
    estado.observaciones = null;
    renderizarFallbackModelo(datosModelo, 'No se ha encontrado el archivo actualizado de observaciones AEMET.');
  }
}

function renderizarObservaciones(estaciones, datosModelo, generado) {
  const cercanas = estaciones.slice(0, 3);
  const principal = cercanas[0];
  if (!principal) {
    renderizarFallbackModelo(datosModelo, 'No hay estaciones AEMET con datos recientes.');
    return;
  }
  const cercana = principal.distancia <= CONFIG.umbralEstacionCercanaKm;
  const util = principal.distancia <= CONFIG.umbralEstacionUtilKm;
  const diferenciaAltitud = numeroSeguro(principal.alt) != null && numeroSeguro(estado.datos?.elevation) != null
    ? Number(principal.alt) - Number(estado.datos.elevation)
    : null;
  const dpv = calcularDpvDesdeTempHr(principal.temp, principal.rh);
  const viento = numeroSeguro(principal.wind_speed);
  const racha = numeroSeguro(principal.gust);
  const direccion = numeroSeguro(principal.wind_direction);

  $('obsNombre').textContent = principal.name || principal.id || 'Estación AEMET';
  $('obsDistancia').textContent = `${formato(principal.distancia, 1)} km · ${formato(principal.alt, 0)} m s.n.m.${diferenciaAltitud == null ? '' : ` · Δalt ${diferenciaAltitud >= 0 ? '+' : ''}${formato(diferenciaAltitud, 0)} m`}`;
  $('obsTempHr').textContent = `${formato(principal.temp, 1)} °C · ${formato(principal.rh, 0)} %`;
  $('obsRocio').textContent = `Punto de rocío: ${formato(principal.dewpoint, 1)} °C`;
  $('obsViento').textContent = viento == null ? '—' : `${formato(viento * 3.6, 0)} km/h${racha == null ? '' : ` · racha ${formato(racha * 3.6, 0)}`}`;
  $('obsDireccion').textContent = direccion == null ? 'Dirección no disponible' : `De ${rumbo(direccion)} (${formato(direccion, 0)}°)`;
  $('obsDpv').textContent = dpv == null ? '—' : `${formato(dpv, 2)} kPa`;
  $('obsHora').textContent = principal.time ? `Observación: ${formatearHoraObservacion(principal.time)}` : 'Hora no disponible';

  const estadoObs = $('estadoObservaciones');
  if (estadoObs) {
    estadoObs.textContent = cercana ? `AEMET · ${formato(principal.distancia, 1)} km` : util ? `AEMET distante · ${formato(principal.distancia, 1)} km` : `Sin estación representativa`;
    estadoObs.className = `insignia insignia-observaciones ${cercana ? 'obs-cercana' : util ? 'obs-distante' : 'obs-no-representativa'}`;
  }

  $('tablaObservaciones').innerHTML = cercanas.map(estacion => {
    const dpvEst = calcularDpvDesdeTempHr(estacion.temp, estacion.rh);
    const dir = numeroSeguro(estacion.wind_direction);
    const vel = numeroSeguro(estacion.wind_speed);
    const gust = numeroSeguro(estacion.gust);
    return `<tr>
      <td><strong>${escapar(estacion.name || estacion.id || 'AEMET')}</strong><small>${escapar(estacion.id || '')}</small></td>
      <td>${formato(estacion.distancia, 1)} km</td>
      <td>${formato(estacion.alt, 0)} m</td>
      <td>${estacion.time ? escapar(formatearHoraObservacion(estacion.time)) : '—'}</td>
      <td>${formato(estacion.temp, 1)} °C</td>
      <td>${formato(estacion.rh, 0)} %</td>
      <td>${formato(estacion.dewpoint, 1)} °C</td>
      <td>${vel == null ? '—' : `${formato(vel * 3.6, 0)} km/h ${dir == null ? '' : rumbo(dir)}`}</td>
      <td>${gust == null ? '—' : `${formato(gust * 3.6, 0)} km/h`}</td>
      <td>${dpvEst == null ? '—' : `${formato(dpvEst, 2)} kPa`}</td>
    </tr>`;
  }).join('');

  const aviso = $('fallbackObservaciones');
  if (aviso) {
    if (cercana) {
      aviso.hidden = true;
    } else {
      aviso.hidden = false;
      aviso.innerHTML = `<strong>${util ? 'Estación distante:' : 'Sin estación cercana representativa:'}</strong> la más próxima está a ${formato(principal.distancia, 1)} km. ${textoModeloActual(datosModelo)}${generado ? ` Archivo AEMET generado ${escapar(formatearHoraObservacion(generado))}.` : ''}`;
    }
  }
}

function renderizarFallbackModelo(datosModelo, motivo) {
  const actual = datosModelo?.current || {};
  const dpv = calcularDpvDesdeTempHr(actual.temperature_2m, actual.relative_humidity_2m);
  $('obsNombre').textContent = 'Estimación en el punto';
  $('obsDistancia').textContent = 'No es una observación de estación';
  $('obsTempHr').textContent = `${formato(actual.temperature_2m, 1)} °C · ${formato(actual.relative_humidity_2m, 0)} %`;
  $('obsRocio').textContent = `Punto de rocío: ${formato(actual.dew_point_2m, 1)} °C`;
  $('obsViento').textContent = `${formato(actual.wind_speed_10m, 0)} km/h · racha ${formato(actual.wind_gusts_10m, 0)} km/h`;
  $('obsDireccion').textContent = `De ${rumbo(actual.wind_direction_10m)}`;
  $('obsDpv').textContent = dpv == null ? '—' : `${formato(dpv, 2)} kPa`;
  $('obsHora').textContent = actual.time ? `Modelo: ${formatearFechaHora(actual.time)}` : 'Modelo actual';
  $('tablaObservaciones').innerHTML = '<tr><td colspan="10">No hay datos locales de estación cargados. La tarjeta superior muestra una estimación del modelo en el punto.</td></tr>';
  const estadoObs = $('estadoObservaciones');
  if (estadoObs) { estadoObs.textContent = 'Estimación de modelo'; estadoObs.className = 'insignia insignia-observaciones obs-modelo'; }
  const aviso = $('fallbackObservaciones');
  if (aviso) { aviso.hidden = false; aviso.innerHTML = `<strong>${escapar(motivo)}</strong> ${textoModeloActual(datosModelo)}`; }
}

function textoModeloActual(datosModelo) {
  const actual = datosModelo?.current;
  if (!actual) return 'Tampoco se dispone de una estimación actual para el punto.';
  return `Como referencia no observada, el modelo estima ${formato(actual.temperature_2m, 1)} °C, HR ${formato(actual.relative_humidity_2m, 0)} %, viento ${formato(actual.wind_speed_10m, 0)} km/h de ${rumbo(actual.wind_direction_10m)}.`;
}

function distanciaKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(v => Number.isFinite(Number(v)))) return NaN;
  const rad = valor => Number(valor) * Math.PI / 180;
  const dLat = rad(Number(lat2) - Number(lat1));
  const dLon = rad(Number(lon2) - Number(lon1));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcularDpvDesdeTempHr(temperatura, humedad) {
  if (![temperatura, humedad].every(v => Number.isFinite(Number(v)))) return null;
  const es = 0.6108 * Math.exp((17.27 * Number(temperatura)) / (Number(temperatura) + 237.3));
  return es * (1 - Math.max(0, Math.min(100, Number(humedad))) / 100);
}

function formatearHoraObservacion(valor) {
  if (!valor) return '—';
  const texto = String(valor);
  const normalizado = /Z$|[+-]\d\d:?\d\d$/.test(texto) ? texto : `${texto}Z`;
  const fecha = new Date(normalizado);
  if (Number.isNaN(fecha.getTime())) return texto;
  return fecha.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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
