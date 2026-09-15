import { PDFParse } from 'pdf-parse';
import { normalizarRut } from './asistenciaXls';

export { normalizarRut };

// El sistema de marcaje (Workera) dejó de exportar el "Reporte de asistencia
// simplificado" como .xls y ahora lo exporta como PDF (una página por
// trabajador, dentro del mismo período). Este archivo reemplaza a
// lib/asistenciaXls.js para ese caso: en vez de leer celdas de una planilla,
// lee el texto plano del PDF (que conserva el mismo orden de lectura por
// fila/columna que tenía el Excel) y busca las mismas secciones ancla.

// El total del período (RESUMEN GENERAL) usa formato "H:MM:SS".
function textoHorasAMinutos(texto) {
  if (texto == null || texto === '') return 0;
  const partes = texto.toString().split(':').map(Number);
  if (partes.some((p) => Number.isNaN(p))) return 0;
  const [h, m, s] = partes.length === 3 ? partes : [0, partes[0] || 0, partes[1] || 0];
  return Math.floor(h * 60 + m + (s || 0) / 60);
}

// Las horas de cada fila de día (entrada, salida, atraso, etc.) usan
// formato "H:MM" (horas:minutos) — a diferencia del total de arriba, que es
// "H:MM:SS". Confundir los dos formatos hace que, por ejemplo, "2:00" (2
// horas de atraso) se lea como "2 minutos" en vez de 120.
function textoHoraMinutoDia(texto) {
  if (texto == null || texto === '') return 0;
  const [h, m] = texto.toString().split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function minutosDelDia(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

const CANTIDAD_ETIQUETAS = [
  'Nº atrasos',
  'Nº salidas anticipadas',
  'Nº inasistencias',
  'Días c/licencia médica',
  'Nº ausencias parciales',
];

// Busca, dentro del texto, un grupo de etiquetas conocidas seguido
// inmediatamente por sus valores en el mismo orden (así es como el PDF deja
// las tablas "CANTIDAD"/"RESULTADO": todas las etiquetas primero, todos los
// valores después, porque la extracción de texto lee columna por columna).
function extraerBloqueEtiquetas(texto, iniMarker, etiquetas, finMarker) {
  const idxIni = texto.indexOf(iniMarker);
  if (idxIni === -1) return null;
  let idxFin = finMarker ? texto.indexOf(finMarker, idxIni) : texto.length;
  if (idxFin === -1) idxFin = texto.length;
  const seccion = texto.slice(idxIni, idxFin);
  const lineas = seccion.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const idxUltimaEtiqueta = lineas.lastIndexOf(etiquetas[etiquetas.length - 1]);
  if (idxUltimaEtiqueta === -1) return null;
  const valores = lineas.slice(idxUltimaEtiqueta + 1, idxUltimaEtiqueta + 1 + etiquetas.length);
  if (valores.length < etiquetas.length) return null;
  const resultado = {};
  etiquetas.forEach((et, i) => {
    resultado[et] = valores[i];
  });
  return resultado;
}

// Toma las primeras `cantidad` líneas no vacías que vienen después de un
// marcador (ej. los 5 valores de "RESUMEN GENERAL": Asistencia, Jornada,
// Ausencia, Atraso, Salida anticipada — en ese orden fijo).
function valoresTrasMarcador(texto, marcador, cantidad, marcadorFin) {
  const idx = texto.indexOf(marcador);
  if (idx === -1) return null;
  let idxFin = marcadorFin ? texto.indexOf(marcadorFin, idx) : texto.length;
  if (idxFin === -1) idxFin = texto.length;
  const seccion = texto.slice(idx + marcador.length, idxFin);
  const lineas = seccion.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length < cantidad) return null;
  return lineas.slice(0, cantidad);
}

const DIA_RE = /^(lun|mar|mié|jue|vie|sáb|dom)\s+(\d{2})\/(\d{2})\s*(.*)$/;
const EVENTOS_NO_INASISTENCIA_RE = /\bVACACION\b|\bLIC\.MED\.\b/;
const HORA_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

// Detalle día por día — best-effort (igual de aproximado que el que se usaba
// con el Excel, ver lib/asistenciaXls.js): el PDF no deja marcada una celda
// vacía como el Excel sí hacía, así que cuando un trabajador no marcó
// entrada un día, la fila se corre una posición y hay que inferirlo por el
// valor en vez de por la columna exacta. El número oficial de inasistencias
// y atrasos del período sigue siendo el de las secciones CANTIDAD/RESUMEN
// GENERAL (ver extraerResumenBloque) — esto solo arma el detalle día a día,
// y en algún caso raro (atraso y salida anticipada el mismo día) puede
// confundir cuál de los dos valores es cuál.
function extraerDetalleDias(bloque, periodoDesdeISO, periodoHastaISO) {
  const idxIni = bloque.search(/Código:\s*\d+/);
  const idxFin = bloque.indexOf('RESUMEN GENERAL');
  if (idxIni === -1 || idxFin === -1) return [];
  const seccion = bloque.slice(idxIni, idxFin);
  const lineasCrudas = seccion.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const anioBase = Number(periodoDesdeISO.slice(0, 4));

  // Agrupa cada línea de día con sus líneas de continuación (mismo día sin
  // fecha al inicio — ej. un evento especial como VACACION en una línea aparte).
  const grupos = [];
  let actual = null;
  for (const linea of lineasCrudas) {
    if (/^Resumen: Semana/.test(linea) || /^El cálculo de asistencia/.test(linea)) continue;
    const m = linea.match(DIA_RE);
    if (m) {
      actual = { dd: m[2], mm: m[3], texto: [m[4] || ''] };
      grupos.push(actual);
    } else if (actual) {
      actual.texto.push(linea);
    }
  }

  const esHorarioMediodia = (h) => {
    const min = minutosDelDia(h);
    return min >= 12 * 60 && min <= 16 * 60 + 30;
  };

  const detalle = [];
  for (const g of grupos) {
    const textoCompleto = g.texto.join(' ').trim();
    if (!textoCompleto || /\bLIBRE\b/.test(textoCompleto)) continue;

    let fechaISO = null;
    for (const anio of [anioBase, anioBase + 1, anioBase - 1]) {
      const candidata = `${anio}-${g.mm}-${g.dd}`;
      if (candidata >= periodoDesdeISO && candidata <= periodoHastaISO) {
        fechaISO = candidata;
        break;
      }
    }
    if (!fechaISO) continue;

    if (EVENTOS_NO_INASISTENCIA_RE.test(textoCompleto)) continue; // día justificado (vacaciones/licencia)

    const horas = textoCompleto.match(HORA_RE) || [];
    if (horas.length === 0) continue; // sin datos de horario ese día

    // La entrada real es el 3er valor de tiempo de la fila (tras entrada y
    // salida asignadas). Si en esa posición hay una hora de mediodía en
    // adelante en vez de una hora de la mañana, es porque no hubo marcación
    // de entrada ese día y todo se corrió una posición — inasistencia.
    const entradaReal = horas[2];
    const entradaPresente = entradaReal != null && minutosDelDia(entradaReal) < 12 * 60;

    if (!entradaPresente) {
      detalle.push({ fecha: fechaISO, atraso_minutos: 0, inasistencia: true });
      continue;
    }

    // Con la entrada presente, la fila trae: entrada y salida asignadas (2),
    // entrada real (1), descanso si el turno lo tiene (2), salida real (1) y
    // las 3 métricas de cierre (asignado/asistencia/jornada real) = 9 horas
    // con descanso, 7 sin descanso (turnos cortos, ej. viernes). Cualquier
    // hora extra más allá de esa base es el atraso (o la salida anticipada)
    // del día.
    const tieneDescanso =
      horas.length >= 5 &&
      esHorarioMediodia(horas[3]) &&
      esHorarioMediodia(horas[4]) &&
      Math.abs(minutosDelDia(horas[4]) - minutosDelDia(horas[3])) <= 120;
    const extra = horas.length - (tieneDescanso ? 9 : 7);

    if (extra > 0) {
      const atrasoMinutos = textoHoraMinutoDia(horas[horas.length - 1]);
      if (atrasoMinutos > 0) {
        detalle.push({ fecha: fechaISO, atraso_minutos: atrasoMinutos, inasistencia: false });
      }
    }
  }
  return detalle;
}

function extraerResumenBloque(bloque) {
  const mRut = bloque.match(/Trabajador RUT:\s*([\d.]+-[\dkK])\s*Nombre:\s*([^\r\n]+)/);
  const mPeriodo = bloque.match(
    /Periodo desde\s+(\d{2})\/(\d{2})\/(\d{4})\s+hasta\s+(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (!mRut) {
    return { ok: false, rut: null, motivo: 'No se encontró el RUT del trabajador en la página.' };
  }
  if (!mPeriodo) {
    return { ok: false, rut: mRut[1], motivo: 'No se encontró el período (fechas) en la página.' };
  }

  const rut = mRut[1];
  const nombre = mRut[2].trim();
  const periodoDesde = `${mPeriodo[3]}-${mPeriodo[2]}-${mPeriodo[1]}`;
  const periodoHasta = `${mPeriodo[6]}-${mPeriodo[5]}-${mPeriodo[4]}`;

  const resumenGeneral = valoresTrasMarcador(bloque, 'RESUMEN GENERAL', 5, 'T. SALIDAS ESPECIALES');
  const cantidad = extraerBloqueEtiquetas(bloque, 'CANTIDAD', CANTIDAD_ETIQUETAS, 'RESULTADO');

  if (!resumenGeneral || !cantidad) {
    return {
      ok: false,
      rut,
      nombre,
      motivo: 'La página no trae un resumen de asistencia (el trabajador no tenía marcaje válido en el período).',
    };
  }

  // Orden fijo de "RESUMEN GENERAL": Asistencia, Jornada, Ausencia, Atraso,
  // Salida anticipada — el total de atraso del período es el 4° valor.
  const atrasoMinutos = textoHorasAMinutos(resumenGeneral[3]);
  const detalleDias = extraerDetalleDias(bloque, periodoDesde, periodoHasta);
  const fechasInasistencia = detalleDias.filter((d) => d.inasistencia).map((d) => d.fecha);

  return {
    ok: true,
    rut,
    nombre,
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,
    dias_inasistencia: Number(cantidad['Nº inasistencias']) || 0,
    atraso_minutos: atrasoMinutos,
    cantidad_atrasos: Number(cantidad['Nº atrasos']) || 0,
    salidas_anticipadas_cantidad: Number(cantidad['Nº salidas anticipadas']) || 0,
    dias_licencia_medica: Number(cantidad['Días c/licencia médica']) || 0,
    fechas_inasistencia: fechasInasistencia,
    detalle_dias: detalleDias,
  };
}

// El PDF trae una página por trabajador, cada una empezando con "Planilla de
// asistencia". Se corta ahí en vez de por salto de página real del PDF, para
// no depender de cómo cada extractor de texto marque el fin de página.
export function parseAsistenciaPdfTexto(textoCompleto) {
  const bloques = textoCompleto
    .split(/(?=Planilla de asistencia)/)
    .map((b) => b.trim())
    .filter(Boolean);
  return bloques.map((bloque, i) => ({ hoja: `Página ${i + 1}`, ...extraerResumenBloque(bloque) }));
}

// Recibe el archivo .pdf del "Reporte de asistencia simplificado" (un
// buffer) y devuelve el mismo formato de resultado que
// lib/asistenciaXls.js#parseAsistenciaXls, para que la ruta que lo recibe
// no tenga que distinguir entre los dos formatos más que al elegir cuál
// función llamar.
export async function parseAsistenciaPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    return parseAsistenciaPdfTexto(text);
  } finally {
    await parser.destroy();
  }
}
