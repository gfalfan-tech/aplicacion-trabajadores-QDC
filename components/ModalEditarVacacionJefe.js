'use client';

import { useEffect, useState } from 'react';
import { fechaDMA } from '@/lib/formatoFecha';
import { calcularDiasHabiles } from '@/lib/diasHabiles';

// Modal para que el jefe directo corrija las fechas de una solicitud de
// vacaciones de su equipo. Pide motivo obligatorio y muestra los días
// hábiles resultantes antes de guardar.
export default function ModalEditarVacacionJefe({ solicitud, guardando, error, onGuardar, onCancelar }) {
  const [desde, setDesde] = useState(solicitud.fecha_desde);
  const [hasta, setHasta] = useState(solicitud.fecha_hasta);
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState(null);
  const [errorLocal, setErrorLocal] = useState('');

  useEffect(() => {
    if (!desde || !hasta || hasta < desde) {
      setDias(null);
      return;
    }
    let vigente = true;
    calcularDiasHabiles(desde, hasta).then((n) => vigente && setDias(n));
    return () => {
      vigente = false;
    };
  }, [desde, hasta]);

  function guardar() {
    if (!desde || !hasta || hasta < desde) {
      setErrorLocal('La fecha de término no puede ser antes que la de inicio.');
      return;
    }
    if (dias === 0) {
      setErrorLocal('Ese rango no tiene días hábiles.');
      return;
    }
    if (!motivo.trim()) {
      setErrorLocal('Debes indicar el motivo del cambio.');
      return;
    }
    setErrorLocal('');
    onGuardar(desde, hasta, motivo.trim());
  }

  const nombre = (solicitud.trabajador_nombre || '').split(' ')[0];

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={guardando ? undefined : onCancelar}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold text-[#153A5B] mb-1">Editar fechas de vacaciones</p>
        <p className="text-xs text-slate-500 mb-1">{solicitud.trabajador_nombre}</p>
        <p className="text-xs text-slate-500 mb-4">
          Actualmente: {fechaDMA(solicitud.fecha_desde)} → {fechaDMA(solicitud.fecha_hasta)} (
          {solicitud.dias_habiles} días hábiles)
        </p>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-xs text-slate-500">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        {dias !== null && (
          <p className="text-xs font-bold text-[#0F5C8C] mb-3">Quedarían {dias} días hábiles.</p>
        )}

        <label className="text-xs text-slate-500">Motivo (obligatorio)</label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: se reprograma por necesidad operativa, acuerdo con el trabajador…"
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-1"
        />
        <p className="text-[10px] text-slate-400 mb-3">
          {nombre} va a recibir una notificación con este motivo. La solicitud queda aprobada por ti y pasa a
          la firma de RR.HH.
        </p>

        {(errorLocal || error) && <p className="text-xs text-red-600 mb-2">{errorLocal || error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            disabled={guardando}
            className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg py-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 text-xs font-bold text-white bg-[#0F5C8C] rounded-lg py-2 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
