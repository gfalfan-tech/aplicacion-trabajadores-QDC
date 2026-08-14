'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotificaciones } from '@/lib/useNotificaciones';

function tiempoRelativo(fecha) {
  const diffMs = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export default function NotificacionesBell({ trabajadorId }) {
  const { notificaciones, noLeidas, marcarLeida, marcarTodasLeidas } = useNotificaciones(trabajadorId);
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  const ref = useRef(null);

  useEffect(() => {
    function onClickFuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function abrirNotificacion(n) {
    if (!n.leida) marcarLeida(n.id);
    setAbierto(false);
    if (n.referencia_tabla === 'publicaciones_mural' && n.referencia_id) {
      router.push(`/trabajador/mural?post=${n.referencia_id}`);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="relative w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
        aria-label="Notificaciones"
      >
        <span className="text-lg">🔔</span>
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl border border-slate-200 shadow-lg z-20">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-[#153A5B]">Notificaciones</p>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas} className="text-[11px] font-semibold text-[#0F5C8C]">
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notificaciones.length === 0 && (
              <p className="text-sm text-slate-400 px-4 py-6 text-center">Sin notificaciones.</p>
            )}
            {notificaciones.map((n) => (
              <button
                key={n.id}
                onClick={() => abrirNotificacion(n)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${n.leida ? '' : 'bg-blue-50/50'}`}
              >
                <div className="flex items-center gap-2">
                  {!n.leida && <span className="w-1.5 h-1.5 rounded-full bg-[#0F5C8C] shrink-0" />}
                  <p className="text-xs font-bold text-[#153A5B]">{n.titulo}</p>
                </div>
                {n.mensaje && <p className="text-xs text-slate-600 mt-1">{n.mensaje}</p>}
                <p className="text-[10px] text-slate-400 mt-1">{tiempoRelativo(n.created_at)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
