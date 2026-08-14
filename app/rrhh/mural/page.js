'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import MuralPost from '@/components/MuralPost';
import { rrhhLinks } from '@/lib/navLinks';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const FORM_VACIO = { titulo: '', contenido: '', tipo: 'comunicado', fecha_expiracion: '' };

export default function MuralRRHH() {
  const { perfil } = useAuth();
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [imagenFile, setImagenFile] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const fileInputRef = useRef(null);

  async function cargar() {
    const { data } = await supabase
      .from('publicaciones_mural')
      .select('*')
      .order('publicado_en', { ascending: false });
    setLista(data || []);
  }

  useEffect(() => {
    cargar();
  }, []);

  function handleImagen(e) {
    setImagenFile(e.target.files[0] || null);
  }

  function onEditar(post) {
    setEditandoId(post.id);
    setForm({
      titulo: post.titulo,
      contenido: post.contenido || '',
      tipo: post.tipo,
      fecha_expiracion: post.fecha_expiracion || '',
    });
    setImagenFile(null);
    setMensaje('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setImagenFile(null);
    setMensaje('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Crea una notificación para cada trabajador activo (menos quien publica)
  // avisando de la nueva publicación. No detiene el flujo si falla: la
  // publicación ya quedó creada de todas formas.
  async function notificarNuevaPublicacion(post) {
    try {
      const { data: activos } = await supabase
        .from('trabajadores')
        .select('id')
        .eq('estado', 'activo')
        .neq('id', perfil.id);
      if (!activos || activos.length === 0) return;
      const filas = activos.map((t) => ({
        trabajador_id: t.id,
        tipo: 'mural',
        titulo: 'Nueva publicación en el mural',
        mensaje: post.titulo,
        referencia_tabla: 'publicaciones_mural',
        referencia_id: post.id,
      }));
      await supabase.from('notificaciones').insert(filas);
    } catch (e) {
      // silencioso: no bloquear la publicación por un error de notificación
    }
  }

  async function publicar(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');

    // undefined = no tocar la imagen actual (solo aplica al editar sin elegir una nueva)
    let imagen_url = editandoId ? undefined : null;

    if (imagenFile) {
      const nombreArchivo = `${Date.now()}_${imagenFile.name.replace(/\s+/g, '_')}`;
      const { error: errorSubida } = await supabase.storage.from('mural').upload(nombreArchivo, imagenFile);
      if (errorSubida) {
        setEnviando(false);
        setMensaje('Error subiendo la imagen: ' + errorSubida.message);
        return;
      }
      const { data: urlData } = supabase.storage.from('mural').getPublicUrl(nombreArchivo);
      imagen_url = urlData.publicUrl;
    }

    if (editandoId) {
      const cambios = { ...form };
      if (imagen_url !== undefined) cambios.imagen_url = imagen_url;
      const { error } = await supabase.from('publicaciones_mural').update(cambios).eq('id', editandoId);
      setEnviando(false);
      if (error) {
        setMensaje('Error: ' + error.message);
        return;
      }
      cancelarEdicion();
      cargar();
      return;
    }

    const { data: nuevo, error } = await supabase
      .from('publicaciones_mural')
      .insert({ ...form, imagen_url, publicado_por: perfil.id })
      .select()
      .single();

    setEnviando(false);
    if (error) {
      setMensaje('Error: ' + error.message);
      return;
    }
    if (nuevo) await notificarNuevaPublicacion(nuevo);
    setForm(FORM_VACIO);
    setImagenFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('publicaciones_mural').delete().eq('id', id);
    if (editandoId === id) cancelarEdicion();
    cargar();
  }

  const hoy = hoyISO();

  return (
    <AppShell links={rrhhLinks} titulo="Diario mural" requiereRRHH>
      <form onSubmit={publicar} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-sm font-bold text-[#153A5B]">{editandoId ? 'Editar publicación' : 'Nueva publicación'}</p>
        <input
          required
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
          placeholder="Título"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <textarea
          value={form.contenido}
          onChange={(e) => setForm({ ...form, contenido: e.target.value })}
          placeholder="Contenido"
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="comunicado">Comunicado</option>
          <option value="circular">Circular</option>
          <option value="curso">Curso</option>
          <option value="imagen">Imagen</option>
        </select>
        <div>
          <label className="text-xs text-slate-500">
            Imagen (opcional){editandoId ? ' — deja vacío para mantener la actual' : ''}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImagen}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
          {imagenFile && <p className="text-[10px] text-slate-400 mt-1">Seleccionada: {imagenFile.name}</p>}
        </div>
        <div>
          <label className="text-xs text-slate-500">
            Fecha de expiración (después de esta fecha deja de mostrarse en el mural)
          </label>
          <input
            required
            type="date"
            min={hoy}
            value={form.fecha_expiracion}
            onChange={(e) => setForm({ ...form, fecha_expiracion: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button disabled={enviando} className="flex-1 bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm">
            {enviando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Publicar'}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="text-sm font-bold text-slate-500 border border-slate-300 rounded-lg px-4"
            >
              Cancelar
            </button>
          )}
        </div>
        {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
      </form>

      <div className="space-y-3">
        {lista.map((p) => {
          const expirada = p.fecha_expiracion && p.fecha_expiracion < hoy;
          return (
            <MuralPost
              key={p.id}
              post={p}
              perfil={perfil}
              esRRHH
              expirada={expirada}
              onEditar={onEditar}
              onEliminar={eliminar}
            />
          );
        })}
        {lista.length === 0 && <p className="text-sm text-slate-400">Aún no hay publicaciones.</p>}
      </div>
    </AppShell>
  );
}
