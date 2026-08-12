'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';

export default function MuralRRHH() {
  const { perfil } = useAuth();
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ titulo: '', contenido: '', tipo: 'comunicado' });
  const [enviando, setEnviando] = useState(false);

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

  async function publicar(e) {
    e.preventDefault();
    setEnviando(true);
    await supabase.from('publicaciones_mural').insert({ ...form, publicado_por: perfil.id });
    setEnviando(false);
    setForm({ titulo: '', contenido: '', tipo: 'comunicado' });
    cargar();
  }

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
        <button
          disabled={enviando}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
        >
          {enviando ? 'Publicando…' : 'Publicar'}
        </button>
      </form>

      <div className="space-y-3">
        {lista.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-bold text-[#153A5B]">{p.titulo}</p>
            <p className="text-xs text-slate-500 mt-1">{p.contenido}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
