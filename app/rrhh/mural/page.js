'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import MuralInteracciones from '@/components/MuralInteracciones';
import { sanitizeFileName } from '@/lib/sanitizeFileName';
import Avatar from '@/components/Avatar';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function MuralRRHH() {
  return (
    <Suspense fallback={null}>
      <MuralRRHHContenido />
    </Suspense>
  );
}

function MuralRRHHContenido() {
  const { perfil } = useAuth();
  const searchParams = useSearchParams();
  const postDestacado = searchParams.get('post');
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({
    titulo: '',
    contenido: '',
    tipo: 'comunicado',
    fecha_expiracion: '',
  });
  const [imagenFile, setImagenFile] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [ampliadas, setAmpliadas] = useState({});
  const fileInputRef = useRef(null);

  function toggleAmpliada(id) {
    setAmpliadas((a) => ({ ...a, [id]: !a[id] }));
  }

  async function cargar() {
    const { data } = await supabase
      .from('publicaciones_mural')
      .select('*, trabajadores(nombre_completo, avatar_url)')
      .order('publicado_en', { ascending: false });
    setLista(data || []);
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (!postDestacado || lista.length === 0) return;
    const el = document.getElementById(`post-${postDestacado}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [postDestacado, lista]);

  function handleImagen(e) {
    setImagenFile(e.target.files[0] || null);
  }

  async function publicar(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');

    let imagen_url = null;
    if (imagenFile) {
      const nombreArchivo = `${Date.now()}_${sanitizeFileName(imagenFile.name)}`;
      const { error: errorSubida } = await supabase.storage
        .from('mural')
        .upload(nombreArchivo, imagenFile);
      if (errorSubida) {
        setEnviando(false);
        setMensaje('Error subiendo la imagen: ' + errorSubida.message);
        return;
      }
      const { data: urlData } = supabase.storage.from('mural').getPublicUrl(nombreArchivo);
      imagen_url = urlData.publicUrl;
    }

    const { error } = await supabase
      .from('publicaciones_mural')
      .insert({ ...form, imagen_url, publicado_por: perfil.id });

    setEnviando(false);
    if (error) {
      setMensaje('Error: ' + error.message);
      return;
    }
    setForm({ titulo: '', contenido: '', tipo: 'comunicado', fecha_expiracion: '' });
    setImagenFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('publicaciones_mural').delete().eq('id', id);
    cargar();
  }

  const hoy = hoyISO();

  return (
    <AppShell links={rrhhLinks} titulo="Diario mural" requiereRRHH>
      <form onSubmit={publicar} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-sm font-bold text-[#153A5B]">Nueva publicación</p>
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
          <label className="text-xs text-slate-500">Imagen (opcional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImagen}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
          {imagenFile && (
            <p className="text-[10px] text-slate-400 mt-1">Seleccionada: {imagenFile.name}</p>
          )}
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
        <button
          disabled={enviando}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
        >
          {enviando ? 'Publicando…' : 'Publicar'}
        </button>
        {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
      </form>

      <div className="space-y-3">
        {lista.map((p) => {
          const expirada = p.fecha_expiracion && p.fecha_expiracion < hoy;
          return (
            <div
              key={p.id}
              id={`post-${p.id}`}
              className={`bg-white rounded-xl border p-4 ${
                postDestacado === p.id
                  ? 'border-[#0F5C8C] ring-2 ring-[#0F5C8C]/30'
                  : expirada
                  ? 'border-slate-200 opacity-50'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Avatar url={p.trabajadores?.avatar_url} nombre={p.trabajadores?.nombre_completo} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#153A5B]">
                      {p.trabajadores?.nombre_completo || 'Gestión RRHH'}
                    </p>
                    <p className="text-[10px] text-slate-400">{tiempoRelativoPost(p.publicado_en)}</p>
                    <p className="text-sm font-bold text-[#153A5B] mt-2">{p.titulo}</p>
                    <p className="text-xs text-slate-500 mt-1">{p.contenido}</p>
                    {p.imagen_url && (
                      <img
                        src={p.imagen_url}
                        alt={p.titulo}
                        onClick={() => toggleAmpliada(p.id)}
                        className={`mt-2 rounded-lg border border-slate-200 w-full object-contain bg-slate-50 cursor-zoom-in transition-all ${
                          ampliadas[p.id] ? 'max-h-[80vh] cursor-zoom-out' : 'max-h-96'
                        }`}
                      />
                    )}
                    <p className="text-[10px] text-slate-400 mt-2">
                      {p.fecha_expiracion
                        ? expirada
                          ? `Expiró el ${p.fecha_expiracion}`
                          : `Expira el ${p.fecha_expiracion}`
                        : 'Sin fecha de expiración'}
                    </p>
                    {perfil && (
                      <MuralInteracciones
                        publicacionId={p.id}
                        trabajadorId={perfil.id}
                        puedeModerar
                        abrirComentariosInicial={postDestacado === p.id}
                      />
                    )}
                  </div>
                </div>
                <button
                  onClick={() => eliminar(p.id)}
                  className="text-xs font-bold text-red-700 bg-red-100 rounded-lg px-3 py-2 shrink-0"
                >
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}
        {lista.length === 0 && <p className="text-sm text-slate-400">Aún no hay publicaciones.</p>}
      </div>
    </AppShell>
  );
}