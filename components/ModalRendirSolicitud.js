'use client';

import { useState } from 'react';
import { subirComprobanteCajaChica, enviarRendicionCajaChica } from '@/lib/cajaChica';
import { formatearCLP } from '@/lib/cajaChicaLogica';

const TIPOS = [
  { value: 'factura', label: 'Factura' },
  { value: 'boleta', label: 'Boleta' },
  { value: 'vale_por', label: 'Vale por' },
];

function comprobanteVacio() {
  return { tipo: 'boleta', numero_documento: '', monto: '', descripcion: '', file: null, subiendo: false };
}

// Modal donde el solicitante rinde cuentas de una solicitud ya entregada:
// carga uno o más comprobantes (factura/boleta/vale por) con su monto, y
// opcionalmente una foto/PDF de respaldo.
export default function ModalRendirSolicitud({ solicitud, trabajadorId, onCerrar, onListo }) {
  const [comprobantes, setComprobantes] = useState([comprobanteVacio()]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const total = comprobantes.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
  const diferencia = Number(solicitud.monto_solicitado) - total;

  function actualizar(i, cambios) {
    setComprobantes((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...cambios } : c)));
  }

  function agregarFila() {
    setComprobantes((prev) => [...prev, comprobanteVacio()]);
  }

  function quitarFila(i) {
    setComprobantes((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function elegirArchivo(i, file) {
    if (!file) return;
    actualizar(i, { subiendo: true });
    try {
      const path = await subirComprobanteCajaChica(trabajadorId, solicitud.id, file);
      actualizar(i, { storage_path: path, nombreArchivo: file.name, subiendo: false });
    } catch (err) {
      setError('No se pudo subir el archivo: ' + err.message);
      actualizar(i, { subiendo: false });
    }
  }

  async function enviar() {
    setError('');
    if (comprobantes.some((c) => !c.monto || Number(c.monto) <= 0)) {
      setError('Todos los comprobantes deben tener un monto mayor a 0.');
      return;
    }
    setEnviando(true);
    try {
      await enviarRendicionCajaChica(
        solicitud.id,
        comprobantes.map((c) => ({
          tipo: c.tipo,
          numero_documento: c.numero_documento || null,
          monto: Number(c.monto),
          descripcion: c.descripcion || null,
          storage_path: c.storage_path || null,
        }))
      );
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-bold text-[#153A5B]">Rendir cuentas — {solicitud.articulo}</p>
          <p className="text-xs text-slate-500">Monto entregado: {formatearCLP(solicitud.monto_solicitado)}</p>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {comprobantes.map((c, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500">Comprobante {i + 1}</p>
                {comprobantes.length > 1 && (
                  <button onClick={() => quitarFila(i)} className="text-xs text-red-600">
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={c.tipo}
                  onChange={(e) => actualizar(i, { tipo: e.target.value })}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Monto"
                  value={c.monto}
                  onChange={(e) => actualizar(i, { monto: e.target.value })}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <input
                type="text"
                placeholder="N° de documento (opcional)"
                value={c.numero_documento}
                onChange={(e) => actualizar(i, { numero_documento: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Descripción (opcional)"
                value={c.descripcion}
                onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              />
              <label className="block text-xs font-bold text-[#0F5C8C] cursor-pointer">
                {c.subiendo
                  ? 'Subiendo…'
                  : c.nombreArchivo
                  ? `📎 ${c.nombreArchivo}`
                  : '📎 Adjuntar foto o PDF del comprobante'}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => elegirArchivo(i, e.target.files?.[0])}
                />
              </label>
            </div>
          ))}

          <button onClick={agregarFila} className="text-xs font-bold text-[#0F5C8C]">
            + Agregar otro comprobante
          </button>

          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Total rendido</span>
              <span className="font-bold text-[#153A5B]">{formatearCLP(total)}</span>
            </div>
            {diferencia > 0 && (
              <div className="flex justify-between text-amber-700 mt-1">
                <span>Vuelto a devolver a la caja</span>
                <span className="font-bold">{formatearCLP(diferencia)}</span>
              </div>
            )}
            {diferencia < 0 && (
              <div className="flex justify-between text-red-700 mt-1">
                <span>Saldo a favor tuyo (la caja te debe)</span>
                <span className="font-bold">{formatearCLP(-diferencia)}</span>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex gap-2">
          <button
            onClick={onCerrar}
            disabled={enviando}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-lg py-2"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={enviando}
            className="flex-1 bg-[#0F5C8C] hover:bg-[#153A5B] text-white font-bold text-sm rounded-lg py-2 disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : 'Enviar rendición'}
          </button>
        </div>
      </div>
    </div>
  );
}
