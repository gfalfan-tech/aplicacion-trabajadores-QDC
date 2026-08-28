'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import {
  crearBorrador,
  listarMisRendiciones,
  obtenerRendicionesPendientes,
} from '@/lib/rendicionGastos';
import { estadoRendicionLabel, estadoRendicionStyle, formatearMonto, totalLineas } from '@/lib/rendicionGastosLogica';

export default function RendicionGastosLista() {
  const router = useRouter();
  const { perfil, roles, esJefatura, esRRHH } = useAuth();
  const tieneAcceso = roles?.includes('rendicion_gastos');
  const puedeAprobar = esJefatura || esRRHH;

  const [mias, setMias] = useState(null);
  const [pendientes, setPendientes] = useState(null);
  const [errorPendientes, setErrorPendientes] = useState('');
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!perfil || !tieneAcceso) return;
    listarMisRendiciones().then(setMias);
  }, [perfil?.id, tieneAcceso]);

  useEffect(() => {
    if (!perfil || !puedeAprobar) return;
    obtenerRendicionesPendientes()
      .then(setPendientes)
      .catch((err) => setErrorPendientes(err.message));
  }, [perfil?.id, puedeAprobar]);

  async function nuevaRendicion() {
    setCreando(true);
    try {
      const r = await crearBorrador({ moneda: 'CLP', tipo_cambio: null, total_entregado_qdc: 0 });
      router.push(`/trabajador/rendicion-gastos/${r.id}`);
    } catch (err) {
      alert(err.message);
      setCreando(false);
    }
  }

  if (!perfil) return null;

  if (!tieneAcceso && !puedeAprobar) {
    return (
      <AppShell links={trabajadorLinks} titulo="Rendición de Gastos">
        <p className="text-sm text-slate-400">
          Esta sección es solo para quienes tienen acceso al módulo de Rendición de Gastos.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell links={trabajadorLinks} titulo="Rendición de Gastos">
      {puedeAprobar && (
        <>
          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">PENDIENTES POR APROBAR</p>
          {errorPendientes && <p className="text-xs text-red-600 mb-2">{errorPendientes}</p>}
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-6">
            {pendientes === null && <p className="text-sm text-slate-400 p-4">Cargando…</p>}
            {pendientes?.length === 0 && (
              <p className="text-sm text-slate-400 p-4">No hay rendiciones pendientes de tu revisión.</p>
            )}
            {pendientes?.map((r) => (
              <Link
                key={r.id}
                href={`/trabajador/rendicion-gastos/${r.id}`}
                className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-bold text-[#153A5B]">{r.trabajador_nombre}</p>
                  <p className="text-xs text-slate-500">
                    {formatearMonto(r.total_entregado_qdc, r.moneda)} entregados · {r.moneda}
                  </p>
                  {r.estado === 'aprobada_jefe' && (
                    <p className="text-[10px] text-blue-700 mt-0.5">
                      Ya la aprobó el jefe directo — falta la firma de Finanzas.
                    </p>
                  )}
                </div>
                <span className="text-slate-300">›</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {tieneAcceso && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-400 tracking-wide">MIS RENDICIONES</p>
            <button
              onClick={nuevaRendicion}
              disabled={creando}
              className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-1.5 disabled:opacity-60"
            >
              {creando ? 'Creando…' : '+ Nueva rendición'}
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {mias === null && <p className="text-sm text-slate-400 p-4">Cargando…</p>}
            {mias?.length === 0 && <p className="text-sm text-slate-400 p-4">Aún no tienes rendiciones.</p>}
            {mias?.map((r) => (
              <Link
                key={r.id}
                href={`/trabajador/rendicion-gastos/${r.id}`}
                className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-bold text-[#153A5B]">
                    {formatearMonto(r.total_entregado_qdc, r.moneda)} entregados
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.moneda} · {new Date(r.created_at).toLocaleDateString('es-CL')}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${estadoRendicionStyle[r.estado]}`}
                >
                  {estadoRendicionLabel(r.estado)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
