'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';

export default function DocumentosRRHH() {
  const { perfil } = useAuth();
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ titulo: '', categoria: 'reglamento' });
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function cargar() {
    const { data } = await supabase
      .from('documentos')
      .select('*, documentos_versiones(id, version, storage_path, vigente)')
      .order('created_at', { ascending: false });
    setLista(data || []);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(e) {
    e.preventDefault();
    if (!archivo) {
      setMensaje('Selecciona un archivo.');
      return;
    }
    setSubiendo(true);
    setMensaje('');

    const { data: doc, error } = await supabase
      .from('documentos')
      .insert({ titulo: form.titulo, categoria: form.categoria, creado_por: perfil.id })
      .select()
      .single();

    if (error) {
      setMensaje('Error: ' + error.message);
      setSubiendo(false);
      return;
    }

    const path = `${doc.id}/v1-${archivo.name}`;
    const { error: upErr } = await supabase.storage.from('documentos').upload(path, archivo);
    if (upErr) {
      setMensaje('Error subiendo archivo: ' + upErr.message);
      setSubiendo(false);
      return;
    }

    await supabase
      .from('documentos_versiones')
      .insert({ documento_id: doc.id, version: 1, storage_path: path, publicado_por: perfil.id });

    setSubiendo(false);
    setForm({ titulo: '', categoria: 'reglamento' });
    setArchivo(null);
    setMensaje('Documento publicado.');
    cargar();
  }

  return (
    <AppShell links={rrhhLinks} titulo="Reglamento y políticas" requiereRRHH>
      <form onSubmit={crear} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-sm font-bold text-[#153A5B]">Publicar documento</p>
        <input
          required
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
          placeholder="Título"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={form.categoria}
          onChange={(e) => setForm({ ...form, categoria: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="reglamento">Reglamento interno</option>
          <option value="politica">Política</option>
        </select>
        <input
          required
          type="file"
          accept="application/pdf"
          onChange={(e) => setArchivo(e.target.files[0])}
          className="w-full text-sm"
        />
        <button
          disabled={subiendo}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
        >
          {subiendo ? 'Publicando…' : 'Publicar'}
        </button>
        {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
      </form>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {lista.map((d) => (
          <div key={d.id} className="px-4 py-3">
            <p className="text-sm font-bold text-[#153A5B]">{d.titulo}</p>
            <p className="text-xs text-slate-500 capitalize">
              {d.categoria} · {d.documentos_versiones?.length || 0} versión(es)
            </p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
