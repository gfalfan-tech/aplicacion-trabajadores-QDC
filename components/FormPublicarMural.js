'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { sanitizeFileName } from '@/lib/sanitizeFileName';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Formulario "Nueva publicación" del Diario mural. Lo usan el panel RR.HH.
// y los trabajadores con el rol 'publicar_mural'.
export default function FormPublicarMural({ trabajadorId, onPublicado }) {
  const [form, setForm] = useState({
    titulo: '',
    contenido: '',
    tipo: 'comunicado',
    fecha_expiracion: '',
  });
  const [imagenFile, setImagenFile] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const fileInputRef = useRef(null);
  const hoy = hoyISO();

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
      .insert({ ...form, imagen_url, publicado_por: trabajadorId });

    setEnviando(false);
    if (error) {
      setMensaje('Error: ' + error.message);
      return;
    }
    setForm({ titulo: '', contenido: '', tipo: 'comunicado', fecha_expiracion: '' });
    setImagenFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onPublicado?.();
  }

  return (
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
  );
}
