import * as XLSX from 'xlsx';

// Quita puntos, guiones y espacios de un RUT para poder comparar
// "19.228.079-6" con "192280796" o cualquier variante de formato.
export function normalizarRut(rut) {
  return (rut || '').toString().toUpperCase().replace(/[.\-\s]/g, '');
}

function aFechaISO(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Convierte un texto "H:MM:SS" (o "HH:MM:SS") a minutos totales (redondeado
// hacia abajo). Estos son los tiempos "Atraso" / "Ausencia" que ya trae
// calculados el reporte del sistema de marcaje.
function textoHorasAMinutos(texto) {
  if (texto == null || texto === '') return 0;
  const partes = texto.toString().split(':').map(Number);
  if (partes.some((p) => Number.isNaN(p))) return 0;
  const [h, m, s] = partes.length === 3 ? partes : [0, partes[0] || 0, partes[1] || 0];
  return Math.floor(h * 60 + m + (s || 0) / 60);
}

const DIA_LABEL_RE = /^[a-záéíóúñ]{3}\s+(\d{2})\/(\d{2})$/i;

// Códigos de "Tipo evento" que explican por qué un día no tiene marcación
// real sin que sea una inasistencia (vacaciones, licencia médica). El resto
// de los códigos ("J.NORMAL", "S.N.T", etc.) sí pueden ser inasistencia si
// el día tenía horario asignado y no hay horas de asistencia real.
const EVENTOS_NO_INASISTENCIA = new Set(['VACACION', 'LIC.MED.', 'LIBRE']);

function horasATexto(valor) {
  if (valor == null || valor === '') return true; // sin valor = sin horas trabajadas
  const texto = valor.toString().trim();
  return texto === '' || /^0(:00)*$/.test(texto);
}

// Recorre las filas de días (una por cada día del período, con una fila de
// continuación debajo cuando el día tuvo un evento especial como vacaciones
// o licencia) y devuelve las fechas (ISO) que parecen inasistencia: días
// con horario asignado (columna "Asignado"), sin horas de asistencia real,
// y cuyo evento del día no es vacaciones/licencia/libre. Esto es una
// aproximación (best-effort) que solo se usa como respaldo para cruzar con
// las vacaciones aprobadas en la app — el número oficial de inasistencias
// sigue siendo el que trae el propio resumen del archivo.
function extraerFechasInasistencia(filas, periodoDesdeISO, periodoHastaISO) {
  if (!periodoDesdeISO) return [];
  const anioBase = Number(periodoDesdeISO.slice(0, 4));
  const fechas = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || typeof fila[0] !== 'string') continue;
    const match = fila[0].trim().match(DIA_LABEL_RE);
    if (!match) continue;

    const [, dd, mm] = match;
    let fechaISO = null;
    for (const anio of [anioBase, anioBase + 1, anioBase - 1]) {
      const candidata = `${anio}-${mm}-${dd}`;
      if (candidata >= periodoDesdeISO && candidata <= (periodoHastaISO || periodoDesdeISO)) {
        fechaISO = candidata;
        break;
      }
    }
    if (!fechaISO) continue;

    // Fila(s) de continuación del mismo día (sin etiqueta en la columna 0)
    // con el evento especial aplicado ese día, si lo hubo.
    let eventoEspecial = null;
    let j = i + 1;
    while (j < filas.length && filas[j] && filas[j][0] == null) {
      if (typeof filas[j][20] === 'string') eventoEspecial = filas[j][20].trim();
      j++;
    }

    if (eventoEspecial && EVENTOS_NO_INASISTENCIA.has(eventoEspecial)) continue;

    const asignado = fila[7];
    const asistencia = fila[8];
    if (asignado != null && asignado !== '' && horasATexto(asistencia)) {
      fechas.push(fechaISO);
    }
  }

  return fechas;
}

/**
 * Recorre una hoja (matriz de filas x columnas) buscando las celdas ancla
 * del template del "Reporte de asistencia simplificado" en vez de asumir
 * filas fijas, porque la cantidad de semanas del bloque RESUMEN GENERAL
 * varía según el mes y si hubo vacaciones/licencias en medio.
 */
