'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import Avatar from '@/components/Avatar';
import CalendarioVacaciones from '@/components/CalendarioVacaciones';
import ModalTraslapeVacaciones from '@/components/ModalTraslapeVacaciones';
import { obtenerAsistenciaMesActual, formatearMinutosAtraso } from '@/lib/asistencia';
import {
  obtenerCalendarioVacaciones,
  obtenerTraslapes,
  resolverSolicitudVacaciones,
  mesActualISO,
} from '@/lib/vacacionesEquipo';

export default function MiEquipo() {
  const { perfil, esJefatura } = useAuth();
  const [equipo, setEquipo] = useState(null);
  const [mes, setMes] = useState(mesActualISO());
  const [calendario, setCalendario] = useState(null);
  const [errorCalendario, setErrorCalendario] = useState('');
  const [confirmando, setConfirmando] = useState(null); // solicitud a confirmar
  const [traslapes, setTraslapes] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);

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

  useEffect(() => {
    if (!perfil || !esJefatura) return;
    let activo = true;
    setErrorCalendario('');
    obtenerCalendarioVacaciones(mes)
      .then((datos) => {
        if (activo) setCalendario(datos);
      })
      .catch((err) => {
        if (activo) setErrorCalendario(err.message);
      });
    return () => {
      activo = false;
    };
  }, [perfil?.id, esJefatura, mes]);

  async function pedirConfirmacion(solicitud) {
    setConfirmando(solicitud);
    setTraslapes(null);
    try {
      const t = await obtenerTraslapes(solicitud.id);
      setTraslapes(t);
      if (t.length === 0) {
        // Sin cruces: aprobar directo, sin mostrar el modal de advertencia.
        await confirmarResolucion(solicitud, 'aprobada');
      }
    } catch (err) {
      setErrorCalendario(err.message);
      setConfirmando(null);
    }
  }

  async function confirmarResolucion(solicitud, estado) {
    setResolviendo(true);
    try {
      await resolverSolicitudVacaciones(solicitud.id, estado);
      setConfirmando(null);
      setTraslapes(null);
      const datos = await obtenerCalendarioVacaciones(mes);
      setCalendario(datos);
    } catch (err) {
      setErrorCalendario(err.message);
    } finally {
      setResolviendo(false);
    }
  }

  if (!perfil) return null;

  const trabajadoresPorId = new Map((calendario?.trabajadores || []).map((t) => [t.id, t]));
  const pendientes = (calendario?.solicitudes || []).filter((s) => s.estado === 'pendiente');

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
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-6">
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

          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
            DÍAS DE VACACIONES DISPONIBLES
          </p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-6">
            {(calendario?.trabajadores || []).length === 0 && (
              <p className="text-sm text-slate-400 p-4">
                {errorCalendario || 'Cargando…'}
              </p>
            )}
            {calendario?.trabajadores.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-bold text-[#153A5B]">{t.nombre_completo}</p>
                <p className="text-sm text-[#0F5C8C] font-bold">
                  {t.saldo ? Math.max(0, t.saldo.dias_disponibles_estimados) : '—'}{' '}
                  <span className="text-xs font-normal text-slate-500">disponibles</span>
                </p>
              </div>
            ))}
          </div>

          {pendientes.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
                VACACIONES PENDIENTES DE TU EQUIPO
              </p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-6">
                {pendientes.map((s) => (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-[#153A5B]">
                        {trabajadoresPorId.get(s.trabajador_id)?.nombre_completo}
                      </p>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
                        {s.dias_habiles} días hábiles
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {s.fecha_desde} → {s.fecha_hasta}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => pedirConfirmacion(s)}
                        className="text-xs font-bold text-green-800 bg-green-100 rounded-lg px-3 py-2"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => confirmarResolucion(s, 'rechazada')}
                        className="text-xs font-bold text-red-800 bg-red-100 rounded-lg px-3 py-2"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
            CALENDARIO DE VACACIONES DEL EQUIPO
          </p>
          {calendario ? (
            <CalendarioVacaciones
              mes={mes}
              solicitudes={calendario.solicitudes}
              trabajadoresPorId={trabajadoresPorId}
              onCambiarMes={setMes}
            />
          ) : (
            <p className="text-sm text-slate-400">{errorCalendario || 'Cargando…'}</p>
          )}
        </>
      )}

      {confirmando && traslapes && traslapes.length > 0 && (
        <ModalTraslapeVacaciones
          traslapes={traslapes}
          confirmando={resolviendo}
          onCancelar={() => {
            setConfirmando(null);
            setTraslapes(null);
          }}
          onConfirmar={() => confirmarResolucion(confirmando, 'aprobada')}
        />
      )}
    </AppShell>
  );
}
