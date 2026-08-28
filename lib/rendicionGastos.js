// Llamadas desde el cliente para Rendición de Gastos. La mayoría de las
// operaciones del propio trabajador (crear, editar mientras es borrador,
// agregar/borrar líneas y respaldos) van directo contra Supabase — las
// políticas RLS de rendicion_gastos.sql ya restringen todo a "mientras es
// borrador y es mío". Solo las transiciones que requieren validar el rol
// de OTRA persona (enviar exige que el trabajador tenga el rol
// 'rendicion_gastos'; resolver exige ser el jefe directo o RR.HH.) pasan
// por rutas de servidor, mismo criterio que vacaciones.

import { supabase } from '@/lib/supabaseClient';
import { sanitizeFileName } from '@/lib/sanitizeFileName';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

// --- Cabecera de la rendición ------------------------------------------

export async function crearBorrador({ moneda, tipo_cambio, total_entregado_qdc }) {
  const { data: sesion } = await supabase.auth.getSession();
  const trabajadorId = sesion?.session?.user?.id;
  const { data, error } = await supabase
    .from('rendiciones_gastos')
    .insert({
      trabajador_id: trabajadorId,
      moneda,
      tipo_cambio: moneda === 'USD' ? tipo_cambio || null : null,
      total_entregado_qdc: total_entregado_qdc || 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function guardarCabecera(id, { moneda, tipo_cambio, total_entregado_qdc }) {
  const { error } = await supabase
    .from('rendiciones_gastos')
    .update({
      moneda,
      tipo_cambio: moneda === 'USD' ? tipo_cambio || null : null,
      total_entregado_qdc: total_entregado_qdc || 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listarMisRendiciones() {
  const { data, error } = await supabase
    .from('rendiciones_gastos')
    .select('*, jefe_aprobador:aprobado_por_jefe(nombre_completo)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Trae la rendición completa con sus líneas y respaldos. Sirve tanto para
// el propio trabajador (mientras arma el borrador o para ver una ya
// enviada) como para el jefe/RR.HH. revisando una que les corresponde —
// las políticas RLS deciden en cada caso qué puede ver quien pregunta.
export async function obtenerRendicion(id) {
  const { data, error } = await supabase
    .from('rendiciones_gastos')
    .select(
      '*, trabajadores!trabajador_id(nombre_completo, rut, jefe_directo_id), jefe_aprobador:aprobado_por_jefe(nombre_completo), rendicion_gastos_lineas(*, rendicion_gastos_respaldos(*))'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.rendicion_gastos_lineas) {
    data.rendicion_gastos_lineas.sort((a, b) => (a.fecha_gasto < b.fecha_gasto ? -1 : 1));
  }
  return data;
}

export async function eliminarRendicion(id) {
  await borrarTodosLosRespaldos(id);
  const { error } = await supabase.from('rendiciones_gastos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

async function borrarTodosLosRespaldos(rendicionId) {
  const { data: lineas } = await supabase
    .from('rendicion_gastos_lineas')
    .select('id, rendicion_gastos_respaldos(storage_path)')
    .eq('rendicion_id', rendicionId);
  const paths = (lineas || []).flatMap((l) => (l.rendicion_gastos_respaldos || []).map((r) => r.storage_path));
  if (paths.length > 0) {
    await supabase.storage.from('rendicion-gastos').remove(paths);
  }
}

// --- Líneas de gasto -----------------------------------------------------

export async function agregarLinea(rendicionId, { fecha_gasto, descripcion, monto, categoria, tipo_documento }) {
  const { data, error } = await supabase
    .from('rendicion_gastos_lineas')
    .insert({ rendicion_id: rendicionId, fecha_gasto, descripcion, monto, categoria, tipo_documento })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function editarLinea(lineaId, { fecha_gasto, descripcion, monto, categoria, tipo_documento }) {
  const { error } = await supabase
    .from('rendicion_gastos_lineas')
    .update({ fecha_gasto, descripcion, monto, categoria, tipo_documento })
    .eq('id', lineaId);
  if (error) throw new Error(error.message);
}

export async function eliminarLinea(lineaId) {
  const { data: respaldos } = await supabase
    .from('rendicion_gastos_respaldos')
    .select('storage_path')
    .eq('linea_id', lineaId);
  const paths = (respaldos || []).map((r) => r.storage_path);
  if (paths.length > 0) {
    await supabase.storage.from('rendicion-gastos').remove(paths);
  }
  const { error } = await supabase.from('rendicion_gastos_lineas').delete().eq('id', lineaId);
  if (error) throw new Error(error.message);
}

// --- Respaldos (fotos de factura/boleta) ----------------------------------

export async function subirRespaldo({ trabajadorId, rendicionId, lineaId, file }) {
  const nombreArchivo = `${trabajadorId}/${rendicionId}/${lineaId}/${Date.now()}_${sanitizeFileName(file.name)}`;
  const { error: errorSubida } = await supabase.storage
    .from('rendicion-gastos')
    .upload(nombreArchivo, file, { upsert: false });
  if (errorSubida) throw new Error(errorSubida.message);

  const { data, error } = await supabase
    .from('rendicion_gastos_respaldos')
    .insert({ linea_id: lineaId, storage_path: nombreArchivo })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function eliminarRespaldo(respaldoId, storagePath) {
  await supabase.storage.from('rendicion-gastos').remove([storagePath]);
  const { error } = await supabase.from('rendicion_gastos_respaldos').delete().eq('id', respaldoId);
  if (error) throw new Error(error.message);
}

export async function urlFirmadaRespaldo(storagePath) {
  const { data, error } = await supabase.storage
    .from('rendicion-gastos')
    .createSignedUrl(storagePath, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// --- Envío y aprobación (rutas de servidor) -------------------------------

export async function enviarRendicion(id) {
  const resp = await fetch('/api/rendicion-gastos/enviar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ rendicionId: id }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo enviar la rendición.');
  return json;
}

export async function obtenerRendicionesPendientes() {
  const resp = await fetch('/api/rendicion-gastos/pendientes', {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudieron cargar las rendiciones pendientes.');
  return json.rendiciones;
}

export async function resolverRendicion(id, estado) {
  const resp = await fetch('/api/rendicion-gastos/resolver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ rendicionId: id, estado }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'No se pudo resolver la rendición.');
  return json;
}
