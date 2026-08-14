'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const iconosTipo = { circular: '📢', imagen: '🖼️', curso: '🎓', comunicado: '📰' };

export default function MuralPost({
  post,
  perfil,
  esRRHH = false,
  expirada = false,
  resaltada = false,
  onEditar,
  onEliminar,
}) {
  const [comentarios, setComentarios] = useState([]);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [reaccionesPost, setReaccionesPost] = useState([]);
  const [reaccionesComentarios, setReaccionesComentarios] = useState({});

  async function cargarComentarios() {
    const { data } = await supabase
      .from('comentarios_mural')
      .select('*, trabajadores(nombre_completo)')
      .eq('publicacion_id', post.id)
      .order('created_at', { ascending: true });
    setComentarios(data || []);
    if (data && data.length) {
      const ids = data.map((c) => c.id);
      const { data: reacc } = await supabase
        .from('reacciones_comentario')
        .select('*')
        .in('comentario_id', ids);
      const agrupadas = {};
      (reacc || []).forEach((r) => {
        agrupadas[r.comentario_id] = agrupadas[r.comentario_id] || [];
        agrupadas[r.comentario_id].push(r);
      });
      setReaccionesComentarios(agrupadas);
    } else {
      setReaccionesComentarios({});
    }
  }

  async function cargarReaccionesPost() {
    const { data } = await supabase.from('reacciones_mural').select('*').eq('publicacion_id', post.id);
    setReaccionesPost(data || []);
  }

  useEffect(() => {
    cargarComentarios();
    cargarReaccionesPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  async function reaccionar(tipo) {
    if (!perfil) return;
    const mia = reaccionesPost.find((r) => r.trabajador_id === perfil.id);
    if (mia && mia.tipo === tipo) {
      await supabase.from('reacciones_mural').delete().eq('id', mia.id);
    } else {
      await supabase
        .from('reacciones_mural')
        .upsert(
          { publicacion_id: post.id, trabajador_id: perfil.id, tipo },
          { onConflict: 'publicacion_id,trabajador_id' }
        );
    }
    cargarReaccionesPost();
  }

  async function reaccionarComentario(comentarioId, tipo) {
    if (!perfil) return;
    const actuales = reaccionesComentarios[comentarioId] || [];
    const mia = actuales.find((r) => r.trabajador_id === perfil.id);
    if (mia && mia.tipo === tipo) {
      await supabase.from('reacciones_comentario').delete().eq('id', mia.id);
    } else {
      await supabase
        .from('reacciones_comentario')
        .upsert(
          { comentario_id: comentarioId, trabajador_id: perfil.id, tipo },
          { onConflict: 'comentario_id,trabajador_id' }
        );
    }
    cargarComentarios();
  }

  async function enviarComentario(e) {
    e.preventDefault();
    if (!nuevoComentario.trim() || !perfil) return;
    setEnviandoComentario(true);
    await supabase.from('comentarios_mural').insert({
      publicacion_id: post.id,
      trabajador_id: perfil.id,
      contenido: nuevoComentario.trim(),
    });
    setNuevoComentario('');
    setEnviandoComentario(false);
    cargarComentarios();
  }

  async function eliminarComentario(id) {
    await supabase.from('comentarios_mural').delete().eq('id', id);
    cargarComentarios();
  }

  function contar(lista, tipo) {
    return lista.filter((r) => r.tipo === tipo).length;
  }

  const miReaccion = reaccionesPost.find((r) => r.trabajador_id === perfil?.id)?.tipo;

  return (
    <div
      id={`post-${post.id}`}
      className={`bg-white rounded-xl border p-4 ${
        expirada ? 'border-slate-200 opacity-50' : 'border-slate-200'
      } ${resaltada ? 'ring-2 ring-[#0F5C8C]' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#E6F1FB] flex items-center justify-center text-lg shrink-0">
          {iconosTipo[post.tipo] || '📰'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#153A5B]">{post.titulo}</p>
          <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{post.contenido}</p>
          {post.imagen_url && (
            <img
              src={post.imagen_url}
              alt={post.titulo}
              className="mt-2 rounded-lg border border-slate-200 max-h-64 w-full object-cover"
            />
          )}
          <p className="text-[10px] text-slate-400 mt-2">
            {new Date(post.publicado_en).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
            {post.fecha_expiracion &&
              (expirada ? ` · Expiró el ${post.fecha_expiracion}` : ` · Expira el ${post.fecha_expiracion}`)}
          </p>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={() => reaccionar('me_encanta')}
              className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${
                miReaccion === 'me_encanta' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
              }`}
            >
              ❤️ {contar(reaccionesPost, 'me_encanta') || ''}
            </button>
            <button
              onClick={() => reaccionar('me_gusta')}
              className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${
                miReaccion === 'me_gusta' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
              }`}
            >
              👍 {contar(reaccionesPost, 'me_gusta') || ''}
            </button>
            {esRRHH && (
              <div className="ml-auto flex gap-3">
                <button onClick={() => onEditar && onEditar(post)} className="text-xs font-bold text-[#0F5C8C]">
                  Editar
                </button>
                <button
                  onClick={() => onEliminar && onEliminar(post.id)}
                  className="text-xs font-bold text-red-700"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {comentarios.map((c) => {
              const reaccionesC = reaccionesComentarios[c.id] || [];
              const miReaccionC = reaccionesC.find((r) => r.trabajador_id === perfil?.id)?.tipo;
              const puedoBorrar = esRRHH || c.trabajador_id === perfil?.id;
              return (
                <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-[#153A5B]">
                      {c.trabajadores?.nombre_completo || 'Trabajador'}
                    </p>
                    {puedoBorrar && (
                      <button onClick={() => eliminarComentario(c.id)} className="text-[10px] text-red-500 shrink-0">
                        Eliminar
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{c.contenido}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => reaccionarComentario(c.id, 'me_encanta')}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        miReaccionC === 'me_encanta' ? 'bg-red-100 text-red-600' : 'text-slate-400'
                      }`}
                    >
                      ❤️ {contar(reaccionesC, 'me_encanta') || ''}
                    </button>
                    <button
                      onClick={() => reaccionarComentario(c.id, 'me_gusta')}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        miReaccionC === 'me_gusta' ? 'bg-blue-100 text-blue-600' : 'text-slate-400'
                      }`}
                    >
                      👍 {contar(reaccionesC, 'me_gusta') || ''}
                    </button>
                  </div>
                </div>
              );
            })}
            {comentarios.length === 0 && <p className="text-[10px] text-slate-400">Sé el primero en comentar.</p>}
          </div>

          {!expirada && perfil && (
            <form onSubmit={enviarComentario} className="flex items-center gap-2 mt-2">
              <input
                value={nuevoComentario}
                onChange={(e) => setNuevoComentario(e.target.value)}
                placeholder="Escribe un comentario…"
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
              />
              <button
                disabled={enviandoComentario}
                className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-1.5 shrink-0"
              >
                Enviar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
