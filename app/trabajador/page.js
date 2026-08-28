'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import AlertaPendientes from '@/components/AlertaPendientes';

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

// Formatea una fecha "YYYY-MM-DD" tal cual, sin pasar por Date/UTC, para
// evitar que el navegador la corra un día por la conversión de zona horaria.
function formatearFechaCorta(fechaISO) {
  if (!fechaISO) return '';
  const [, mes, dia] = fechaISO.split('-').map(Number);
  return `${dia} ${MESES_CORTOS[mes - 1]}`;
}

export default function TrabajadorHome() {
  const { perfil, roles, esJefatura, esRRHH } = useAuth();
  const tieneRendicionGastos = roles?.includes('rendicion_gastos');
  const [saldo, setSaldo] = useState(null);
  const [pendientes, setPendientes] = useState(0);
  const [cumples, setCumples] = useState([]);
  const [mural, setMural] = useState([]);

  useEffect(() => {
    if (!perfil) return;
    supabase
      .from('v_vacaciones_saldo')
      .select('*')
      .eq('trabajador_id', perfil.id)
      .maybeSingle()
      .then(({ data }) => setSaldo(data));

    supabase
      .from('solicitudes_permiso')
      .select('id', { count: 'exact', head: true })
      .eq('trabajador_id', perfil.id)
      .eq('estado', 'pendiente')
      .then(({ count }) => setPendientes(count || 0));

    supabase
      .from('v_proximos_cumpleanos')
      .select('*')
      .limit(3)
      .then(({ data }) => setCumples(data || []));

    const hoy = new Date().toISOString().slice(0, 10);
    supabase
      .from('publicaciones_mural')
      .select('*')
      .or(`fecha_expiracion.is.null,fecha_expiracion.gte.${hoy}`)
      .order('publicado_en', { ascending: false })
      .limit(1)
      .then(({ data }) => setMural(data || []));
  }, [perfil?.id]);

  if (!perfil) return null;

  return (
    <AppShell links={trabajadorLinks} titulo="Inicio">
      <p className="text-lg font-bold text-[#153A5B] mb-1">
        Hola, {perfil.nombre_completo?.split(' ')[0]}
      </p>
      <p className="text-sm text-slate-500 mb-6 capitalize">
        {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {(esJefatura || esRRHH) && (
        <AlertaPendientes
          enlaces={{
            vacaciones: '/trabajador/equipo',
            permisos: '/trabajador/equipo',
            cajaChica: esJefatura || esRRHH ? '/trabajador/caja-chica' : null,
            rendicionGastos: '/trabajador/rendicion-gastos',
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-[#0F5C8C]">
            {saldo ? Math.max(0, saldo.dias_disponibles_estimados) : '—'}
          </p>
          <p className="text-xs text-slate-500">Vacaciones disponibles</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{pendientes}</p>
          <p className="text-xs text-slate-500">Solicitudes pendientes</p>
        </div>
      </div>

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">ACCIONES RÁPIDAS</p>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/trabajador/solicitudes" className="bg-[#0F5C8C] text-white rounded-2xl p-4">
          <p className="text-2xl mb-2">📝</p>
          <p className="text-sm font-bold">Solicitar permiso</p>
        </Link>
        <Link href="/trabajador/vacaciones" className="bg-[#153A5B] text-white rounded-2xl p-4">
          <p className="text-2xl mb-2">🏖️</p>
          <p className="text-sm font-bold">Solicitar vacaciones</p>
        </Link>
        <Link
          href="/trabajador/documentos"
          className="bg-white border border-slate-200 rounded-2xl p-4"
        >
          <p className="text-2xl mb-2">📚</p>
          <p className="text-sm font-bold text-[#153A5B]">Reglamento y políticas</p>
        </Link>
        <Link href="/trabajador/mural" className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-2xl mb-2">📰</p>
          <p className="text-sm font-bold text-[#153A5B]">Diario mural</p>
        </Link>
        {esJefatura && (
          <Link
            href="/trabajador/equipo"
            className="bg-white border border-slate-200 rounded-2xl p-4 col-span-2"
          >
            <p className="text-2xl mb-2">👥</p>
            <p className="text-sm font-bold text-[#153A5B]">Mi equipo — asistencia del mes</p>
          </Link>
        )}
        {(esJefatura || esRRHH) && (
          <Link
            href="/trabajador/caja-chica"
            className="bg-white border border-slate-200 rounded-2xl p-4 col-span-2"
          >
            <p className="text-2xl mb-2">💰</p>
            <p className="text-sm font-bold text-[#153A5B]">Caja Chica</p>
          </Link>
        )}
        {(tieneRendicionGastos || esJefatura || esRRHH) && (
          <Link
            href="/trabajador/rendicion-gastos"
            className="bg-white border border-slate-200 rounded-2xl p-4 col-span-2"
          >
            <p className="text-2xl mb-2">🧾</p>
            <p className="text-sm font-bold text-[#153A5B]">Rendición de Gastos</p>
          </Link>
        )}
      </div>

      {mural[0] && (
        <>
          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">ÚLTIMA COMUNICACIÓN</p>
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <p className="text-sm font-bold text-[#153A5B]">{mural[0].titulo}</p>
            <p className="text-xs text-slate-500 mt-1">{mural[0].contenido}</p>
          </div>
        </>
      )}

      {cumples.length > 0 && (
        <>
          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">PRÓXIMOS CUMPLEAÑOS</p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {cumples.map((c) => (
              <div key={c.trabajador_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[#153A5B]">{c.nombre_completo}</p>
                  <p className="text-xs text-slate-500">{c.area || 'Sin área'}</p>
                </div>
                <p className="text-xs text-slate-400">{formatearFechaCorta(c.proximo_cumpleanos)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
