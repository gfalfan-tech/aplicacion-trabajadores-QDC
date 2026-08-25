'use client';

// Modal de advertencia: se muestra antes de aprobar una solicitud de
// vacaciones cuando otras personas del área ya tienen vacaciones
// aprobadas/pendientes que se cruzan con las mismas fechas.
export default function ModalTraslapeVacaciones({ traslapes, onConfirmar, onCancelar, confirmando }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full sm:w-96 rounded-2xl p-5">
        <p className="text-sm font-bold text-amber-700 mb-2">⚠️ Fechas cruzadas con otras vacaciones</p>
        <p className="text-xs text-slate-500 mb-3">
          Estas personas de la misma área ya tienen vacaciones en fechas que se cruzan con esta
          solicitud:
        </p>
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {traslapes.map((t, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
              <div>
                <p className="font-bold text-[#153A5B]">{t.nombre_completo}</p>
                <p className="text-slate-500">
                  {t.fecha_desde} → {t.fecha_hasta}
                </p>
              </div>
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  t.estado === 'aprobada' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {t.estado}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            disabled={confirmando}
            className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg py-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={confirmando}
            className="flex-1 text-xs font-bold text-white bg-[#0F5C8C] rounded-lg py-2 disabled:opacity-60"
          >
            {confirmando ? 'Aprobando…' : 'Aprobar de todas formas'}
          </button>
        </div>
      </div>
    </div>
  );
}
