// Llamadas desde el cliente para Licencias Médicas. A diferencia de
// vacaciones/permisos, esto lo registra directamente RR.HH./administrador
// (sin flujo de aprobación) — las políticas RLS de
// supabase/migrations/licencias_medicas.sql ya restringen crear/editar/
// borrar a ese rol, así que va directo contra Supabase, sin ruta de
// servidor.

import { supabase } from '@/lib/supabaseClient';
import { sanitizeFileName } from '@/lib/sanitizeFileName';

export async function listarLicencias(trabajadorId) {
  const { data, error } = await supabase
    .from('licencias_medicas')
    .select('*')
    .eq('trabajador_id', trabajadorId)
    .order('fecha_desde', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Crea la licencia y, si viene un archivo (foto/PDF del certificado), lo
// sube al bucket privado y guarda su ruta. Si la subida del archivo falla
// después de haber creado la fila, se deja la licencia igual (con el
// respaldo vacío) en vez de perder el registro — mejor tener la licencia
// sin certificado adjunto que no tenerla.
export async function crearLicencia({ trabajadorId, fechaDesde, fechaHasta, comentario, file, registradoPor }) {
  const { data, error } = await supabase
    .from('licencias_medicas')
    .insert({
      trabajador_id: trabajadorId,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      comentario: comentario?.trim() || null,
      registrado_por: registradoPor || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (file) {
    const storagePath = `${trabajadorId}/${data.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
    const { error: errorSubida } = await supabase.storage
      .from('licencias-medicas')
      .upload(storagePath, file, { upsert: false });
    if (!errorSubida) {
      await supabase.from('licencias_medicas').update({ respaldo_storage_path: storagePath }).eq('id', data.id);
      data.respaldo_storage_path = storagePath;
    }
  }

  return data;
}

export async function eliminarLicencia(id, storagePath) {
  if (storagePath) {
    await supabase.storage.from('licencias-medicas').remove([storagePath]);
  }
  const { error } = await supabase.from('licencias_medicas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function urlFirmadaLicencia(storagePath) {
  const { data, error } = await supabase.storage
    .from('licencias-medicas')
    .createSignedUrl(storagePath, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
