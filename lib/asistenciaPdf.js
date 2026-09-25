// Importa el archivo interno directamente (no el punto de entrada
// "pdf-parse") a propósito: el index.js del paquete trae un bloque de
// autotest ("if (!module.parent) { ... }") pensado para cuando se corre el
// paquete solo, pero en algunos entornos empaquetados (Next.js/Vercel
// incluido) ese chequeo se confunde y el autotest se ejecuta igual,
// tirando abajo la función con un error de archivo no encontrado. Importar
// lib/pdf-parse.js se salta ese bloque por completo.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { normalizarRut } from './asistenciaXls';

export { normalizarRut };

// El sistema de marcaje (Workera) dejó de exportar el "Reporte de asistencia
// simplificado" como .xls y ahora lo exporta como PDF (una página por
// trabajador, dentro del mismo período). Este archivo reemplaza a
// lib/asistenciaXls.js para ese caso.
//
// A diferencia de la primera versión de este archivo, acá NO se usa el texto
// plano que arma pdf-parse por defecto: en el PDF real que exporta Workera,
// el orden en que vienen las "letras" dentro del archivo (el "orden de
// stream") no respeta el orden visual de lectura, y pdf-parse por defecto
// además no separa con espacio los textos que están en la misma fila. Eso
// hacía que ni el RUT/período se pudieran leer de forma confiable.
//
// En vez de eso, se usa el "hook" pagerender de pdf-parse para tomar,
// página por página, los ítems de texto CON sus coordenadas (x,y) que da
// pdf.js directamente, y reconstruir la tabla a mano:
//   - juntar ítems en la misma fila por Y (con una tolerancia chica),
//   - ordenar cada fila por X para tener el orden de lectura real,
//   - para los totales de "RESUMEN GENERAL"/"CANTIDAD" (que en el PDF son
//     columnas una al lado de la otra, compartiendo las mismas filas Y),
//     buscar el valor más cercano a la derecha de cada etiqueta exacta,
//   - para la grilla de días, agrupar cada fila de datos con la etiqueta de
//     día (ej. "jue 27/08") cuya Y esté más cerca — en vez de con la que
//     aparece primero en el texto — porque cuando un día tiene un evento
//     especial (ej. mitad de jornada + VACACION) su etiqueta queda
//     verticalmente centrada ENTRE sus dos filas de datos, y con el texto
//     plano esa primera fila de datos se pegaba por error al día anterior.

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

// Agrupa ítems de texto de pdf.js en "filas" según su coordenada Y (con
// tolerancia, porque dos textos de la misma fila casi nunca comparten
// exactamente el mismo Y). Devuelve las filas ordenadas de arriba hacia
// abajo (Y descendente, que es como pdf.js mide Y).
function agruparPorFila(items, tolY) {
  const filas = [];
  for (const it of items) {
    const y = it.transform[5];
    let fila = filas.find((f) => Math.abs(f.y - y) < tolY);
    if (!fila) {
      fila = { y, items: [] };
      filas.push(fila);
    }
    fila.items.push(it);
  }
  filas.sort((a, b) => b.y - a.y);
  return filas;
}

// Ordena los ítems de una fila por X (orden de lectura izquierda-derecha) y
// los une en una sola línea de texto, agregando un espacio cuando hay un
// salto notorio entre el fin de un ítem y el comienzo del siguiente.
function lineaDeFila(fila) {
  const ordenados = fila.items.slice().sort((a, b) => a.transform[4] - b.transform[4]);
  let linea = '';
  let finAnterior = null;
  for (const it of ordenados) {
    const x = it.transform[4];
    if (finAnterior != null && x - finAnterior > 1) linea += ' ';
    linea += it.str;
    finAnterior = x + (it.width || 0);
  }
  return linea.trim();
}

