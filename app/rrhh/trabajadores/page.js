'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
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
  const { roles } = useAuth();
  const esAdministrador = roles.includes('administrador');

  const [lista, setLista] = useState([]);
  const [areas, setAreas] = useState([]);
  const [form, setForm] = useState(vacio);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [confirmarEliminarId, setConfirmarEliminarId] = useState(null);

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

  function abrirEdicion(t) {
    setEditandoId(t.id);
    setEditForm({
      nombre_completo: t.nombre_completo || '',
      rut: t.rut || '',
      cargo: t.cargo || '',
      telefono: t.telefono || '',
      area_id: t.area_id || '',
      jefe_directo_id: t.jefe_directo_id || '',
      fecha_ingreso: t.fecha_ingreso || '',
      fecha_nacimiento: t.fecha_nacimiento || '',
      estado: t.estado || 'activo',
    });
  }

  function cerrarEdicion() {
    setEditandoId(null);
    setEditForm(null);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setGuardandoEdicion(true);
    const { error } = await supabase
      .from('trabajadores')
      .update({
        nombre_completo: editForm.nombre_completo,
        rut: editForm.rut,
        cargo: editForm.cargo || null,
        telefono: editForm.telefono || null,
        area_id: editForm.area_id || null,
        jefe_directo_id: editForm.jefe_directo_id || null,
        fecha_ingreso: editForm.fecha_ingreso,
        fecha_nacimiento: editForm.fecha_nacimiento || null,
        estado: editForm.estado,
      })
      .eq('id', editandoId);
    setGuardandoEdicion(false);
    if (error) {
      setMensaje('Error al guardar: ' + error.message);
      return;
    }
    cerrarEdicion();
    cargar();
  }

  async function eliminar(id) {
    setEliminandoId(id);
    const res = await fetch('/api/admin/delete-trabajador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    setEliminandoId(null);
    setConfirmarEliminarId(null);
    if (!res.ok) {
      setMensaje('Error al eliminar: ' + data.error);
      return;
    }
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

      {mensaje && !mostrarForm && <p className="text-xs text-slate-500 mb-3">{mensaje}</p>}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {lista.map((t) => (
          <div key={t.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#153A5B]">
                  {t.nombre_completo}
                  {t.estado === 'inactivo' && (
                    <span className="ml-2 text-[10px] font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                      inactivo
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {t.cargo || 'Sin cargo'} · {t.areas?.nombre || 'Sin área'} · {t.rut}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => (editandoId === t.id ? cerrarEdicion() : abrirEdicion(t))}
                  className="text-xs font-bold text-[#0F5C8C] border border-slate-200 rounded-lg px-3 py-2"
                >
                  {editandoId === t.id ? 'Cerrar' : 'Editar'}
                </button>
                {esAdministrador &&
                  (confirmarEliminarId === t.id ? (
                    <button
                      onClick={() => eliminar(t.id)}
                      disabled={eliminandoId === t.id}
                      className="text-xs font-bold text-white bg-red-600 rounded-lg px-3 py-2"
                    >
                      {eliminandoId === t.id ? 'Eliminando…' : 'Confirmar'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmarEliminarId(t.id)}
                      className="text-xs font-bold text-red-700 bg-red-100 rounded-lg px-3 py-2"
                    >
                      Eliminar
                    </button>
                  ))}
              </div>
            </div>

            {editandoId === t.id && editForm && (
              <form onSubmit={guardarEdicion} className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Nombre completo"
                    value={editForm.nombre_completo}
                    onChange={(e) => setEditForm({ ...editForm, nombre_completo: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="RUT"
                    value={editForm.rut}
                    onChange={(e) => setEditForm({ ...editForm, rut: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="Cargo"
                    value={editForm.cargo}
                    onChange={(e) => setEditForm({ ...editForm, cargo: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Teléfono"
                    value={editForm.telefono}
                    onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={editForm.area_id}
                    onChange={(e) => setEditForm({ ...editForm, area_id: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Área</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                  <select
                    value={editForm.jefe_directo_id}
                    onChange={(e) => setEditForm({ ...editForm, jefe_directo_id: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Jefe directo</option>
                    {lista
                      .filter((l) => l.id !== t.id)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nombre_completo}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Fecha de ingreso</label>
                    <input
                      required
                      type="date"
                      value={editForm.fecha_ingreso}
                      onChange={(e) => setEditForm({ ...editForm, fecha_ingreso: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Fecha de nacimiento</label>
                    <input
                      type="date"
                      value={editForm.fecha_nacimiento}
                      onChange={(e) => setEditForm({ ...editForm, fecha_nacimiento: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <select
                  value={editForm.estado}
                  onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
                <button
                  disabled={guardandoEdicion}
                  className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
                >
                  {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}