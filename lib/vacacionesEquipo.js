import { supabase } from '@/lib/supabaseClient';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

export async function obtenerCalendarioVacaciones(mes, areaId) {
  const params = new URLSearchParams({ mes });
  if (areaId) params.set('area_id', areaId);
  const resp = await fetch(`/api/vacaciones/calendario?${params.toString()}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo cargar el calendario.');
  return json;
}

export async function obtenerVacacionesPendientesEquipo() {
  const resp = await fetch('/api/vacaciones/pendientes', {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo cargar las solicitudes de vacaciones.');
  return json.solicitudes;
}

export async function obtenerTraslapes(solicitudId) {
  const resp = await fetch(`/api/vacaciones/traslapes?solicitud_id=${solicitudId}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo verificar traslapes.');
  return json.traslapes;
}

export async function resolverSolicitudVacaciones(solicitudId, estado) {
  const resp = await fetch('/api/vacaciones/resolver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ solicitudId, estado }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo resolver la solicitud.');
  return json;
}

// YYYY-MM del mes actual, y suma/resta de meses sobre un "YYYY-MM".
export function mesActualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function sumarMes(mesISO, delta) {
  const [anio, mes] = mesISO.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function nombreMes(mesISO) {
  const [anio, mes] = mesISO.split('-').map(Number);
  return `${MESES_LARGOS[mes - 1]} ${anio}`;
}

// Arma la grilla de un mes (semanas de lunes a domingo, con relleno de los
// días de los meses vecinos) y, para cada día, qué solicitudes lo cubren.
export function armarGrillaMes(mesISO, solicitudes) {
  const [anio, mes] = mesISO.split('-').map(Number);
  const primerDia = new Date(Date.UTC(anio, mes - 1, 1));
  const ultimoDia = new Date(Date.UTC(anio, mes, 0));
  // getUTCDay(): 0=domingo..6=sábado → lo pasamos a 0=lunes..6=domingo.
  const offsetInicio = (primerDia.getUTCDay() + 6) % 7;

  const dias = [];
  for (let i = 0; i < offsetInicio; i++) dias.push(null);
  for (let d = 1; d <= ultimoDia.getUTCDate(); d++) {
    const fechaISO = `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const solicitudesDelDia = solicitudes.filter(
      (s) => s.fecha_desde <= fechaISO && s.fecha_hasta >= fechaISO
    );
    dias.push({ fechaISO, dia: d, solicitudes: solicitudesDelDia });
  }
  while (dias.length % 7 !== 0) dias.push(null);

  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return semanas;
}