// Busca el ítem cuyo texto es exactamente `labelStr` y devuelve el texto del
// ítem más cercano a su derecha en la misma fila (mismo Y, con tolerancia) —
// así se lee cada columna de "RESUMEN GENERAL"/"CANTIDAD" sin mezclarla con
// las columnas vecinas que comparten esas mismas filas Y.
// `yTecho`, si se da, descarta etiquetas que estén más arriba en la página
// (Y mayor) que ese límite — necesario porque "Atraso" también es el
// encabezado de una columna en la grilla de días, más arriba en la página.
function valorALaDerecha(items, labelStr, yTecho) {
  const label = items.find(
    (it) => it.str.trim() === labelStr && (yTecho == null || it.transform[5] < yTecho)
  );
  if (!label) return null;
  const y = label.transform[5];
  const x = label.transform[4];
  let mejor = null;
  for (const it of items) {
    if (it === label) continue;
    if (Math.abs(it.transform[5] - y) > 2) continue;
    if (it.transform[4] <= x) continue;
    if (!mejor || it.transform[4] < mejor.transform[4]) mejor = it;
  }
  return mejor ? mejor.str.trim() : null;
}

const DIA_LABEL_RE = /^(lun|mar|mié|jue|vie|sáb|dom)\s+(\d{2})\/(\d{2})$/;
const HORA_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const EVENTOS_NO_INASISTENCIA_RE = /\bVACACION\b|\bLIC\.?\s*MED\.?\b/i;

// Detalle día por día — best-effort (igual de aproximado que el que se usaba
// con el Excel, ver lib/asistenciaXls.js): el número oficial de
// inasistencias y atrasos del período sigue siendo el de las secciones
// CANTIDAD/RESUMEN GENERAL (ver extraerDatosPagina) — esto solo arma el
// detalle día a día para mostrarlo en el perfil y para el respaldo de
// vacaciones, y en algún caso raro (atraso y salida anticipada el mismo día,
// o una ausencia parcial de medio día) puede confundir cuál valor es cuál.
//
// `items` son TODOS los ítems de texto de la página; `codigoY` es el Y de
// "Código:" (techo de la grilla de días) y `resumenGeneralY` es el Y del
// título "RESUMEN GENERAL" (piso de la grilla).
function extraerDetalleDiasDesdeItems(items, codigoY, resumenGeneralY, periodoDesdeISO, periodoHastaISO) {
  const grilla = items.filter((it) => it.transform[5] < codigoY && it.transform[5] > resumenGeneralY);
  const filas = agruparPorFila(grilla, 2);

  const filasEtiquetadas = filas.map((f) => {
    const textos = f.items.map((it) => it.str.trim());
    const labelItem = f.items.find((it) => DIA_LABEL_RE.test(it.str.trim()));
    const esResumenSemana = textos.some((t) => /^Resumen: Semana/.test(t));
    const esCompensa = textos.some((t) => /^El cálculo de asistencia/.test(t));
    return { y: f.y, items: f.items, labelItem, esResumenSemana, esCompensa };
  });

  const labels = filasEtiquetadas.filter((f) => f.labelItem);
  const dataRows = filasEtiquetadas.filter((f) => !f.labelItem && !f.esResumenSemana && !f.esCompensa);
  if (labels.length === 0) return [];

  const anioBase = Number(periodoDesdeISO.slice(0, 4));

  // Cada día puede traer más de una "sub-fila" de datos (ej. medio turno +
  // VACACION el mismo día). Se arma primero un mapa día -> sus sub-filas,
  // asignando cada fila de datos a la etiqueta de día con el Y más cercano
  // (en vez de a la que aparece antes en el texto) — así una fila de datos
  // no se pega por error al día anterior cuando la etiqueta del día está
  // centrada entre sus dos sub-filas.
  const porDia = new Map(); // key: Y de la etiqueta
  for (const l of labels) {
    const m = l.labelItem.str.trim().match(DIA_LABEL_RE);
    let fechaISO = null;
    for (const anio of [anioBase, anioBase + 1, anioBase - 1]) {
      const candidata = `${anio}-${m[3]}-${m[2]}`;
      if (candidata >= periodoDesdeISO && candidata <= periodoHastaISO) {
        fechaISO = candidata;
        break;
      }
    }
    porDia.set(l.y, { fechaISO, subfilas: [{ items: l.items }] });
  }
  for (const row of dataRows) {
    let mejor = labels[0];
    for (const l of labels) {
      if (Math.abs(l.y - row.y) < Math.abs(mejor.y - row.y)) mejor = l;
    }
    porDia.get(mejor.y).subfilas.push({ items: row.items });
  }

  const detalle = [];
  for (const [, dia] of porDia) {
    if (!dia.fechaISO) continue;

    // De todas las sub-filas de este día, la "fila de trabajo real" es la
    // que tiene más tokens de hora (HORA_RE) — así se evita mezclar los
    // tokens de una sub-fila de VACACION/LIC.MED. con los del turno normal.
    let mejorHoras = [];
    let textoCompletoTodas = '';
    for (const sf of dia.subfilas) {
      textoCompletoTodas += ' ' + lineaDeFila(sf);
      // Los ítems de una misma fila no siempre vienen en orden de stream
      // izquierda-derecha — hay que ordenarlos por X antes de leer "la 3ra
      // hora es la entrada real", etc., porque esas posiciones asumen el
      // orden visual de las columnas.
      const ordenados = sf.items.slice().sort((a, b) => a.transform[4] - b.transform[4]);
      const toks = ordenados.map((it) => it.str.trim()).filter((t) => HORA_RE.test(t));
      if (toks.length > mejorHoras.length) mejorHoras = toks;
    }
    textoCompletoTodas = textoCompletoTodas.trim();

    if (/\bLIBRE\b/.test(textoCompletoTodas)) continue;
    if (EVENTOS_NO_INASISTENCIA_RE.test(textoCompletoTodas)) continue; // día justificado (vacaciones/licencia)
    if (mejorHoras.length === 0) continue; // sin datos de horario ese día

    const horas = mejorHoras;

    // La entrada real es el 3er valor de tiempo de la fila (tras entrada y
    // salida asignadas). Si en esa posición hay una hora de mediodía en
    // adelante en vez de una hora de la mañana, es porque no hubo marcación
    // de entrada ese día y todo se corrió una posición — inasistencia.
    const entradaReal = horas[2];
    const entradaPresente = entradaReal != null && minutosDelDia(entradaReal) < 12 * 60;

    if (!entradaPresente) {
      detalle.push({ fecha: dia.fechaISO, atraso_minutos: 0, inasistencia: true });
      continue;
    }

    // Con la entrada presente, la fila trae: entrada y salida asignadas (2),
    // entrada real (1), descanso si el turno lo tiene (2), salida real (1) y
    // las 3 métricas de cierre (asignado/asistencia/jornada real) = 9 horas
    // con descanso, 7 sin descanso (turnos cortos, ej. viernes). Cualquier
    // hora extra más allá de esa base es el atraso (o la salida anticipada)
    // del día.
    const esHorarioMediodia = (h) => {
      const min = minutosDelDia(h);
      return min >= 12 * 60 && min <= 16 * 60 + 30;
    };
    const tieneDescanso =
      horas.length >= 5 &&
      esHorarioMediodia(horas[3]) &&
      esHorarioMediodia(horas[4]) &&
      Math.abs(minutosDelDia(horas[4]) - minutosDelDia(horas[3])) <= 120;
    const extra = horas.length - (tieneDescanso ? 9 : 7);

    if (extra > 0) {
      const atrasoMinutos = textoHoraMinutoDia(horas[horas.length - 1]);
      if (atrasoMinutos > 0) {
        detalle.push({ fecha: dia.fechaISO, atraso_minutos: atrasoMinutos, inasistencia: false });
      }
    }
  }
  return detalle;
}

