'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatearMinutosAtraso } from '@/lib/asistencia';
import { obtenerJustificacionesPeriodo } from '@/lib/asistenciaJustificacion';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatearFechaLarga(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  return `${DIAS_SEMANA[d.getDay()]} ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

// Modal con el detalle día por día de atrasos e inasistencias de un
// trabajador para un período de asistencia ya cargado. Además de lo que
// trae guardado el reporte (detalle_dias), cruza EN VIVO cada día contra
// vacaciones/permisos/licencias médicas vigentes hoy — así, si alguno se
// registró DESPUÉS de subir el reporte, igual queda explicado acá sin
// tener que volver a subir el archivo. Un día justificado "completo"
// (vacaciones, licencia médica, o permiso sin horario) se agrega a la
// lista aunque el reporte no lo haya traído (porque ni siquiera aparecía
// como inasistencia); un permiso CON horario solo se muestra como
// "posible" justificación junto al atraso, sin ocultarlo — ver
// lib/asistenciaJustificacion.js.
export default function ModalDetalleAsistencia({ trabajador, asistencia, onCerrar }) {
  const [justificaciones, setJustificaciones] = useState(new Map());

  useEffect(() => {
    if (!trabajador?.id || !asistencia?.periodo_desde || !asistencia?.periodo_hasta) return;
    let activo = true;
    obtenerJustificacionesPeriodo(supabase, trabajador.id, asistencia.periodo_desde, asistencia.periodo_hasta)
      .then((mapa) => {
        if (activo) setJustificaciones(mapa);
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [trabajador?.id, asistencia?.periodo_desde, asistencia?.periodo_hasta]);

  const diasBase = [...(asistencia?.detalle_dias || [])];
  const fechasBase = new Set(diasBase.map((d) => d.fecha));
  for (const [fecha, j] of justificaciones) {
    if (j.completo && !fechasBase.has(fecha)) {
      diasBase.push({ fecha, atraso_minutos: 0, inasistencia: false });
    }
  }
  const dias = diasBase.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-[#153A5B]">{trabajador.nombre_completo}</p>
            <p className="text-xs text-slate-500">
              {asistencia?.periodo_desde} → {asistencia?.periodo_hasta}
              {asistencia?.esMesActual === false && ' (último reporte cargado)'}
            </p>
          </div>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {!asistencia?.detalle_dias || dias.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              {asistencia
                ? 'Sin detalle día por día disponible para este período (fue cargado antes de tener esta función — vuelve a subir el archivo si lo necesitas).'
                : 'Sin datos de asistencia.'}
            </p>
          ) : (
            <div className="space-y-2">
              {dias.map((d) => {
                const j = justificaciones.get(d.fecha);
                const inasistenciaJustificada = d.inasistencia && j?.completo;
                return (
                  <div
                    key={d.fecha}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 gap-2"
                  >
                    <p className="text-sm font-bold text-[#153A5B] shrink-0">{formatearFechaLarga(d.fecha)}</p>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {d.inasistencia && !inasistenciaJustificada && (
                        <span className="text-[10px] font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                          Inasistencia
                        </span>
                      )}
                      {d.atraso_minutos > 0 && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
                          {formatearMinutosAtraso(d.atraso_minutos)} atraso
                        </span>
                      )}
                      {j && (
                        <span
                          className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                            j.completo ? 'text-green-800 bg-green-100' : 'text-blue-800 bg-blue-100'
                          }`}
                        >
                          {j.detalle}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100">
          <button
            onClick={onCerrar}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-lg py-2"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
