'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const REACCIONES = [
  { tipo: 'me_gusta', emoji: '👍', label: 'Me gusta' },
  { tipo: 'me_encanta', emoji: '❤️', label: 'Me encanta' },
  { tipo: 'aplausos', emoji: '👏', label: 'Aplausos' },
  { tipo: 'buena_idea', emoji: '💡', label: 'Buena idea' },
];

function tiempoRelativo(fecha) {
  const diffMs = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export default function MuralInteracciones({ publicacionId, trabajadorId, puedeModerar = false }) {
  const [reacciones, setReacciones] = useState([]);
  const [comentarios, setComentarios] = useState([]);
  const [mostrarComentarios, setMostrarComentarios] = useState(false);
  const [textoComentario, setTextoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [mostrarSelectorReaccion, setMostrarSelectorReaccion] = useState(false);

  async function cargarReacciones() {
    const { data } = await supabase
      .from('mural_reacciones')
      .select('trabajador_id, tipo')
      .eq('publicacion_id', publicacionId);
    setReacciones(data || []);
  }

  async function cargarComentarios() {
    const { data } = await supabase
      .from('mural_comentarios')
      .select('id, texto, created_at, trabajador_id, trabajadores(nombre_completo)')
      .eq('publicacion_id', publicacionId)
      .order('created_at', { ascending: true });
    setComentarios(data || []);
  }

  useEffect(() => {
    cargarReacciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicacionId]);

  useEffect(() => {
    if (mostrarComentarios) cargarComentarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarComentarios]);

  const miReaccion = reacciones.find((r) => r.trabajador_id === trabajadorId);
  const conteoPorTipo = REACCIONES.map((r) => ({
    ...r,
    cantidad: reacciones.filter((x) => x.tipo === r.tipo).length,
  })).filter((r) => r.cantidad > 0);
  const totalReacciones = reacciones.length;

  async function elegirReaccion(tipo) {
    setMostrarSelectorReaccion(false);
    if (miReaccion && miReaccion.tipo === tipo) {
      setReacciones((prev) => prev.filter((r) => r.trabajador_id !== trabajadorId));
      await supabase
        .from('mural_reacciones')
        .delete()
        .eq('publicacion_id', publicacionId)
        .eq('trabajador_id', trabajadorId);
      return;
    }
    if (miReaccion) {
      setReacciones((prev) =>
        prev.map((r) => (r.trabajador_id === trabajadorId ? { ...r, tipo } : r))
      );
      await supabase
        .from('mural_reacciones')
        .update({ tipo })
        .eq('publicacion_id', publicacionId)
        .eq('trabajador_id', trabajadorId);
    } else {
      setReacciones((prev) => [...prev, { trabajador_id: trabajadorId, tipo }]);
      await supabase
        .from('mural_reacciones')
        .insert({ publicacion_id: publicacionId, trabajador_id: trabajadorId, tipo });
    }
  }

  async function enviarComentario(e) {
    e.preventDefault();
    if (!textoComentario.trim()) return;
    setEnviandoComentario(true);
    const { error } = await supabase
      .from('mural_comentarios')
      .insert({ publicacion_id: publicacionId, trabajador_id: trabajadorId, texto: textoComentario.trim() });
    setEnviandoComentario(false);
    if (!error) {
      setTextoComentario('');
      cargarComentarios();
    }
  }

  async function eliminarComentario(id) {
    await supabase.from('mural_comentarios').delete().eq('id', id);
    setComentarios((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setMostrarSelectorReaccion((v) => !v)}
            className={`text-xs font-bold rounded-lg px-3 py-1.5 ${
              miReaccion ? 'bg-[#E6F1FB] text-[#0F5C8C]' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {miReaccion
              ? `${REACCIONES.find((r) => r.tipo === miReaccion.tipo)?.emoji} ${
                  REACCIONES.find((r) => r.tipo === miReaccion.tipo)?.label
                }`
              : '👍 Reaccionar'}
          </button>
          {mostrarSelectorReaccion && (
            <div className="absolute bottom-full left-0 mb-1 bg-white rounded-full border border-slate-200 shadow-lg flex gap-1 p-1 z-10">
              {REACCIONES.map((r) => (
                <button
                  key={r.tipo}
                  title={r.label}
                  onClick={() => elegirReaccion(r.tipo)}
                  className="text-lg w-8 h-8 rounded-full hover:bg-slate-100 hover:scale-125 transition-transform flex items-center justify-center"
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setMostrarComentarios((v) => !v)}
          className="text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg px-3 py-1.5"
        >
          💬 Comentar
        </button>
      </div>

      {totalReacciones > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
          {conteoPorTipo.map((r) => (
            <span key={r.tipo} className="flex items-center gap-0.5">
              {r.emoji} {r.cantidad}
            </span>
          ))}
        </div>
      )}

      {mostrarComentarios && (
        <div className="mt-3 space-y-2">
          {comentarios.map((c) => (
            <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#153A5B]">
                  {c.trabajadores?.nombre_completo || 'Trabajador'}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-[10px] text-slate-400">{tiempoRelativo(c.created_at)}</p>
                  {(c.trabajador_id === trabajadorId || puedeModerar) && (
                    <button
                      onClick={() => eliminarComentario(c.id)}
                      className="text-[10px] font-bold text-red-600"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-700 mt-1">{c.texto}</p>
            </div>
          ))}
          {comentarios.length === 0 && (
            <p className="text-xs text-slate-400">Sé el primero en comentar.</p>
          )}

          <form onSubmit={enviarComentario} className="flex gap-2 pt-1">
            <input
              value={textoComentario}
              onChange={(e) => setTextoComentario(e.target.value)}
              placeholder="Escribe un comentario…"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
            <button
              disabled={enviandoComentario}
              className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-2 disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}