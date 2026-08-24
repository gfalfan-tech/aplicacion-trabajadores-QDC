import { supabase } from '@/lib/supabaseClient';
import { sanitizeFileName } from '@/lib/sanitizeFileName';

/**
 * Sube una foto de perfil (tipo "avatar") o de portada (tipo "banner") al
 * bucket "perfiles" y guarda su URL en trabajadores. Devuelve la URL pública.
 */
export async function subirFotoPerfil(trabajadorId, tipo, file) {
  const nombreArchivo = `${trabajadorId}/${tipo}_${Date.now()}_${sanitizeFileName(file.name)}`;
  const { error: errorSubida } = await supabase.storage
    .from('perfiles')
    .upload(nombreArchivo, file, { upsert: false });
  if (errorSubida) throw new Error(errorSubida.message);

  const { data: urlData } = supabase.storage.from('perfiles').getPublicUrl(nombreArchivo);
  const url = urlData.publicUrl;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const res = await fetch('/api/perfil/actualizar-foto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tipo, url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al guardar la foto.');

  return url;
}