// Procesa una página (un trabajador) a partir de sus ítems de texto crudos
// (con coordenadas) y arma el mismo resultado que antes daba
// extraerResumenBloque, pero leyendo directamente por posición en vez de
// por texto plano lineal.
function extraerDatosPagina(items) {
  const filasTexto = agruparPorFila(items, 2).map(lineaDeFila);
  const textoPlano = filasTexto.join('\n');

  // "Trabajador RUT: ... Código: ... Nombre: ..." — el orden real en el PDF
  // trae "Código:" ENTRE el RUT y el Nombre, por eso el ".*?" intermedio; el
  // Nombre siempre queda al final de esa fila.
  const mRut = textoPlano.match(/Trabajador RUT:\s*([\d.]+-[\dkK]).*?Nombre:\s*([^\r\n]+)/);
  const mPeriodo = textoPlano.match(
    /Periodo desde\s+(\d{2})\/(\d{2})\/(\d{4})\s+hasta\s+(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (!mRut) {
    return { ok: false, rut: null, motivo: 'No se encontró el RUT del trabajador en la página.' };
  }
  const rut = mRut[1];
  const nombre = mRut[2].trim();

  if (!mPeriodo) {
    return { ok: false, rut, nombre, motivo: 'No se encontró el período (fechas) en la página.' };
  }
  const periodoDesde = `${mPeriodo[3]}-${mPeriodo[2]}-${mPeriodo[1]}`;
  const periodoHasta = `${mPeriodo[6]}-${mPeriodo[5]}-${mPeriodo[4]}`;

  const codigoItem = items.find((it) => /^Código:/.test(it.str.trim()));
  const resumenGeneralItem = items.find((it) => it.str.trim() === 'RESUMEN GENERAL');
  if (!codigoItem || !resumenGeneralItem) {
    return {
      ok: false,
      rut,
      nombre,
      motivo: 'La página no trae un resumen de asistencia (el trabajador no tenía marcaje válido en el período).',
    };
  }
  const codigoY = codigoItem.transform[5];
  const resumenGeneralY = resumenGeneralItem.transform[5];

  const atrasoTxt = valorALaDerecha(items, 'Atraso', resumenGeneralY);
  const nAtrasosTxt = valorALaDerecha(items, 'Nº atrasos', resumenGeneralY);
  const nSalidasAntTxt = valorALaDerecha(items, 'Nº salidas anticipadas', resumenGeneralY);
  const nInasistTxt = valorALaDerecha(items, 'Nº inasistencias', resumenGeneralY);
  const nLicMedTxt = valorALaDerecha(items, 'Días c/licencia médica', resumenGeneralY);

  if (atrasoTxt == null || nInasistTxt == null) {
    return {
      ok: false,
      rut,
      nombre,
      motivo: 'La página no trae un resumen de asistencia (el trabajador no tenía marcaje válido en el período).',
    };
  }

  const atrasoMinutos = textoHorasAMinutos(atrasoTxt);
  const detalleDias = extraerDetalleDiasDesdeItems(items, codigoY, resumenGeneralY, periodoDesde, periodoHasta);
  const fechasInasistencia = detalleDias.filter((d) => d.inasistencia).map((d) => d.fecha);

  return {
    ok: true,
    rut,
    nombre,
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,
    dias_inasistencia: Number(nInasistTxt) || 0,
    atraso_minutos: atrasoMinutos,
    cantidad_atrasos: Number(nAtrasosTxt) || 0,
    salidas_anticipadas_cantidad: Number(nSalidasAntTxt) || 0,
    dias_licencia_medica: Number(nLicMedTxt) || 0,
    fechas_inasistencia: fechasInasistencia,
    detalle_dias: detalleDias,
  };
}

// --- Formato nuevo: "REPORTE DE ASISTENCIA Y JORNADA" -----------------------
//
// El sistema de marcaje agregó (o pasó a usar) un reporte distinto al
// "simplificado" de arriba — mismo sistema, pero con otra estructura: en vez
// de "Trabajador RUT:" trae "Identificacion:", y en vez de un resumen con
// "RESUMEN GENERAL" trae, día por día, una fila con horario pactado/real,
// atraso, ausencia, exceso de jornada, un flag "Inasis." (0/1) y — lo más
// valioso — una columna "Tipo de Justificacion" con el motivo ya escrito por
// el propio sistema (ej. "VACACIONES", "P. CON GOCE DE S", "LICENCIA
// MATERNA", "IN.NO JUSTIFICADA"). Cada trabajador ocupa DOS páginas: la de
// datos (con todo lo anterior) y una "Totales Generales" aparte — esta
// función ignora la de totales, porque todo lo que hace falta ya está en la
// página de datos (no hace falta cruzar páginas).
//
// Layout de columnas (coordenadas X reales del PDF, con tolerancia ±10):
// Fecha=8, HorarioPactado Entrada/Salida=71/110, HorarioReal Entrada/
// Salida=145/181 (con "@" al inicio si la marcación fue manual), H.Colación
// Entrada/Salida=216/255, Trab.Ord.=288, Atraso=325, Ausencia=358,
// Exceso J.=394, H.Ex.Aut.=430, Tot.H.Tra.=467, Inasis.=512, Tipo de
// Justificacion=540 en adelante. Cada fila de día es UN solo Y (a diferencia
// del formato viejo, acá no hay sub-filas que desambiguar).
const IDENTIFICACION_RE = /^Identificacion:\s*([\d]+-[\dkK])/i;
const NOMBRE_NUEVO_RE = /^Nombre:(.*)$/i;
const PERIODO_NUEVO_RE = /Periodo desde el\s+(\d{2})\/(\d{2})\/(\d{4})\s+Hasta\s+(\d{2})\/(\d{2})\/(\d{4})/i;
const DIA_ROW_NUEVO_RE = /^[A-ZÁÉÍÓÚÑ]{2,3}\s+(\d{2})\/(\d{2})\/(\d{4})/;
const HORA_HHMMSS_RE = /^\d{1,2}:\d{2}:\d{2}$/;
// Motivos que el propio sistema de marcaje ya reconoce como justificados —
// esos días NO se cuentan en el total oficial de "inasistencias" (mismo
// criterio que el formato viejo excluía VACACION/LIC.MED. del conteo).
const JUSTIFICADO_EN_REPORTE_RE = /VACACION|LICENCIA|P\.\s*CON\s*GOCE|P\.\s*SIN\s*GOCE/i;

// Devuelve el ítem de `items` cuya X esté más cerca de `xObjetivo`, dentro de
// una tolerancia — así se lee cada columna por posición sin depender del
// orden en que vengan los ítems dentro de la fila.
function itemCercaX(items, xObjetivo, tolerancia = 10) {
  let mejor = null;
  let mejorDist = Infinity;
  for (const it of items) {
    const dist = Math.abs(it.transform[4] - xObjetivo);
    if (dist < tolerancia && dist < mejorDist) {
      mejor = it;
      mejorDist = dist;
    }
  }
  return mejor;
}

function extraerDatosPaginaNuevoFormato(items) {
  const itemIdent = items.find((it) => IDENTIFICACION_RE.test(it.str.trim()));
  if (!itemIdent) {
    return { ok: false, rut: null, motivo: 'No se encontró la identificación (RUT) del trabajador en la página.' };
  }
  const mRut = itemIdent.str.trim().match(IDENTIFICACION_RE);
  const rut = mRut[1];

  const itemNombre = items.find((it) => NOMBRE_NUEVO_RE.test(it.str.trim()));
  const nombre = itemNombre ? itemNombre.str.trim().replace(/^Nombre:/i, '').trim() : null;

  const itemPeriodo = items.find((it) => PERIODO_NUEVO_RE.test(it.str.trim()));
  const mPeriodo = itemPeriodo?.str.trim().match(PERIODO_NUEVO_RE);
  if (!mPeriodo) {
    return { ok: false, rut, nombre, motivo: 'No se encontró el período (fechas) en la página.' };
  }
  const periodoDesde = `${mPeriodo[3]}-${mPeriodo[2]}-${mPeriodo[1]}`;
  const periodoHasta = `${mPeriodo[6]}-${mPeriodo[5]}-${mPeriodo[4]}`;

  const filas = agruparPorFila(items, 2);
  const detalleDias = [];
  let atrasoTotalMinutos = 0;
  let cantidadAtrasos = 0;
  let cantidadAusencias = 0;

  for (const fila of filas) {
    // La etiqueta del día ("MA 01/09/2026 ") siempre viene como UN solo
    // ítem, pegado a la izquierda (X < 20) — así se distingue una fila de
    // día de una fila de "Sub total por semana N" (que arranca más a la
    // derecha) sin tener que armar el texto completo de la fila.
    const itemFecha = fila.items.find((it) => it.transform[4] < 20 && DIA_ROW_NUEVO_RE.test(it.str.trim()));
    if (!itemFecha) continue;
    const m = itemFecha.str.trim().match(DIA_ROW_NUEVO_RE);
    const fechaISO = `${m[3]}-${m[2]}-${m[1]}`;
    if (fechaISO < periodoDesde || fechaISO > periodoHasta) continue;

    const itemAtraso = itemCercaX(fila.items, 325);
    const itemAusencia = itemCercaX(fila.items, 358);
    const itemInasis = itemCercaX(fila.items, 512);
    // El motivo es texto libre que puede venir en más de un ítem — se toma
    // todo lo que quede a la derecha de la columna "Inasis." y se junta.
    const itemsJustificacion = fila.items
      .filter((it) => it.transform[4] > 528)
      .sort((a, b) => a.transform[4] - b.transform[4]);

    const atrasoMinutos =
      itemAtraso && HORA_HHMMSS_RE.test(itemAtraso.str.trim()) ? textoHorasAMinutos(itemAtraso.str.trim()) : 0;
    const ausenciaMinutos =
      itemAusencia && HORA_HHMMSS_RE.test(itemAusencia.str.trim()) ? textoHorasAMinutos(itemAusencia.str.trim()) : 0;
    const inasisFlag = itemInasis?.str.trim() === '1';
    const justificacionReporte = itemsJustificacion.map((it) => it.str.trim()).join(' ').trim() || null;

    if (atrasoMinutos > 0) cantidadAtrasos += 1;
    if (ausenciaMinutos > 0) cantidadAusencias += 1;
    atrasoTotalMinutos += atrasoMinutos;

    const inasistenciaReal = inasisFlag && !JUSTIFICADO_EN_REPORTE_RE.test(justificacionReporte || '');

    // Se guarda la fila si hay algo que mostrar: un atraso, una inasistencia
    // real, o un motivo ya escrito por el sistema (vacaciones, licencia,
    // permiso...) aunque ese día no cuente como atraso ni como inasistencia.
    if (atrasoMinutos > 0 || inasisFlag || justificacionReporte) {
      detalleDias.push({
        fecha: fechaISO,
        atraso_minutos: atrasoMinutos,
        inasistencia: inasistenciaReal,
        justificacion_reporte: justificacionReporte,
      });
    }
  }

  const fechasInasistencia = detalleDias.filter((d) => d.inasistencia).map((d) => d.fecha);
  const diasLicenciaMedica = detalleDias.filter((d) => /LICENCIA/i.test(d.justificacion_reporte || '')).length;

  return {
    ok: true,
    rut,
    nombre,
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,
    dias_inasistencia: fechasInasistencia.length,
    atraso_minutos: atrasoTotalMinutos,
    cantidad_atrasos: cantidadAtrasos,
    salidas_anticipadas_cantidad: cantidadAusencias,
    dias_licencia_medica: diasLicenciaMedica,
    fechas_inasistencia: fechasInasistencia,
    detalle_dias: detalleDias,
  };
}

// Recibe el archivo .pdf del "Reporte de asistencia simplificado" (un
// buffer) y devuelve el mismo formato de resultado que
// lib/asistenciaXls.js#parseAsistenciaXls, para que la ruta que lo recibe
// no tenga que distinguir entre los dos formatos más que al elegir cuál
// función llamar.
//
// Se usa la versión clásica (1.x) de "pdf-parse" a propósito: es una
// función simple que corre directamente en Node, sin levantar un Worker —
// la versión 2.x sí lo hace (para el motor de pdf.js) y eso no anduvo bien
// en el entorno serverless de Vercel (la función fallaba y devolvía una
// página de error en vez de una respuesta JSON). La 1.x es la que usan la
// gran mayoría de los proyectos Next.js/Vercel para esto mismo.
//
// En vez de usar el texto que arma pdf-parse por defecto, se le pasa un
// `pagerender` propio: por cada página, toma los ítems de texto crudos de
// pdf.js (con sus coordenadas) y arma el resultado ahí mismo, guardándolo en
// `resultados` — el texto que pdf-parse junta al final no se usa para nada.
export async function parseAsistenciaPdf(buffer) {
  const resultados = [];
  let numeroPagina = 0;

  await pdfParse(buffer, {
    max: 0,
    pagerender: async (pageData) => {
      numeroPagina += 1;
      const hoja = `Página ${numeroPagina}`;
      try {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });
        const items = textContent.items;
        const esPaginaTotales = items.some((it) => it.str.trim() === 'Totales Generales');
        if (esPaginaTotales) {
          // Página de "Totales Generales" del formato nuevo — no trae RUT ni
          // datos por día, y todo lo necesario ya está en la página de datos
          // de ese mismo trabajador. Se ignora.
          return '';
        }
        const esFormatoNuevo = items.some((it) => /^Identificacion:/.test(it.str.trim()));
        const resultado = esFormatoNuevo
          ? extraerDatosPaginaNuevoFormato(items)
          : extraerDatosPagina(items);
        resultados.push({ hoja, ...resultado });
      } catch (err) {
        resultados.push({
          hoja,
          ok: false,
          rut: null,
          motivo: 'No se pudo leer esta página del PDF: ' + err.message,
        });
      }
      return '';
    },
  });

  return resultados;
}
