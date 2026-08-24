'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell, { CLAVE_ULTIMA_VISTA } from '@/components/AppShell';
import { trabajadorLinks, rrhhLinks } from '@/lib/navLinks';
import { useConversaciones } from '@/lib/useConversaciones';

const EMOJIS_RAPIDOS = ['👍', '🙌', '😀', '😂', '❤️', '🙏', '🎉', '👏', '😢', '🔥'];

function tiempoRelativo(fecha) {
  if (!fecha) return '';
  const diffMs = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export default function MensajesPage() {
  const { perfil, esRRHH } = useAuth();
  // /mensajes es una pantalla "neutral" (no vive bajo /rrhh ni /trabajador),
  // así que para alguien con doble rol (RRHH que también puede navegar como
  // trabajador) hay que mostrarle el menú de la vista en la que estaba
  // navegando, no siempre el de RRHH solo porque tiene ese rol.
  const [vistaGuardada, setVistaGuardada] = useState(null);
  useEffect(() => {
    setVistaGuardada(window.localStorage.getItem(CLAVE_ULTIMA_VISTA));
  }, []);
  const links = esRRHH && vistaGuardada !== 'trabajador' ? rrhhLinks : trabajadorLinks;
  const { conversaciones, recargar } = useConversaciones(perfil?.id);

  const [activaId, setActivaId] = useState(null);
  const [vistaMovilLista, setVistaMovilLista] = useState(true);
  const [mensajes, setMensajes] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [modoGrupo, setModoGrupo] = useState(false);
  const [directorio, setDirectorio] = useState([]);
  const [seleccion, setSeleccion] = useState([]);
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [mensajeModal, setMensajeModal] = useState('');

  const [mostrarParticipantes, setMostrarParticipantes] = useState(false);
  const [confirmarEliminarGrupo, setConfirmarEliminarGrupo] = useState(false);

  const activa = conversaciones.find((c) => c.conversacion_id === activaId);

  async function cargarMensajes(id) {
    const { data } = await supabase
      .from('mensajes')
      .select('id, texto, creado_en, trabajador_id, trabajadores(nombre_completo)')
      .eq('conversacion_id', id)
      .order('creado_en', { ascending: true });
    setMensajes(data || []);
  }

  async function cargarParticipantes(id) {
    const { data } = await supabase
      .from('conversaciones_participantes')
      .select('trabajador_id, es_admin, trabajadores(nombre_completo)')
      .eq('conversacion_id', id);
    setParticipantes(data || []);
  }

  async function marcarLeido(id) {
    if (!perfil) return;
    await supabase
      .from('conversaciones_participantes')
      .update({ ultima_lectura: new Date().toISOString() })
      .eq('conversacion_id', id)
      .eq('trabajador_id', perfil.id);
    recargar();
  }

  function abrir(id) {
    setActivaId(id);
    setVistaMovilLista(false);
    setConfirmarEliminarGrupo(false);
    cargarMensajes(id);
    cargarParticipantes(id);
    marcarLeido(id);
  }

  function volverALista() {
    setVistaMovilLista(true);
  }

  // Tiempo real: mensajes nuevos de otros en la conversación abierta.
  useEffect(() => {
    if (!activaId) return;
    const canal = supabase
      .channel(`mensajes-${activaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `conversacion_id=eq.${activaId}` },
        () => {
          cargarMensajes(activaId);
          marcarLeido(activaId);
        }
      )
      .subscribe();
    return () => supabase.removeChannel(canal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activaId]);

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim() || !activaId || !perfil) return;
    setEnviando(true);
    const { error } = await supabase
      .from('mensajes')
      .insert({ conversacion_id: activaId, trabajador_id: perfil.id, texto: texto.trim() });
    setEnviando(false);
    if (!error) {
      setTexto('');
      cargarMensajes(activaId);
      recargar();
    }
  }

  function insertarEmoji(emoji) {
    setTexto((t) => t + emoji);
  }

  async function cargarDirectorio() {
    if (!perfil) return;
    const { data } = await supabase
      .from('trabajadores')
      .select('id, nombre_completo, cargo')
      .neq('id', perfil.id)
      .order('nombre_completo');
    setDirectorio(data || []);
  }

  function abrirNuevoChat() {
    setModoGrupo(false);
    setSeleccion([]);
    setNombreGrupo('');
    setMensajeModal('');
    setMostrarNuevo(true);
    if (!directorio.length) cargarDirectorio();
  }

  function abrirNuevoGrupo() {
    setModoGrupo(true);
    setSeleccion([]);
    setNombreGrupo('');
    setMensajeModal('');
    setMostrarNuevo(true);
    if (!directorio.length) cargarDirectorio();
  }

  function cerrarModalNuevo() {
    setMostrarNuevo(false);
  }

  function toggleSeleccion(id) {
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function iniciarPrivado(otroId) {
    const existente = conversaciones.find((c) => c.tipo === 'privada' && c.otro_id === otroId);
    if (existente) {
      abrir(existente.conversacion_id);
      cerrarModalNuevo();
      return;
    }
    setProcesando(true);
    setMensajeModal('');
    const { data: nuevaConv, error } = await supabase
      .from('conversaciones')
      .insert({ tipo: 'privada', creado_por: perfil.id })
      .select()
      .single();
    if (error) {
      setProcesando(false);
      setMensajeModal('Error: ' + error.message);
      return;
    }
    const { error: errorParticipantes } = await supabase.from('conversaciones_participantes').insert([
      { conversacion_id: nuevaConv.id, trabajador_id: perfil.id },
      { conversacion_id: nuevaConv.id, trabajador_id: otroId },
    ]);
    setProcesando(false);
    if (errorParticipantes) {
      setMensajeModal('Error: ' + errorParticipantes.message);
      return;
    }
    await recargar();
    abrir(nuevaConv.id);
    cerrarModalNuevo();
  }

  async function crearGrupo(e) {
    e.preventDefault();
    if (!nombreGrupo.trim()) {
      setMensajeModal('Ponle un nombre al grupo.');
      return;
    }
    if (seleccion.length === 0) {
      setMensajeModal('Elige al menos una persona.');
      return;
    }
    setProcesando(true);
    setMensajeModal('');
    const { data: nuevaConv, error } = await supabase
      .from('conversaciones')
      .insert({ tipo: 'grupo', nombre: nombreGrupo.trim(), creado_por: perfil.id })
      .select()
      .single();
    if (error) {
      setProcesando(false);
      setMensajeModal('Error: ' + error.message);
      return;
    }
    const filas = [
      { conversacion_id: nuevaConv.id, trabajador_id: perfil.id, es_admin: true },
      ...seleccion.map((id) => ({ conversacion_id: nuevaConv.id, trabajador_id: id, es_admin: false })),
    ];
    const { error: errorParticipantes } = await supabase.from('conversaciones_participantes').insert(filas);
    setProcesando(false);
    if (errorParticipantes) {
      setMensajeModal('Error: ' + errorParticipantes.message);
      return;
    }
    await recargar();
    abrir(nuevaConv.id);
    cerrarModalNuevo();
  }

  async function eliminarGrupoActivo() {
    if (!activaId) return;
    await supabase.from('conversaciones').delete().eq('id', activaId);
    setActivaId(null);
    setMensajes([]);
    setParticipantes([]);
    setConfirmarEliminarGrupo(false);
    setVistaMovilLista(true);
    recargar();
  }

  async function quitarParticipante(trabajadorId) {
    if (!activaId) return;
    await supabase
      .from('conversaciones_participantes')
      .delete()
      .eq('conversacion_id', activaId)
      .eq('trabajador_id', trabajadorId);
    cargarParticipantes(activaId);
    recargar();
  }

  async function salirDelGrupo() {
    if (!activaId || !perfil) return;
    await quitarParticipante(perfil.id);
    setActivaId(null);
    setMensajes([]);
    setParticipantes([]);
    setVistaMovilLista(true);
    setMostrarParticipantes(false);
  }

  if (!perfil) return null;

  const nombreConversacion = activa
    ? activa.tipo === 'grupo'
      ? activa.nombre
      : activa.otros_nombres || 'Trabajador'
    : '';

  return (
    <AppShell links={links} titulo="Mensajes">
      <div className="flex gap-4 h-[calc(100vh-180px)] min-h-[420px]">
        {/* Lista de conversaciones */}
        <div
          className={`w-full md:w-72 shrink-0 bg-white rounded-xl border border-slate-200 flex-col ${
            vistaMovilLista || !activaId ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="p-3 border-b border-slate-100 flex gap-2">
            <button
              onClick={abrirNuevoChat}
              className="flex-1 text-xs font-bold text-white bg-[#0F5C8C] rounded-lg py-2"
            >
              + Chat
            </button>
            <button
              onClick={abrirNuevoGrupo}
              className="flex-1 text-xs font-bold text-[#153A5B] bg-slate-100 rounded-lg py-2"
            >
              + Grupo
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {conversaciones.length === 0 && (
              <p className="text-sm text-slate-400 p-4 text-center">Aún no tienes conversaciones.</p>
            )}
            {conversaciones.map((c) => {
              const nombre = c.tipo === 'grupo' ? c.nombre : c.otros_nombres || 'Trabajador';
              return (
                <button
                  key={c.conversacion_id}
                  onClick={() => abrir(c.conversacion_id)}
                  className={`w-full text-left px-3 py-3 hover:bg-slate-50 ${
                    c.conversacion_id === activaId ? 'bg-[#E6F1FB]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[#153A5B] truncate">
                      {c.tipo === 'grupo' ? '👥 ' : ''}
                      {nombre}
                    </p>
                    {c.no_leidos > 0 && (
                      <span className="bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shrink-0">
                        {c.no_leidos > 9 ? '9+' : c.no_leidos}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {c.ultimo_texto || 'Sin mensajes todavía.'}
                  </p>
                  {c.ultimo_en && (
                    <p className="text-[10px] text-slate-400 mt-0.5">{tiempoRelativo(c.ultimo_en)}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversación activa */}
        <div
          className={`flex-1 bg-white rounded-xl border border-slate-200 flex-col min-w-0 ${
            !vistaMovilLista && activaId ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!activaId && (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Selecciona una conversación o crea una nueva.
            </div>
          )}

          {activaId && (
            <>
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={volverALista} className="md:hidden text-slate-500 shrink-0">
                    ←
                  </button>
                  <p className="text-sm font-bold text-[#153A5B] truncate">
                    {activa?.tipo === 'grupo' ? '👥 ' : ''}
                    {nombreConversacion}
                  </p>
                </div>
                {activa?.tipo === 'grupo' && (
                  <button
                    onClick={() => setMostrarParticipantes(true)}
                    className="text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-1.5 shrink-0"
                  >
                    Participantes
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {mensajes.length === 0 && (
                  <p className="text-xs text-slate-400 text-center">Sin mensajes todavía. Saluda 👋</p>
                )}
                {mensajes.map((m) => {
                  const esMio = m.trabajador_id === perfil.id;
                  return (
                    <div key={m.id} className={`flex ${esMio ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                          esMio ? 'bg-[#0F5C8C] text-white' : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {activa?.tipo === 'grupo' && !esMio && (
                          <p className="text-[10px] font-bold text-[#0F5C8C] mb-0.5">
                            {m.trabajadores?.nombre_completo || 'Trabajador'}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
                        <p className={`text-[10px] mt-1 ${esMio ? 'text-white/70' : 'text-slate-400'}`}>
                          {tiempoRelativo(m.creado_en)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 p-3">
                <div className="flex gap-1 mb-2 overflow-x-auto">
                  {EMOJIS_RAPIDOS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => insertarEmoji(e)}
                      className="text-lg w-8 h-8 shrink-0 rounded-full hover:bg-slate-100 flex items-center justify-center"
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <form onSubmit={enviar} className="flex gap-2">
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escribe un mensaje…"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    disabled={enviando || !texto.trim()}
                    className="text-sm font-bold text-white bg-[#0F5C8C] rounded-lg px-4 py-2 disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal: nuevo chat / nuevo grupo */}
      {mostrarNuevo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-[#153A5B]">
                {modoGrupo ? 'Nuevo grupo' : 'Nuevo mensaje'}
              </p>
              <button onClick={cerrarModalNuevo} className="text-slate-400 text-sm">
                ✕
              </button>
            </div>

            {modoGrupo && (
              <div className="px-4 pt-3">
                <input
                  value={nombreGrupo}
                  onChange={(e) => setNombreGrupo(e.target.value)}
                  placeholder="Nombre del grupo"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2"
                />
                <p className="text-[10px] font-bold text-slate-400 tracking-wide mb-1">
                  ELIGE LOS PARTICIPANTES
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 divide-y divide-slate-100">
              {directorio.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => (modoGrupo ? toggleSeleccion(t.id) : iniciarPrivado(t.id))}
                  disabled={procesando}
                  className="w-full text-left py-2.5 flex items-center gap-2"
                >
                  {modoGrupo && (
                    <input
                      type="checkbox"
                      readOnly
                      checked={seleccion.includes(t.id)}
                      className="shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#153A5B] truncate">{t.nombre_completo}</p>
                    {t.cargo && <p className="text-xs text-slate-500 truncate">{t.cargo}</p>}
                  </div>
                </button>
              ))}
              {directorio.length === 0 && (
                <p className="text-sm text-slate-400 py-6 text-center">Cargando…</p>
              )}
            </div>

            {mensajeModal && <p className="text-xs text-red-600 px-4 pt-2">{mensajeModal}</p>}

            {modoGrupo && (
              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={crearGrupo}
                  disabled={procesando}
                  className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm disabled:opacity-50"
                >
                  {procesando ? 'Creando…' : 'Crear grupo'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: participantes del grupo */}
      {mostrarParticipantes && activa && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-[#153A5B]">Participantes</p>
              <button onClick={() => setMostrarParticipantes(false)} className="text-slate-400 text-sm">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 px-4">
              {participantes.map((p) => (
                <div key={p.trabajador_id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#153A5B] truncate">
                      {p.trabajadores?.nombre_completo || 'Trabajador'}
                      {p.trabajador_id === perfil.id ? ' (tú)' : ''}
                    </p>
                    {p.es_admin && <p className="text-[10px] text-slate-500">Administrador del grupo</p>}
                  </div>
                  {activa.es_admin && p.trabajador_id !== perfil.id && (
                    <button
                      onClick={() => quitarParticipante(p.trabajador_id)}
                      className="text-[10px] font-bold text-red-600 shrink-0"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 space-y-2">
              {!activa.es_admin && (
                <button
                  onClick={salirDelGrupo}
                  className="w-full text-xs font-bold text-red-700 bg-red-100 rounded-lg py-2"
                >
                  Salir del grupo
                </button>
              )}
              {activa.es_admin && !confirmarEliminarGrupo && (
                <button
                  onClick={() => setConfirmarEliminarGrupo(true)}
                  className="w-full text-xs font-bold text-red-700 bg-red-100 rounded-lg py-2"
                >
                  Eliminar grupo
                </button>
              )}
              {activa.es_admin && confirmarEliminarGrupo && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmarEliminarGrupo(false)}
                    className="flex-1 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg py-2"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={eliminarGrupoActivo}
                    className="flex-1 text-xs font-bold text-white bg-red-600 rounded-lg py-2"
                  >
                    Confirmar eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
