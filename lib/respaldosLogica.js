// Helpers puros para la carpeta "Respaldos": los 4 tipos, agrupar por
// trabajador y por mes, y formatear el nombre de cada carpeta de mes.

export const TIPOS_RESPALDO = [
  { key: 'permisos', label: 'Permisos', icon: '📝' },
  { key: 'vacaciones', label: 'Vacaciones', icon: '🏖️' },
  { key: 'cajaChica', label: 'Caja Chica', icon: '💰' },
  { key: 'rendicionGastos', label: 'Rendición de Gastos', icon: '🧾' },
];

const ETIQUETA_TIPO = Object.fromEntries(TIPOS_RESPALDO.map((t) => [t.key, t.label]));
const ICONO_TIPO = Object.fromEntries(TIPOS_RESPALDO.map((t) => [t.key, t.icon]));

export function etiquetaTipoRespaldo(tipo) {
  return ETIQUETA_TIPO[tipo] || tipo;
}

export function iconoTipoRespaldo(tipo) {
  return ICONO_TIPO[tipo] || '📁';
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Clave de mes a partir de una fecha (ISO o "YYYY-MM-DD"), sin pasar por
// zona horaria del navegador — toma año/mes directo del string.
export function claveMes(fechaISO) {
  const [anio, mes] = String(fechaISO).slice(0, 7).split('-');
  return `${anio}-${mes}`;
}

export function etiquetaMes(clave) {
  const [anio, mes] = clave.split('-').map(Number);
  const nombre = MESES[mes - 1] || '';
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

export function agruparPorTrabajador(items) {
  const mapa = new Map();
  items.forEach((item) => {
    const lista = mapa.get(item.trabajador_id) || [];
    lista.push(item);
    mapa.set(item.trabajador_id, lista);
  });
  return [...mapa.entries()]
    .map(([trabajador_id, docs]) => ({
      trabajador_id,
      trabajador_nombre: docs[0].trabajador_nombre,
      docs,
      nuevos: docs.filter((d) => d.nuevo).length,
    }))
    .sort((a, b) => a.trabajador_nombre.localeCompare(b.trabajador_nombre, 'es'));
}

export function agruparPorMes(items) {
  const mapa = new Map();
  items.forEach((item) => {
    if (!item.fecha) return;
    const clave = claveMes(item.fecha);
    const lista = mapa.get(clave) || [];
    lista.push(item);
    mapa.set(clave, lista);
  });
  return [...mapa.entries()]
    .map(([clave, docs]) => ({
      clave,
      etiqueta: etiquetaMes(clave),
      docs: docs.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
      nuevos: docs.filter((d) => d.nuevo).length,
    }))
    .sort((a, b) => (a.clave < b.clave ? 1 : -1));
}

// Descripción corta de un documento para la lista final de cada carpeta
// de mes (y para el bloque "Nuevos").
export function resumenDocumento(item) {
  if (item._tipo === 'permisos') return item.solicitud.tipo_permiso || 'Permiso';
  if (item._tipo === 'vacaciones') return `${item.solicitud.dias_habiles} día(s) hábil(es)`;
  if (item._tipo === 'cajaChica') return item.solicitud.articulo || 'Caja chica';
  if (item._tipo === 'rendicionGastos') return `${item.rendicion.moneda} · rendición de gastos`;
  return '—';
}
