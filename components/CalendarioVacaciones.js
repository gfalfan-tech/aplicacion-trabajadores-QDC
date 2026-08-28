'use client';

import { useState } from 'react';
import Avatar from '@/components/Avatar';
import { armarGrillaMes, nombreMes, sumarMes } from '@/lib/vacacionesEquipo';
import { estadoVacacionesLabel } from '@/lib/estadoVacaciones';

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function iniciales(nombre) {
  return (nombre || '??')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Calendario mensual de vacaciones: cada día muestra chips con las
 * iniciales de quienes están de vacaciones ese día (verde = aprobada,
 * ámbar = pendiente). Al tocar un día se abre el detalle completo.
 */
export default function CalendarioVacaciones({ mes, solicitudes, trabajadoresPorId, onCambiarMes }) {
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const semanas = armarGrillaMes(mes, solicitudes);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onCambiarMes(sumarMes(mes, -1))}
          className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          ‹
        </button>
        <p className="text-sm font-bold text-[#153A5B] capitalize">{nombreMes(mes)}</p>
        <button
          onClick={() => onCambiarMes(sumarMes(mes, 1))}
          className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {semanas.flat().map((celda, i) => {
          if (!celda) return <div key={i} />;
          return (
            <button
              key={celda.fechaISO}
              onClick={() => celda.solicitudes.length > 0 && setDiaSeleccionado(celda)}
              className={`aspect-square rounded-lg border text-[10px] p-1 flex flex-col items-center justify-start gap-0.5 overflow-hidden ${
                celda.solicitudes.length > 0
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-transparent'
              }`}
            >
              <span className="text-slate-500">{celda.dia}</span>
              <div className="flex flex-wrap gap-0.5 justify-center">
                {celda.solicitudes.slice(0, 3).map((s) => (
                  <span
                    key={s.id}
                    title={trabajadoresPorId.get(s.trabajador_id)?.nombre_completo}
                    className={`w-4 h-4 rounded-full text-white text-[7px] font-bold flex items-center justify-center ${
                      s.estado === 'aprobada' ? 'bg-green-600' : 'bg-amber-500'
                    }`}
                  >
                    {iniciales(trabajadoresPorId.get(s.trabajador_id)?.nombre_completo)}
                  </span>
                ))}
                {celda.solicitudes.length > 3 && (
                  <span className="text-[8px] text-slate-400">+{celda.solicitudes.length - 3}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-600 inline-block" /> Aprobadas
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Pendientes
        </span>
      </div>

      {diaSeleccionado && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center sm:justify-center"
          onClick={() => setDiaSeleccionado(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:w-96 rounded-t-2xl sm:rounded-2xl p-4 max-h-[70vh] overflow-y-auto"
          >
            <p className="text-sm font-bold text-[#153A5B] mb-3">
              {diaSeleccionado.fechaISO}
            </p>
            <div className="space-y-2">
              {diaSeleccionado.solicitudes.map((s) => {
                const t = trabajadoresPorId.get(s.trabajador_id);
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <Avatar url={t?.avatar_url} nombre={t?.nombre_completo} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#153A5B] truncate">{t?.nombre_completo}</p>
                      <p className="text-[10px] text-slate-500">
                        {s.fecha_desde} → {s.fecha_hasta}
                      </p>
                    </div>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        s.estado === 'aprobada' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {estadoVacacionesLabel(s.estado)}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setDiaSeleccionado(null)}
              className="w-full mt-4 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg py-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
