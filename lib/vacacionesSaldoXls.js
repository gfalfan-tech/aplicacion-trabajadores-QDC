import * as XLSX from 'xlsx';
import { normalizarRut } from './asistenciaXls';

function aFechaISO(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizarEncabezado(valor) {
  return (valor ?? '').toString().trim().toUpperCase();
}

/**
 * Lee el informe manual "VACACIONES DEL PERSONAL" que arma RR.HH. (una
 * fila por trabajador, con RUT) para "poner al día" en bloque el saldo de
 * vacaciones de cada uno. Busca la fila de encabezados por texto (no por
 * posición fija), porque la planilla puede traer o no la columna RUT, o
 * cambiar de orden entre meses.
 *
 * Para cada trabajador solo se necesitan tres datos del informe:
 * - RUT: para encontrar al trabajador en la app.
 * - "Vacaciones progresivas al <año>": los días progresivos YA
 *   reconocidos a la fecha del informe (dias_progresivos_reconocidos).
 * - "SALDO AL DIA DE HOY <fecha>": el saldo YA GANADO/disponible a hoy
 *   (dias_pendientes_base) — es decir, el número desde el cual el
 *   sistema debe seguir acumulando de ahora en adelante.
 *
 *   OJO: esto es distinto de "SALDO AL 31-12-<año>", que es una
 *   proyección a fin de año (asume los 15 días del año ya ganados
 *   completos aunque todavía no pase el año) y NO debe usarse como
 *   saldo base — usarla infla el saldo con días que el trabajador aún
 *   no ha devengado. Por eso se busca el encabezado exacto "SALDO AL
 *   DIA DE HOY", no cualquier columna que empiece con "SALDO AL".
 *
 * El resto de columnas del informe (días hábiles del año, próximo día
 * progresivo y su fecha, total al 31-12, saldo al 31-12, etc.) son para
 * el seguimiento manual de RR.HH. y no se guardan — la app las vuelve a
 * calcular sola desde estos dos números más la fecha de corte (ver
 * supabase/migrations/vacaciones_progresivo_aniversario.sql).
 */
export function parseVacacionesSaldoXls(buffer) {
  const libro = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const nombreHoja = libro.SheetNames[0];
  const hoja = libro.Sheets[nombreHoja];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null });

  let indiceEncabezado = -1;
  const columnas = {};
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila) continue;
    const idxNombres = fila.findIndex((c) => normalizarEncabezado(c) === 'NOMBRES');
    if (idxNombres === -1) continue;
    indiceEncabezado = i;
    fila.forEach((celda, idx) => {
      const texto = normalizarEncabezado(celda);
      if (texto === 'NOMBRES') columnas.nombre = idx;
      else if (texto === 'RUT') columnas.rut = idx;
      else if (/^F\.?\s*INGRESO$/.test(texto)) columnas.fecha_ingreso = idx;
      else if (texto.startsWith('VACACIONES PROGRESIVAS')) columnas.dias_progresivos = idx;
      else if (texto.startsWith('FECHA ASIGNACION')) columnas.proximo_dia_progresivo_fecha = idx;
      else if (texto.startsWith('SALDO AL DIA DE HOY')) columnas.saldo = idx;
    });
    break;
  }

  if (indiceEncabezado === -1) {
    return {
      ok: false,
      motivo: 'No se encontró la fila de encabezados ("NOMBRES", "RUT", …) en la hoja.',
      filas: [],
    };
  }
  if (columnas.rut == null) {
    return { ok: false, motivo: 'La planilla no trae columna "RUT".', filas: [] };
  }
  if (columnas.dias_progresivos == null || columnas.saldo == null) {
    return {
      ok: false,
      motivo:
        'No se encontraron las columnas "Vacaciones progresivas al …" y/o "SALDO AL DIA DE HOY …" en la hoja.',
      filas: [],
    };
  }

  const resultado = [];
  for (let i = indiceEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila) continue;
    const rut = fila[columnas.rut];
    if (!rut || typeof rut !== 'string' || !rut.trim()) continue; // fin de la tabla

    const nombre = columnas.nombre != null ? fila[columnas.nombre] : null;
    const fecha_ingreso = columnas.fecha_ingreso != null ? aFechaISO(fila[columnas.fecha_ingreso]) : null;

    const proximo_dia_progresivo_fecha =
      columnas.proximo_dia_progresivo_fecha != null
        ? aFechaISO(fila[columnas.proximo_dia_progresivo_fecha])
        : null;

    resultado.push({
      nombre: nombre ? nombre.toString().trim() : null,
      rut: rut.toString().trim(),
      rut_normalizado: normalizarRut(rut),
      fecha_ingreso,
      dias_progresivos_reconocidos: Number(fila[columnas.dias_progresivos]) || 0,
      // Fecha exacta en que corresponde sumar el próximo día progresivo
      // (como ya la calculó RR.HH. a mano, considerando antigüedad de
      // otros empleadores si corresponde — ver
      // supabase/migrations/vacaciones_progresivo_aniversario.sql). Si la
      // planilla no trae esta fecha para la fila (trabajador sin
      // progresivos todavía), queda null y el valor de progresivos no
      // crece solo hasta que RR.HH. la registre.
      proximo_dia_progresivo_fecha,
      dias_pendientes_base: Number(fila[columnas.saldo]) || 0,
    });
  }

  return { ok: true, filas: resultado };
}
