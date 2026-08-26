'use client';

import { useState } from 'react';
import { recargarCajaChica } from '@/lib/cajaChica';
import { formatearCLP } from '@/lib/cajaChicaLogica';

const ETIQUETA_TIPO = { factura: 'Factura', boleta: 'Boleta', vale_por: 'Vale por' };

function formatearFecha(fechaISO) {
  if (!fechaISO) return '—';
  return new Date(fechaISO).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Reporte de "Rendir caja chica": lo que hay que ver antes de recargar el
// fondo — saldo inicial, solicitudes del período, comprobantes ordenados
// por tipo, quién compró y quién aprobó — más el formulario para cerrar
// este período y abrir uno nuevo con la recarga.
export default function ModalReporteCajaChica({ reporte, onCerrar, onRecargado }) {
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const comprobantesPorTipo = { factura: [], boleta: [], vale_por: [] };
  (reporte.solicitudes || []).forEach((s) => {
    (s.comprobantes || []).forEach((c) => {
      comprobantesPorTipo[c.tipo]?.push({ ...c, solicitante: s.solicitante_nombre, articulo: s.articulo });
    });
  });

  async function confirmarRecarga() {
    setError('');
    const m = Number(monto);
    if (!m || m <= 0) {
      setError('Ingresa un monto válido.');
      return;
    }
    setEnviando(true);
    try {
      await recargarCajaChica(m, notas);
      onRecargado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-bold text-[#153A5B]">Rendir caja chica</p>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {!reporte.periodo ? (
            <p className="text-sm text-slate-400 py-6 text-center">Aún no hay un fondo de caja chica abierto.</p>
          ) : (
            <>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">
                  Saldo inicial del período — {formatearFecha(reporte.periodo.fecha_inicio)}
                </p>
                <p className="text-lg font-bold text-[#153A5B]">{formatearCLP(reporte.periodo.monto_inicial)}</p>
              </div>

              {reporte.pendientesDeCierre > 0 && (
                <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Hay {reporte.pendientesDeCierre} solicitud(es) todavía en curso (sin rendir). Hay que
                  completarlas antes de poder recargar el fondo.
                </p>
              )}

              <p className="text-xs font-bold text-slate-400 tracking-wide">SOLICITUDES DEL PERÍODO</p>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {(reporte.solicitudes || []).length === 0 && (
                  <p className="text-sm text-slate-400 p-3">Sin solicitudes en este período.</p>
                )}
                {(reporte.solicitudes || []).map((s) => (
                  <div key={s.id} className="px-3 py-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-bold text-[#153A5B]">{s.articulo}</span>
                      <span className="font-bold">{formatearCLP(s.monto_solicitado)}</span>
                    </div>
                    <p className="text-slate-500">
                      Compró: {s.solicitante_nombre} · Aprobó: {s.aprobador_nombre || '—'} · Estado: {s.estado}
                    </p>
                  </div>
                ))}
              </div>

              {['factura', 'boleta', 'vale_por'].map((tipo) =>
                comprobantesPorTipo[tipo].length > 0 ? (
                  <div key={tipo}>
                    <p className="text-xs font-bold text-slate-400 tracking-wide mb-1">
                      {ETIQUETA_TIPO[tipo].toUpperCase()}S
                    </p>
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {comprobantesPorTipo[tipo].map((c) => (
                        <div key={c.id} className="px-3 py-2 text-xs flex justify-between">
                          <span>
                            {c.solicitante} — {c.articulo}
                            {c.numero_documento ? ` (N° ${c.numero_documento})` : ''}
                          </span>
                          <span className="font-bold">{formatearCLP(c.monto)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              )}

              <div className="bg-[#153A5B] text-white rounded-lg p-3">
                <p className="text-xs opacity-80">Total que debería haber físicamente en la caja ahora</p>
                <p className="text-xl font-bold">{formatearCLP(reporte.totales?.disponible)}</p>
              </div>

              {reporte.pendientesDeCierre === 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-sm font-bold text-[#153A5B] mb-2">Recargar el fondo</p>
                  <p className="text-xs text-slate-500 mb-2">
                    Ingresa cuánto dinero estás agregando a la caja. El nuevo período partirá con el
                    saldo físico de arriba más lo que agregues.
                  </p>
                  <input
                    type="number"
                    placeholder="Monto a agregar"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2"
                  />
                  <input
                    type="text"
                    placeholder="Notas (opcional)"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2"
                  />
                  {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
                  <button
                    onClick={confirmarRecarga}
                    disabled={enviando}
                    className="w-full bg-[#0F5C8C] hover:bg-[#153A5B] text-white font-bold text-sm rounded-lg py-2 disabled:opacity-60"
                  >
                    {enviando ? 'Guardando…' : 'Cerrar período y recargar'}
                  </button>
                </div>
              )}
            </>
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
