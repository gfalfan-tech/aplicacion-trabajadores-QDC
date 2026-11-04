'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import ModalTraslapeVacaciones from '@/components/ModalTraslapeVacaciones';
import AlertaPendientes from '@/components/AlertaPendientes';
import {
  obtenerTraslapes,
  obtenerVacacionesPendientesEquipo,
  resolverSolicitudVacaciones,
} from '@/lib/vacacionesEquipo';
import { obtenerPermisosPendientesEquipo, resolverSolicitudPermiso } from '@/lib/permisosEquipo';
import { obtenerContadorPapeletas } from '@/lib/papeletas';

export default function RRHHHome() {
  const { perfil } = useAuth();
  const [kpi, setKpi] = useState({ activos: 0, permisosPend: 0, vacacionesPend: 0 });
  const [pendientes, setPendientes] = useState([]);
  const [confirmando, setConfirmando] = useState(null);
  const [traslapes, setTraslapes] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [papeletasPend, setPapeletasPend] = useState(0);

  async function cargar() {
    const { count: activos } = await supabase
      .from('trabajadores')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'activo');

    // Igual que vacaciones, los permisos se piden a la API del servidor
    // (/api/permisos/pendientes): evita el error de PostgREST por embeber
    // "trabajadores" cuando la tabla tiene más de una relación con ella, y
    // si algo falla se avisa en pantalla en vez de mostrar la lista vacía.
    setErrorCarga('');
    const permisos = await obtenerPermisosPendientesEquipo().catch((err) => {
      setErrorCarga(err.message || 'No se pudieron cargar los permisos pendientes.');
      return [];
    });

    // Con la doble aprobación de vacaciones, lo que le toca resolver a
    // RR.HH. ya no es un simple ".eq('estado', 'pendiente')" — puede ser
    // 'pendiente' (sin jefe directo válido) o 'aprobada_jefe' (segunda
    // firma). /api/vacaciones/pendientes ya tiene esa lógica, así que se
    // reutiliza en vez de duplicarla acá.
    const vacaciones = await obtenerVacacionesPendientesEquipo().catch(() => []);

    setKpi({
      activos: activos || 0,
      permisosPend: permisos?.length || 0,
      vacacionesPend: vacaciones?.length || 0,
    });

    setPendientes([
      ...(permisos || []).map((p) => ({ ...p, origen: 'permiso', nombre: p.trabajador_nombre })),
      ...(vacaciones || []).map((v) => ({ ...v, origen: 'vacaciones', nombre: v.trabajador_nombre })),
    ]);
  }

  useEffect(() => {
    cargar();
    obtenerContadorPapeletas().then(setPapeletasPend);
  }, []);

  async function resolver(item, estado) {
    if (item.origen === 'permiso') {
      // Vía API: deja el comentario de rechazo y avisa al trabajador
      // (campanita + push), igual que cuando resuelve la jefatura.
      try {
        await resolverSolicitudPermiso(item.id, estado);
      } catch (err) {
        // Sin recargar, para que el mensaje de error no se borre.
        setErrorCarga(err.message || 'No se pudo resolver el permiso.');
        return;
      }
      cargar();
      return;
    }

    // Vacaciones: si es una aprobación, primero se revisa si hay gente de
    // la misma área con fechas cruzadas, para avisar antes de confirmar.
    if (estado === 'aprobada') {
      setConfirmando(item);
      setTraslapes(null);
      try {
        const t = await obtenerTraslapes(item.id);
        setTraslapes(t);
        if (t.length === 0) {
          await confirmarVacaciones(item, 'aprobada');
        }
      } catch (err) {
        setConfirmando(null);
      }
      return;
    }

    await confirmarVacaciones(item, estado);
  }

  async function confirmarVacaciones(item, estado) {
    setResolviendo(true);
    try {
      await resolverSolicitudVacaciones(item.id, estado);
      setConfirmando(null);
      setTraslapes(null);
      cargar();
    } finally {
      setResolviendo(false);
    }
  }

  return (
    <AppShell links={rrhhLinks} titulo="Panel de RR.HH." requiereRRHH>
      <AlertaPendientes
        enlaces={{
          certificados: '/rrhh/certificados',
          vacaciones: '/rrhh#pendientes-rrhh',
          permisos: '/rrhh#pendientes-rrhh',
          cajaChica: '/rrhh/caja-chica',
          rendicionGastos: '/trabajador/rendicion-gastos',
        }}
      />

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xl font-bold text-[#153A5B]">{kpi.activos}</p>
          <p className="text-[10px] text-slate-500">Trabajadores activos</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xl font-bold text-amber-600">{kpi.permisosPend}</p>
          <p className="text-[10px] text-slate-500">Permisos pendientes</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xl font-bold text-[#0F5C8C]">{kpi.vacacionesPend}</p>
          <p className="text-[10px] text-slate-500">Vacaciones pendientes</p>
        </div>
      </div>

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">GESTIÓN</p>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Link
          href="/rrhh/feriados"
          className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#0F5C8C] transition-colors"
        >
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm font-bold text-[#153A5B]">Feriados</p>
          <p className="text-xs text-slate-500 mt-0.5">Administrar</p>
        </Link>
        <Link
          href="/rrhh/asistencia"
          className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#0F5C8C] transition-colors"
        >
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm font-bold text-[#153A5B]">Asistencia</p>
          <p className="text-xs text-slate-500 mt-0.5">Subir reporte mensual</p>
        </Link>
        <Link
          href="/rrhh/informes"
          className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#0F5C8C] transition-colors"
        >
          <p className="text-2xl mb-2">🧾</p>
          <p className="text-sm font-bold text-[#153A5B]">Informes</p>
          <p className="text-xs text-slate-500 mt-0.5">Emitir por período</p>
        </Link>
        <Link
          href="/rrhh/vacaciones-calendario"
          className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#0F5C8C] transition-colors"
        >
          <p className="text-2xl mb-2">🏖️</p>
          <p className="text-sm font-bold text-[#153A5B]">Vacaciones</p>
          <p className="text-xs text-slate-500 mt-0.5">Calendario del equipo</p>
        </Link>
        <Link
          href="/rrhh/papeletas"
          className="relative bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#0F5C8C] transition-colors"
        >
          {papeletasPend > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] px-1.5 flex items-center justify-center">
              {papeletasPend > 9 ? '9+' : papeletasPend}
            </span>
          )}
          <p className="text-2xl mb-2">✍️</p>
          <p className="text-sm font-bold text-[#153A5B]">Papeletas</p>
          <p className="text-xs text-slate-500 mt-0.5">Por imprimir y firmar</p>
        </Link>
        <Link
          href="/rrhh/caja-chica"
          className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#0F5C8C] transition-colors"
        >
          <p className="text-2xl mb-2">💰</p>
          <p className="text-sm font-bold text-[#153A5B]">Caja Chica</p>
          <p className="text-xs text-slate-500 mt-0.5">Fondo y solicitudes</p>
        </Link>
        <Link
          href="/trabajador/rendicion-gastos"
          className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-[#0F5C8C] transition-colors"
        >
          <p className="text-2xl mb-2">🧾</p>
          <p className="text-sm font-bold text-[#153A5B]">Rendición de Gastos</p>
          <p className="text-xs text-slate-500 mt-0.5">Gerencia y ventas</p>
        </Link>
      </div>

      <p id="pendientes-rrhh" className="text-xs font-bold text-slate-400 tracking-wide mb-2">
        PENDIENTES DE RR.HH.
      </p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {errorCarga && <p className="text-xs text-red-700 bg-red-50 p-3">{errorCarga}</p>}
        {pendientes.length === 0 && !errorCarga && (
          <p className="text-sm text-slate-400 p-4">No hay solicitudes pendientes.</p>
        )}
        {pendientes.map((item) => (
          <div key={item.origen + item.id} className="flex items-center justify-between px-4 py-3 gap-3">
            <div>
              <p className="text-sm font-bold text-[#153A5B]">
                {item.nombre} —{' '}
                {item.origen === 'permiso'
                  ? item.tipos_permiso?.nombre
                  : `Vacaciones (${item.dias_habiles} días)`}
              </p>
              <p className="text-xs text-slate-500">
                {item.fecha_desde} → {item.fecha_hasta}
                {item.origen === 'permiso' && item.hora_desde && item.hora_hasta && (
                  <> · {item.hora_desde.slice(0, 5)} a {item.hora_hasta.slice(0, 5)} hrs</>
                )}
              </p>
              {item.etapa === 'jefe' ? (
                <span className="inline-block text-[10px] font-bold text-green-800 bg-green-100 rounded-full px-2 py-0.5 mt-1">
                  Tu aprobación (jefe directo)
                </span>
              ) : (
                <span className="inline-block text-[10px] font-bold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5 mt-1">
                  {item.estado === 'aprobada_jefe' ? 'Firma de RR.HH. · ya aprobó su jefe' : 'Firma de RR.HH.'}
                </span>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => resolver(item, 'aprobada')}
                className="text-xs font-bold text-green-800 bg-green-100 rounded-lg px-3 py-2"
              >
                Aprobar
              </button>
              <button
                onClick={() => resolver(item, 'rechazada')}
                className="text-xs font-bold text-red-800 bg-red-100 rounded-lg px-3 py-2"
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmando && traslapes && traslapes.length > 0 && (
        <ModalTraslapeVacaciones
          traslapes={traslapes}
          confirmando={resolviendo}
          onCancelar={() => {
            setConfirmando(null);
            setTraslapes(null);
          }}
          onConfirmar={() => confirmarVacaciones(confirmando, 'aprobada')}
        />
      )}
    </AppShell>
  );
}
