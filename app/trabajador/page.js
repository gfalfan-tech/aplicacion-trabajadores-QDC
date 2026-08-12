'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';

export default function TrabajadorHome() {
  const { perfil } = useAuth();
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

    supabase
      .from('publicaciones_mural')
      .select('*')
      .order('publicado_en', { ascending: false })
      .limit(1)
      .then(({ data }) => setMural(data || []));
  }, [perfil]);

  if (!perfil) return null;

  return (
    <AppShell links={trabajadorLinks} titulo="Inicio">
      <p className="text-lg font-bold text-[#153A5B] mb-1">
        Hola, {perfil.nombre_completo?.split(' ')[0]}
      </p>
      <p className="text-sm text-slate-500 mb-6 capitalize">
        {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

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
                <p className="text-xs text-slate-400">
                  {new Date(c.proximo_cumpleanos).toLocaleDateString('es-CL', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
