'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';

const vacio = {
  nombre_completo: '',
  rut: '',
  email: '',
  cargo: '',
  area_id: '',
  jefe_directo_id: '',
  fecha_ingreso: '',
  fecha_nacimiento: '',
  dias_pendientes_base: 0,
  dias_progresivos_reconocidos: 0,
  roles: ['trabajador'],
};

export default function TrabajadoresRRHH() {
  const [lista, setLista] = useState([]);
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState(vacio);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);

  async function cargar() {
    const { data } = await supabase
      .from('trabajadores')
      .select('*, areas(nombre)')
      .order('nombre_completo');
    setLista(data || []);
    const { data: a } = await supabase.from('areas').select('*').order('nombre');
    setAreas(a || []);
  }

  useEffect(() => {
    cargar();
  }, []);

  function toggleRol(rol) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(rol) ? f.roles.filter((r) => r !== rol) : [...f.roles, rol],
    }));
  }

  async function crear(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');
    const res = await fetch('/api/admin/create-trabajador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setMensaje('Error: ' + data.error);
      return;
    }
    setMensaje('Trabajador creado. Se le envió una invitación por correo.');
    setForm(vacio);
    setMostrarForm(false);
    cargar();
  }

  return (
    <AppShell links={rrhhLinks} titulo="Trabajadores" requiereRRHH>
      <button
        onClick={() => setMostrarForm((v) => !v)}
        className="w-full bg-[#153A5B] text-white font-bold rounded-lg py-3 text-sm mb-4"
      >
        {mostrarForm ? 'Cancelar' : '+ Nuevo trabajador'}
      </button>

      {mostrarForm && (
        <form onSubmit={crear} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Nombre completo"
              value={form.nombre_completo}
              onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="RUT"
              value={form.rut}
              onChange={(e) => setForm({ ...form, rut: e.target.value })}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <input
            required
            type="email"
            placeholder="Correo"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Cargo"
              value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={form.area_id}
              onChange={(e) => setForm({ ...form, area_id: e.target.value })}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Área</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <select
            value={form.jefe_directo_id}
            onChange={(e) => setForm({ ...form, jefe_directo_id: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Jefe directo (opcional)</option>
            {lista.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre_completo}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Fecha de ingreso</label>
              <input
                required
                type="date"
                value={form.fecha_ingreso}
                onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Fecha de nacimiento</label>
              <input
                type="date"
                value={form.fecha_nacimiento}
                onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Vacaciones pendientes a la fecha</label>
              <input
                type="number"
                step="0.5"
                value={form.dias_pendientes_base}
                onChange={(e) => setForm({ ...form, dias_pendientes_base: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Días progresivos a la fecha</label>
              <input
                type="number"
                step="0.5"
                value={form.dias_progresivos_reconocidos}
                onChange={(e) =>
                  setForm({ ...form, dias_progresivos_reconocidos: Number(e.target.value) })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Roles</label>
            <div className="flex gap-3 flex-wrap">
              {['trabajador', 'jefatura', 'rrhh', 'administrador'].map((r) => (
                <label key={r} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRol(r)} />
                  {r}
                </label>
              ))}
            </div>
          </div>
          <button
            disabled={enviando}
            className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
          >
            {enviando ? 'Creando…' : 'Crear e invitar por correo'}
          </button>
          {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {lista.map((t) => (
          <div key={t.id} className="px-4 py-3">
            <p className="text-sm font-bold text-[#153A5B]">{t.nombre_completo}</p>
            <p className="text-xs text-slate-500">
              {t.cargo || 'Sin cargo'} · {t.areas?.nombre || 'Sin área'} · {t.rut}
            </p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
