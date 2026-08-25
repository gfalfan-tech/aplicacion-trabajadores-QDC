'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import Avatar from '@/components/Avatar';
import { obtenerAsistenciaMesActual, formatearMinutosAtraso } from '@/lib/asistencia';

export default function MiEquipo() {
  const { perfil, esJefatura } = useAuth();
  const [equipo, setEquipo] = useState(null);

  useEffect(() => {
    if (!perfil) return;
    let activo = true;

    async function cargar() {
      const { data: personas } = await supabase
        .from('trabajadores')
        .select('id, nombre_completo, cargo, avatar_url, registra_asistencia')
        .eq('jefe_directo_id', perfil.id)
        .order('nombre_completo');

      const conAsistencia = await Promise.all(
        (personas || []).map(async (p) => ({
          ...p,
          asistencia: p.registra_asistencia === 'SI' ? await obtenerAsistenciaMesActual(p.id) : null,
        }))
      );

      if (activo) setEquipo(conAsistencia);
    }

    cargar();
    return () => {
      activo = false;
    };
  }, [perfil?.id]);

  if (!perfil) return null;

  return (
    <AppShell links={trabajadorLinks} titulo="Mi equipo">
      {!esJefatura && (
        <p className="text-sm text-slate-400">Esta sección es solo para jefaturas.</p>
      )}

      {esJefatura && (
        <>
          <p className="text-xs text-slate-500 mb-4">
            Asistencia del mes en curso de las personas que te tienen como jefe directo.
          </p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {equipo === null && <p className="text-sm text-slate-400 p-4">Cargando…</p>}
            {equipo?.length === 0 && (
              <p className="text-sm text-slate-400 p-4">No tienes a nadie a cargo en este momento.</p>
            )}
            {equipo?.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar url={p.avatar_url} nombre={p.nombre_completo} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#153A5B] truncate">{p.nombre_completo}</p>
                    <p className="text-xs text-slate-500 truncate">{p.cargo || 'Sin cargo'}</p>
                  </div>
                </div>
                {p.registra_asistencia === 'SI' && p.asistencia ? (
                  <p className="text-xs text-slate-500 text-right shrink-0">
                    {p.asistencia.dias_inasistencia} inasist.
                    <br />
                    {formatearMinutosAtraso(p.asistencia.atraso_minutos)} atraso
                  </p>
                ) : (
                  <p className="text-xs text-slate-300 shrink-0">No aplica</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
