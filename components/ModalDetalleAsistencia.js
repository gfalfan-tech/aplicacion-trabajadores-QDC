'use client';

import { formatearMinutosAtraso } from '@/lib/asistencia';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatearFechaLarga(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  return `${DIAS_SEMANA[d.getDay()]} ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

// Modal con el detalle día por día de atrasos e inasistencias de un
// trabajador para un período de asistencia ya cargado.
export default function ModalDetalleAsistencia({ trabajador, asistencia, onCerrar }) {
  const dias = [...(asistencia?.detalle_dias || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));

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
              {dias.map((d) => (
                <div
                  key={d.fecha}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50"
                >
                  <p className="text-sm font-bold text-[#153A5B]">{formatearFechaLarga(d.fecha)}</p>
                  <div className="flex items-center gap-2">
                    {d.inasistencia && (
                      <span className="text-[10px] font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                        Inasistencia
                      </span>
                    )}
                    {d.atraso_minutos > 0 && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
                        {formatearMinutosAtraso(d.atraso_minutos)} atraso
                      </span>
                    )}
                  </div>
                </div>
              ))}
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
