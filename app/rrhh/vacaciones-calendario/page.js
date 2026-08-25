'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import CalendarioVacaciones from '@/components/CalendarioVacaciones';
import { obtenerCalendarioVacaciones, mesActualISO } from '@/lib/vacacionesEquipo';

export default function CalendarioVacacionesRRHH() {
  const [mes, setMes] = useState(mesActualISO());
  const [areaId, setAreaId] = useState('');
  const [calendario, setCalendario] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    setError('');
    obtenerCalendarioVacaciones(mes, areaId || null)
      .then((datos) => {
        if (activo) setCalendario(datos);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      });
    return () => {
      activo = false;
    };
  }, [mes, areaId]);

  const trabajadoresPorId = new Map((calendario?.trabajadores || []).map((t) => [t.id, t]));

  return (
    <AppShell links={rrhhLinks} titulo="Calendario de vacaciones" requiereRRHH>
      <Link href="/rrhh" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver al Dashboard
      </Link>

      <p className="text-xs text-slate-500 mb-4">
        Vacaciones aprobadas (verde) y pendientes (ámbar) de toda la empresa, para revisar antes de
        aprobar si alguien más ya tiene esas fechas.
      </p>

      <div className="mb-4">
        <label className="text-xs text-slate-500">Filtrar por área</label>
        <select
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1"
        >
          <option value="">Todas las áreas</option>
          {calendario?.areas?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {calendario ? (
        <CalendarioVacaciones
          mes={mes}
          solicitudes={calendario.solicitudes}
          trabajadoresPorId={trabajadoresPorId}
          onCambiarMes={setMes}
        />
      ) : (
        !error && <p className="text-sm text-slate-400">Cargando…</p>
      )}

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2 mt-6">
        DÍAS DE VACACIONES DISPONIBLES
      </p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {calendario?.trabajadores.length === 0 && (
          <p className="text-sm text-slate-400 p-4">Sin trabajadores en esta área.</p>
        )}
        {calendario?.trabajadores.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[#153A5B]">{t.nombre_completo}</p>
              <p className="text-xs text-slate-500">{t.areas?.nombre || 'Sin área'}</p>
            </div>
            <p className="text-sm text-[#0F5C8C] font-bold">
              {t.saldo ? Math.max(0, t.saldo.dias_disponibles_estimados) : '—'}{' '}
              <span className="text-xs font-normal text-slate-500">disponibles</span>
            </p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
