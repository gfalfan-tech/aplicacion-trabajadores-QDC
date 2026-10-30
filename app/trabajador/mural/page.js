'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import MuralInteracciones from '@/components/MuralInteracciones';
import FormPublicarMural from '@/components/FormPublicarMural';
import Avatar from '@/components/Avatar';
import VisorImagen from '@/components/VisorImagen';

const iconos = { circular: '📢', imagen: '🖼️', curso: '🎓', comunicado: '📰' };

function tiempoRelativoPost(fecha) {
  const diffMs = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `hace ${dias} d`;
  return new Date(fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
}

export default function MuralTrabajador() {
  return (
    <Suspense fallback={null}>
      <MuralTrabajadorContenido />
    </Suspense>
  );
}

function MuralTrabajadorContenido() {
  const { perfil, roles } = useAuth();
  const puedePublicar = roles?.includes('publicar_mural');
  const searchParams = useSearchParams();
  const postDestacado = searchParams.get('post');
  const [lista, setLista] = useState([]);


  function cargar() {
    const hoy = new Date().toISOString().slice(0, 10);
    supabase
      .from('publicaciones_mural')
      .select('*, trabajadores(nombre_completo, avatar_url)')
      .or(`fecha_expiracion.is.null,fecha_expiracion.gte.${hoy}`)
      .order('publicado_en', { ascending: false })
      .then(({ data }) => setLista(data || []));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta publicación?')) return;
    await supabase.from('publicaciones_mural').delete().eq('id', id);
    cargar();
  }

  // Marca el mural como visto hasta la publicación más reciente en pantalla
  // (apaga el aviso del inicio). Si la tabla aún no existe, no pasa nada.
  useEffect(() => {
    if (!perfil?.id || lista.length === 0) return;
    const masReciente = lista[0]?.publicado_en;
    if (!masReciente) return;
    supabase
      .from('mural_lecturas')
      .upsert(
        {
          trabajador_id: perfil.id,
          visto_hasta: masReciente,
          actualizado_en: new Date().toISOString(),
        },
        { onConflict: 'trabajador_id' }
      )
      .then(() => {});
  }, [perfil?.id, lista]);

  useEffect(() => {
    if (!postDestacado || lista.length === 0) return;
    const el = document.getElementById(`post-${postDestacado}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [postDestacado, lista]);

  return (
    <AppShell links={trabajadorLinks} titulo="Diario mural">
      {puedePublicar && perfil && <FormPublicarMural trabajadorId={perfil.id} onPublicado={cargar} />}

      <div className="space-y-3">
        {lista.map((p) => (
          <div
            key={p.id}
            id={`post-${p.id}`}
            className={`bg-white rounded-xl border p-4 ${
              postDestacado === p.id ? 'border-[#0F5C8C] ring-2 ring-[#0F5C8C]/30' : 'border-slate-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <Avatar url={p.trabajadores?.avatar_url} nombre={p.trabajadores?.nombre_completo} size={40} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#153A5B]">
                    {p.trabajadores?.nombre_completo || 'Gestión RRHH'}
                  </p>
                  <span className="text-sm">{iconos[p.tipo] || '📰'}</span>
                  {puedePublicar && p.publicado_por === perfil?.id && (
                    <button
                      onClick={() => eliminar(p.id)}
                      className="ml-auto text-xs font-bold text-red-700 bg-red-100 rounded-lg px-3 py-1"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">{tiempoRelativoPost(p.publicado_en)}</p>
                <p className="text-base font-bold text-[#153A5B] mt-2">{p.titulo}</p>
                <p className="text-sm text-slate-500 mt-1">{p.contenido}</p>
                {p.imagen_url && (
                  <VisorImagen
                    src={p.imagen_url}
                    alt={p.titulo}
                    className="mt-2 rounded-lg border border-slate-200 max-w-full h-auto max-h-[560px] object-contain bg-slate-50"
                  />
                )}
                {perfil && (
                  <MuralInteracciones
                    publicacionId={p.id}
                    trabajadorId={perfil.id}
                    abrirComentariosInicial={postDestacado === p.id}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p className="text-sm text-slate-400">Aún no hay publicaciones.</p>}
      </div>
    </AppShell>
  );
}