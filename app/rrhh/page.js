'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';

export default function RRHHHome() {
  const { perfil } = useAuth();
  const [kpi, setKpi] = useState({ activos: 0, permisosPend: 0, vacacionesPend: 0 });
  const [pendientes, setPendientes] = useState([]);

  async function cargar() {
    const { count: activos } = await supabase
      .from('trabajadores')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'activo');

    const { data: permisos } = await supabase
      .from('solicitudes_permiso')
      .select('*, trabajadores(nombre_completo), tipos_permiso(nombre)')
      .eq('estado', 'pendiente')
      .order('created_at');

    const { data: vacaciones } = await supabase
      .from('solicitudes_vacaciones')
      .select('*, trabajadores(nombre_completo)')
      .eq('estado', 'pendiente')
      .order('created_at');

    setKpi({
      activos: activos || 0,
      permisosPend: permisos?.length || 0,
      vacacionesPend: vacaciones?.length || 0,
    });

    setPendientes([
      ...(permisos || []).map((p) => ({ ...p, origen: 'permiso' })),
      ...(vacaciones || []).map((v) => ({ ...v, origen: 'vacaciones' })),
    ]);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function resolver(item, estado) {
    const tabla = item.origen === 'permiso' ? 'solicitudes_permiso' : 'solicitudes_vacaciones';
    await supabase
      .from(tabla)
      .update({ estado, aprobado_por: perfil.id, fecha_resolucion: new Date().toISOString() })
      .eq('id', item.id);
    cargar();
  }

  return (
    <AppShell links={rrhhLinks} titulo="Panel de RR.HH." requiereRRHH>
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

      <Link
        href="/rrhh/feriados"
        className="inline-block text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2 mb-6"
      >
        📅 Administrar feriados
      </Link>

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">PENDIENTES DE RR.HH.</p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {pendientes.length === 0 && (
          <p className="text-sm text-slate-400 p-4">No hay solicitudes pendientes.</p>
        )}
        {pendientes.map((item) => (
          <div key={item.origen + item.id} className="flex items-center justify-between px-4 py-3 gap-3">
            <div>
              <p className="text-sm font-bold text-[#153A5B]">
                {item.trabajadores?.nombre_completo} —{' '}
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
    </AppShell>
  );
}