function extraerResumenHoja(filas) {
  let rut = null;
  let periodoDesde = null;
  let periodoHasta = null;
  let tieneResumenGeneral = false;
  const resumen = {
    dias_inasistencia: 0,
    atraso_minutos: 0,
    cantidad_atrasos: 0,
    salidas_anticipadas_cantidad: 0,
    dias_licencia_medica: 0,
  };

  for (const fila of filas) {
    if (!fila) continue;

    if (typeof fila[0] === 'string' && fila[0].trim() === 'RUT:' && !rut) {
      rut = fila[1] ? fila[1].toString().trim() : null;
    }

    if (!periodoDesde) {
      const idxPeriodo = fila.findIndex((c) => typeof c === 'string' && c.trim() === 'Periodo desde');
      if (idxPeriodo !== -1) {
        // Las columnas exactas varían según la hoja (algunas traen menos
        // columnas de detalle diario), así que se toman las dos primeras
        // fechas que aparezcan después de la etiqueta "Periodo desde", en
        // vez de asumir posiciones fijas.
        const fechas = fila.slice(idxPeriodo + 1).filter((c) => c instanceof Date);
        periodoDesde = aFechaISO(fechas[0]);
        periodoHasta = aFechaISO(fechas[1]);
      }
    }

    // Columna 0/4: "Asistencia", "Jornada", "Ausencia", "Atraso", "Salida
    // anticipada" con su tiempo total en la columna 4.
    if (typeof fila[0] === 'string' && fila[0].trim() === 'Atraso') {
      resumen.atraso_minutos = textoHorasAMinutos(fila[4]);
      tieneResumenGeneral = true;
    }

    // Columna 10/15: "Nº atrasos", "Nº salidas anticipadas", "Nº
    // inasistencias", "Días c/licencia médica" con su cantidad en la
    // columna 15.
    if (typeof fila[10] === 'string') {
      const etiqueta = fila[10].trim();
      const valor = Number(fila[15]);
      if (etiqueta === 'Nº inasistencias' && !Number.isNaN(valor)) {
        resumen.dias_inasistencia = valor;
      } else if (etiqueta === 'Nº atrasos' && !Number.isNaN(valor)) {
        resumen.cantidad_atrasos = valor;
      } else if (etiqueta === 'Nº salidas anticipadas' && !Number.isNaN(valor)) {
        resumen.salidas_anticipadas_cantidad = valor;
      } else if (etiqueta === 'Días c/licencia médica' && !Number.isNaN(valor)) {
        resumen.dias_licencia_medica = valor;
      }
    }
  }

  if (!rut || !periodoDesde || !periodoHasta) {
    return { ok: false, rut, motivo: 'No se encontraron los datos básicos (RUT o período) en la hoja.' };
  }
  if (!tieneResumenGeneral) {
    // La hoja existe (tiene RUT y período) pero el sistema de marcaje no
    // generó un resumen para ella — típicamente porque el trabajador no
    // tenía un contrato válido en ese período, o no le corresponde marcar.
    // No se guarda nada para no mostrar "0 inasistencias" como si tuviera
    // asistencia perfecta cuando en realidad no hay datos.
    return {
      ok: false,
      rut,
      motivo: 'La hoja no trae un resumen de asistencia (el trabajador no tenía marcaje válido en el período).',
    };
  }
  const fechasInasistencia = extraerFechasInasistencia(filas, periodoDesde, periodoHasta);

  return {
    ok: true,
    rut,
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,
    fechas_inasistencia: fechasInasistencia,
    ...resumen,
  };
}

/**
 * Recibe el archivo .xls/.xlsx del "Reporte de asistencia simplificado"
 * (un buffer) y devuelve un resumen por hoja/trabajador. Cada hoja del
 * archivo corresponde a un trabajador dentro del mismo período.
 */
export function parseAsistenciaXls(buffer) {
  const libro = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const resultados = [];
  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null });
    const resumen = extraerResumenHoja(filas);
    resultados.push({ hoja: nombreHoja, ...resumen });
  }
  return resultados;
}
