'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import Avatar from '@/components/Avatar';

const vacio = {
  nombre_completo: '',
  rut: '',
  email: '',
  cargo: '',
  area_id: '',
  jefe_directo_id: '',
  fecha_ingreso: '',
  fecha_nacimiento: '',
  tipo_contrato: 'INDEFINIDO',
  registra_asistencia: 'SI',
  dias_pendientes_base: 0,
  dias_progresivos_reconocidos: 0,
  roles: ['trabajador'],
};

export default function TrabajadoresRRHH() {
  const { roles, perfil, recargarPerfil } = useAuth();
  const esAdministrador = roles.includes('administrador');

  const [lista, setLista] = useState([]);
  const [rolesPorTrabajador, setRolesPorTrabajador] = useState({});
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
  const [claveNueva, setClaveNueva] = useState('');
  const [asignandoClave, setAsignandoClave] = useState(false);
  const [mensajeClave, setMensajeClave] = useState('');

  async function cargar() {
    const { data } = await supabase
      .from('trabajadores')
      .select('*, areas(nombre)')
      .order('nombre_completo');
    // avatar_url ya viene incluido por el select('*')
    setLista(data || []);
    const { data: a } = await supabase.from('areas').select('*').order('nombre');
    setAreas(a || []);
    const { data: rolesData } = await supabase.from('trabajador_roles').select('trabajador_id, rol');
    const mapa = {};
    (rolesData || []).forEach((r) => {
      mapa[r.trabajador_id] = [...(mapa[r.trabajador_id] || []), r.rol];
    });
    setRolesPorTrabajador(mapa);
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

  function toggleRolEdit(rol) {
    setEditForm((f) => ({
      ...f,
      roles: f.roles.includes(rol) ? f.roles.filter((r) => r !== rol) : [...f.roles, rol],
    }));
  }

  async function crear(e) {
    e.preventDefault();
    if (!form.roles.length) {
      setMensaje('Debes dejar marcado al menos un rol (normalmente "trabajador").');
      return;
    }
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

  async function abrirEdicion(t) {
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
      tipo_contrato: t.tipo_contrato || 'INDEFINIDO',
      registra_asistencia: t.registra_asistencia || 'SI',
      estado: t.estado || 'activo',
      roles: rolesPorTrabajador[t.id] || [],
      dias_pendientes_base: 0,
      dias_progresivos_reconocidos: 0,
    });

    const { data: saldo } = await supabase
      .from('vacaciones_saldo_inicial')
      .select('dias_pendientes_base, dias_progresivos_reconocidos')
      .eq('trabajador_id', t.id)
      // Desempata por creado_en (fecha y hora exacta) para no quedarse con
      // una edición vieja del mismo día cuando fecha_corte empata.
      .order('fecha_corte', { ascending: false })
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (saldo) {
      setEditForm((f) =>
        f
          ? {
              ...f,
              dias_pendientes_base: saldo.dias_pendientes_base || 0,
              dias_progresivos_reconocidos: saldo.dias_progresivos_reconocidos || 0,
            }
          : f
      );
    }
  }

  function cerrarEdicion() {
    setEditandoId(null);
    setEditForm(null);
    setClaveNueva('');
    setMensajeClave('');
  }

  async function asignarClave(trabajadorId) {
    if (claveNueva.length < 6) {
      setMensajeClave('La clave debe tener al menos 6 caracteres.');
      return;
    }
    setAsignandoClave(true);
    setMensajeClave('');
    const { data: sesion } = await supabase.auth.getSession();
    const token = sesion?.session?.access_token;
    const res = await fetch('/api/admin/set-clave-trabajador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ trabajador_id: trabajadorId, clave: claveNueva }),
    });
    const data = await res.json();
    setAsignandoClave(false);
    if (!res.ok) {
      setMensajeClave('Error: ' + data.error);
      return;
    }
    setMensajeClave('Clave asignada. Entrégasela al trabajador para que ingrese.');
    setClaveNueva('');
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    if (!editForm.roles.length) {
      setMensaje(
        '⚠️ Debes dejar marcado al menos un rol (normalmente "trabajador") antes de guardar — si no, esa persona queda sin acceso a la app.'
      );
      return;
    }
    setGuardandoEdicion(true);
    setMensaje('');
    // Todo el guardado va envuelto en try/catch: si cualquier paso lanza una
    // excepción inesperada (por ejemplo, el servidor devuelve un error que
    // no es JSON y el .json() falla al parsearlo), antes quedaba como una
    // promesa rechazada sin manejar — el botón se quedaba pegado en
    // "Guardando…" y no aparecía ningún mensaje, dando la sensación de que
    // "no pasó nada" aunque en realidad algo sí falló.
    try {
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
          tipo_contrato: editForm.tipo_contrato || null,
          registra_asistencia: editForm.registra_asistencia || null,
          estado: editForm.estado,
        })
        .eq('id', editandoId);
      if (error) {
        setGuardandoEdicion(false);
        setMensaje('❌ Error al guardar los datos: ' + error.message);
        return;
      }

      // Los roles se actualizan por una ruta de servidor (no directo desde
      // el navegador) — así, si estás editando TU PROPIO perfil y te sacas
      // momentáneamente el rol rrhh/administrador a mitad del reemplazo, el
      // guardado no queda a medio camino ni te deja sin acceso: la ruta usa
      // la llave de servicio, que no depende de la RLS que sí exige tener
      // ese rol en el momento exacto de cada operación.
      const { data: sesionRoles } = await supabase.auth.getSession();
      const tokenRoles = sesionRoles?.session?.access_token;
      const resRoles = await fetch('/api/admin/actualizar-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRoles}` },
        body: JSON.stringify({ trabajador_id: editandoId, roles: editForm.roles }),
      });
      if (!resRoles.ok) {
        const dataRoles = await resRoles.json().catch(() => ({}));
        setGuardandoEdicion(false);
        setMensaje('❌ Error al actualizar roles: ' + (dataRoles.error || `Error ${resRoles.status}`));
        return;
      }

      // Si te estás editando a ti mismo (ej. te agregaste un rol nuevo),
      // el contexto de sesión (useAuth) quedó con los roles viejos en
      // memoria — sin esto, el rol recién guardado no aparece en la app
      // hasta cerrar sesión o recargar la página entera.
      if (perfil?.id === editandoId) {
        await recargarPerfil();
      }

      const resVacaciones = await fetch('/api/admin/actualizar-vacaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trabajador_id: editandoId,
          dias_pendientes_base: editForm.dias_pendientes_base,
          dias_progresivos_reconocidos: editForm.dias_progresivos_reconocidos,
        }),
      });
      if (!resVacaciones.ok) {
        const dataVacaciones = await resVacaciones.json().catch(() => ({}));
        setGuardandoEdicion(false);
        setMensaje(
          '⚠️ Se guardaron los datos y los roles, pero hubo un error con las vacaciones: ' +
            (dataVacaciones.error || `Error ${resVacaciones.status}`)
        );
        cargar();
        return;
      }

      setGuardandoEdicion(false);
      setMensaje(
        `✅ Guardado. Vacaciones: saldo "al día" quedó registrado hoy (${editForm.dias_pendientes_base} pendientes + ${editForm.dias_progresivos_reconocidos} progresivos).`
      );
      cerrarEdicion();
      cargar();
    } catch (err) {
      setGuardandoEdicion(false);
      setMensaje('❌ Error inesperado al guardar: ' + (err?.message || String(err)));
    }
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
              <label className="text-xs text-slate-500">Tipo de contrato</label>
              <select
                value={form.tipo_contrato}
                onChange={(e) => setForm({ ...form, tipo_contrato: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="INDEFINIDO">Indefinido</option>
                <option value="PLAZO_FIJO">Plazo fijo</option>
                <option value="POR_OBRA">Por obra o faena</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Registra asistencia</label>
              <select
                value={form.registra_asistencia}
                onChange={(e) => setForm({ ...form, registra_asistencia: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="SI">Sí</option>
                <option value="NO">No</option>
                <option value="ART22">Art. 22 (exento)</option>
              </select>
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
              <label className="text-xs text-slate-500">
                Días progresivos a la fecha
                <span className="block text-[10px] text-slate-400 font-normal">
                  Desde hoy, se suma 1 día más cada 3 años
                </span>
              </label>
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
              {['trabajador', 'jefatura', 'rrhh', 'administrador', 'rendicion_gastos'].map((r) => (
                <label key={r} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRol(r)} />
                  {r === 'rendicion_gastos' ? 'rendición de gastos' : r}
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

      {mensaje && !mostrarForm && (
        <p
          className={`text-xs font-bold rounded-lg px-3 py-2 mb-3 border ${
            mensaje.startsWith('✅')
              ? 'text-green-700 bg-green-50 border-green-200'
              : mensaje.startsWith('⚠️')
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-red-700 bg-red-50 border-red-200'
          }`}
        >
          {mensaje}
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {lista.map((t) => (
          <div key={t.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar url={t.avatar_url} nombre={t.nombre_completo} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#153A5B] truncate">
                    {t.nombre_completo}
                    {t.estado === 'inactivo' && (
                      <span className="ml-2 text-[10px] font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                        inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {t.cargo || 'Sin cargo'} · {t.areas?.nombre || 'Sin área'} · {t.rut}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link
                  href={`/rrhh/trabajadores/${t.id}`}
                  className="text-xs font-bold text-[#153A5B] bg-slate-100 rounded-lg px-3 py-2"
                >
                  Ver perfil
                </Link>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Tipo de contrato</label>
                    <select
                      value={editForm.tipo_contrato}
                      onChange={(e) => setEditForm({ ...editForm, tipo_contrato: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="INDEFINIDO">Indefinido</option>
                      <option value="PLAZO_FIJO">Plazo fijo</option>
                      <option value="POR_OBRA">Por obra o faena</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Registra asistencia</label>
                    <select
                      value={editForm.registra_asistencia}
                      onChange={(e) => setEditForm({ ...editForm, registra_asistencia: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="SI">Sí</option>
                      <option value="NO">No</option>
                      <option value="ART22">Art. 22 (exento)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Vacaciones pendientes a la fecha</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editForm.dias_pendientes_base}
                      onChange={(e) =>
                        setEditForm({ ...editForm, dias_pendientes_base: Number(e.target.value) })
                      }
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">
                Días progresivos a la fecha
                <span className="block text-[10px] text-slate-400 font-normal">
                  Desde hoy, se suma 1 día más cada 3 años
                </span>
              </label>
                    <input
                      type="number"
                      step="0.5"
                      value={editForm.dias_progresivos_reconocidos}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          dias_progresivos_reconocidos: Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 -mt-2">
                  Al guardar se registra como el saldo "al día" desde hoy — no borra el historial anterior.
                </p>
                <select
                  value={editForm.estado}
                  onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Nivel de acceso (roles)</label>
                  <div className="flex gap-3 flex-wrap">
                    {['trabajador', 'jefatura', 'rrhh', 'administrador', 'rendicion_gastos'].map((r) => (
                      <label key={r} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={editForm.roles.includes(r)}
                          onChange={() => toggleRolEdit(r)}
                        />
                        {r === 'rendicion_gastos' ? 'rendición de gastos' : r}
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  disabled={guardandoEdicion}
                  className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
                >
                  {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
                </button>

                <div className="pt-3 border-t border-slate-100">
                  <label className="text-xs text-slate-500 block mb-1">
                    Asignar clave de acceso
                    <span className="block text-[10px] text-slate-400 font-normal">
                      Úsalo si el trabajador no tiene o perdió su clave. Esta clave queda activa de
                      inmediato — si luego el trabajador cambia su propia clave desde su perfil, esta
                      deja de servir.
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nueva clave (mín. 6 caracteres)"
                      value={claveNueva}
                      onChange={(e) => setClaveNueva(e.target.value)}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => asignarClave(t.id)}
                      disabled={asignandoClave}
                      className="shrink-0 text-xs font-bold text-white bg-[#153A5B] rounded-lg px-3 py-2 disabled:opacity-60"
                    >
                      {asignandoClave ? 'Asignando…' : 'Asignar'}
                    </button>
                  </div>
                  {mensajeClave && <p className="text-xs text-slate-500 mt-1">{mensajeClave}</p>}
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
