'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import { supabase } from '@/lib/supabaseClient';
import { calcularVacacionesPendientesPeriodoAnterior } from '@/lib/vacacionesPeriodoAnterior';

function formatDias(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function InformeVacaciones() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;

    async function cargar() {
      setCargando(true);
      setError('');
      const [{ data: saldoData, error: errSaldo }, { data: trabajadoresData, error: errTrab }] =
        await Promise.all([
          supabase.from('v_vacaciones_saldo').select('*').order('nombre_completo'),
          supabase.from('trabajadores').select('id, rut, estado, cargo'),
        ]);
      if (!activo) return;
      if (errSaldo || errTrab) {
        setError('No se pudo cargar el informe: ' + (errSaldo?.message || errTrab?.message));
        setCargando(false);
        return;
      }

      const trabajadorPorId = new Map((trabajadoresData || []).map((t) => [t.id, t]));

      const lista = (saldoData || [])
        .map((s) => {
          const t = trabajadorPorId.get(s.trabajador_id);
          return {
            trabajador_id: s.trabajador_id,
            nombre_completo: s.nombre_completo,
            rut: t?.rut,
            cargo: t?.cargo,
            estado: t?.estado || 'activo',
            pendientePeriodoAnterior: calcularVacacionesPendientesPeriodoAnterior(s),
            diasProgresivos: s.dias_progresivos_vigentes || 0,
            disponibles: s.dias_disponibles_estimados || 0,
          };
        })
        .filter((f) => f.estado !== 'inactivo');

      if (activo) {
        setFilas(lista);
        setCargando(false);
      }
    }

    cargar();
    return () => {
      activo = false;
    };
  }, []);

  return (
    <AppShell links={rrhhLinks} titulo="Informe de vacaciones" requiereRRHH>
      <Link href="/rrhh/informes" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver a Informes
      </Link>

      <p className="text-xs text-slate-400 mb-4">
        Saldo de vacaciones de cada trabajador activo, al día de hoy. "Pendientes del período
        anterior" marca hasta un período completo (15 días hábiles + progresivos vigentes) que ya
        debería haberse tomado según su fecha de ingreso — si arrastra más de un período sin usar,
        el resto igual queda incluido en "Vacaciones disponibles", pero acá solo se destaca uno.
      </p>

      {error && <p className="text-xs text-red-600 mb-4">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="px-3 py-2">Trabajador</th>
              <th className="px-3 py-2">RUT</th>
              <th className="px-3 py-2">Pendientes del período anterior</th>
              <th className="px-3 py-2">Días progresivos</th>
              <th className="px-3 py-2">Vacaciones disponibles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-400">
                  No hay trabajadores activos con saldo de vacaciones.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.trabajador_id}>
                <td className="px-3 py-2 font-bold text-[#153A5B]">
                  {f.nombre_completo}
                  {f.cargo && <span className="block text-[10px] font-normal text-slate-400">{f.cargo}</span>}
                </td>
                <td className="px-3 py-2 text-slate-600">{f.rut || '—'}</td>
                <td className="px-3 py-2 text-slate-600">
                  {f.pendientePeriodoAnterior > 0 ? (
                    <span className="font-bold text-amber-700">{formatDias(f.pendientePeriodoAnterior)}</span>
                  ) : (
                    '0'
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{formatDias(f.diasProgresivos)}</td>
                <td className="px-3 py-2 text-slate-600">{formatDias(f.disponibles)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
