'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';

export default function FeriadosRRHH() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ fecha: '', nombre: '' });
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function cargar() {
    const { data } = await supabase.from('feriados').select('*').order('fecha');
    setLista(data || []);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function agregar(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');
    const { error } = await supabase
      .from('feriados')
      .upsert({ fecha: form.fecha, nombre: form.nombre.trim() });
    setEnviando(false);
    if (error) {
      setMensaje('Error: ' + error.message);
      return;
    }
    setForm({ fecha: '', nombre: '' });
    cargar();
  }

  async function eliminar(fecha) {
    await supabase.from('feriados').delete().eq('fecha', fecha);
    cargar();
  }

  const porAnio = lista.reduce((acc, f) => {
    const anio = f.fecha.slice(0, 4);
    acc[anio] = acc[anio] || [];
    acc[anio].push(f);
    return acc;
  }, {});

  return (
    <AppShell links={rrhhLinks} titulo="Feriados" requiereRRHH>
      <Link href="/rrhh" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver al Dashboard
      </Link>

      <p className="text-xs text-slate-500 mb-4">
        Estos feriados se descuentan como "0" al calcular los días hábiles de una solicitud de
        vacaciones (junto con sábados y domingos, que siempre se excluyen). Cada año hay que agregar
        los feriados del año siguiente — algunos (como San Pedro y San Pablo o el Encuentro de Dos
        Mundos) se corren al lunes más cercano y cambian de fecha exacta año a año.
      </p>

      <form onSubmit={agregar} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-sm font-bold text-[#153A5B]">Agregar feriado</p>
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            type="date"
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Nombre (ej. Año Nuevo)"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          disabled={enviando}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
        >
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        {mensaje && <p className="text-xs text-red-600">{mensaje}</p>}
      </form>

      {Object.keys(porAnio)
        .sort()
        .map((anio) => (
          <div key={anio} className="mb-6">
            <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">{anio}</p>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {porAnio[anio].map((f) => (
                <div key={f.fecha} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#153A5B]">{f.nombre}</p>
                    <p className="text-xs text-slate-500">{f.fecha}</p>
                  </div>
                  <button
                    onClick={() => eliminar(f.fecha)}
                    className="text-xs font-bold text-red-700 bg-red-100 rounded-lg px-3 py-2 shrink-0"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      {lista.length === 0 && <p className="text-sm text-slate-400">Aún no hay feriados cargados.</p>}
    </AppShell>
  );
}
