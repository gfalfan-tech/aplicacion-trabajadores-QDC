'use client';

import { useState } from 'react';
import {
  recargarCajaChica,
  aprobarRendicionCaja,
  obtenerReporteCajaChica,
  obtenerHistorialCajas,
  obtenerReportePeriodo,
} from '@/lib/cajaChica';
import { formatearCLP } from '@/lib/cajaChicaLogica';
import { generarPdfInformeCajaChica } from '@/lib/informeCajaChicaPdf';

const ETIQUETA_TIPO = { factura: 'Factura', boleta: 'Boleta', vale_por: 'Vale por' };

function formatearFecha(fechaISO) {
  if (!fechaISO) return '—';
  return new Date(fechaISO).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function folioTexto(folio) {
  return folio ? String(folio).padStart(4, '0') : 'sin folio';
}

// "Rendir caja chica": el cierre de una caja (folio) en tres pasos.
//   1) Aprobar la rendición de la caja: revisar el resumen, contar el
//      efectivo e ingresar el monto a reintegrar. Desde ahí no se aceptan
//      más solicitudes.
//   2) Descargar el PDF de solicitud de reintegro (con todos los
//      movimientos y respaldos del folio).
//   3) Cuando llega el dinero, registrar la recarga: se cierra el folio y
//      se abre el siguiente.
// También deja ver el historial de folios y volver a descargar su PDF.
export default function ModalReporteCajaChica({ reporte: reporteInicial, onCerrar, onRecargado, onCambio }) {
  const [reporte, setReporte] = useState(reporteInicial);
  const [efectivo, setEfectivo] = useState('');
  const [reintegro, setReintegro] = useState('');
  const [observacion, setObservacion] = useState('');
  const [editando, setEditando] = useState(false);
  const [montoRecarga, setMontoRecarga] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [historial, setHistorial] = useState(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const periodo = reporte.periodo;
  const aprobada = !!periodo?.rendicion_aprobada_at;
  const mostrarFormAprobar = !aprobada || editando;

  const saldoTeorico = Number(reporte.totales?.disponible || 0);
  const diferencia = efectivo === '' ? null : Number(efectivo) - saldoTeorico;

  async function refrescar() {
    const datos = await obtenerReporteCajaChica();
    setReporte(datos);
    if (onCambio) onCambio();
    return datos;
  }

  async function descargarPdf(datosReporte) {
    setDescargandoPdf(true);
    setError('');
    try {
      await generarPdfInformeCajaChica(datosReporte || reporte);
    } catch (err) {
      setError('No se pudo generar el PDF: ' + err.message);
    } finally {
      setDescargandoPdf(false);
    }
  }

  async function abrirHistorial() {
    if (historial !== null) return;
    setCargandoHistorial(true);
    try {
      const datos = await obtenerHistorialCajas();
      setHistorial(datos.periodos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoHistorial(false);
    }
  }

  async function descargarFolio(periodoId) {
    setError('');
    setDescargandoPdf(true);
    try {
      const datos = await obtenerReportePeriodo(periodoId);
      await generarPdfInformeCajaChica(datos);
    } catch (err) {
      setError('No se pudo generar el PDF: ' + err.message);
    } finally {
      setDescargandoPdf(false);
    }
  }

  function empezarEdicion() {
    setEfectivo(String(periodo.efectivo_contado ?? ''));
    setReintegro(String(periodo.monto_reintegro ?? ''));
    setObservacion(periodo.observacion_cuadratura || '');
    setEditando(true);
  }

  async function aprobarRendicion() {
    setError('');
    if (efectivo === '' || Number(efectivo) < 0) {
      setError('Ingresa el efectivo contado en la caja (puede ser 0).');
      return;
    }
    if (!Number(reintegro) || Number(reintegro) <= 0) {
      setError('Ingresa el monto a reintegrar.');
      return;
    }
    if (diferencia !== 0 && !observacion.trim()) {
      setError('El efectivo contado no coincide con el saldo teórico. Escribe una observación que explique la diferencia.');
      return;
    }
    setEnviando(true);
    try {
      await aprobarRendicionCaja({
        efectivo_contado: Number(efectivo),
        monto_reintegro: Number(reintegro),
        observacion,
      });
      setEditando(false);
      await refrescar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function registrarRecarga() {
    setError('');
    const m = Number(montoRecarga !== '' ? montoRecarga : periodo.monto_reintegro);
    if (!m || m <= 0) {
      setError('Ingresa el monto recibido para la recarga.');
      return;
    }
    const nuevoFolio = (periodo.folio || 0) + 1;
    const ok = window.confirm(
      `Se cerrará el folio ${folioTexto(periodo.folio)} y se abrirá el folio ${folioTexto(nuevoFolio)} con ${formatearCLP(
        Number(periodo.efectivo_contado) + m
      )}. ¿Confirmas?`
    );
    if (!ok) return;
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

  const comprobantesPorTipo = { factura: [], boleta: [], vale_por: [] };
  (reporte.solicitudes || []).forEach((s) => {
    if (s.estado === 'rechazada') return;
    (s.comprobantes || []).forEach((c) => {
      comprobantesPorTipo[c.tipo]?.push({ ...c, solicitante: s.solicitante_nombre, articulo: s.articulo });
    });
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-bold text-[#153A5B]">
            Rendir caja chica{periodo ? ` — Folio ${folioTexto(periodo.folio)}` : ''}
          </p>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {!periodo ? (
            <p className="text-sm text-slate-400 py-6 text-center">Aún no hay un fondo de caja chica abierto.</p>
          ) : (
            <>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">
                  Saldo inicial del folio {folioTexto(periodo.folio)} — {formatearFecha(periodo.fecha_inicio)}
                </p>
                <p className="text-lg font-bold text-[#153A5B]">{formatearCLP(periodo.monto_inicial)}</p>
              </div>

              {reporte.pendientesDeCierre > 0 && (
                <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Hay {reporte.pendientesDeCierre} solicitud(es) todavía en curso (sin rendir). Hay que
                  completarlas antes de poder aprobar la rendición de la caja.
                </p>
              )}

              <p className="text-xs font-bold text-slate-400 tracking-wide">SOLICITUDES DEL FOLIO</p>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {(reporte.solicitudes || []).length === 0 && (
                  <p className="text-sm text-slate-400 p-3">Sin solicitudes en este folio.</p>
                )}
                {(reporte.solicitudes || []).map((s) => (
                  <div key={s.id} className="px-3 py-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-bold text-[#153A5B]">{s.articulo}</span>
                      <span className="font-bold">{formatearCLP(s.monto_rendido ?? s.monto_solicitado)}</span>
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
                <p className="text-xs opacity-80">Total que debería haber físicamente en la caja ahora (saldo teórico)</p>
                <p className="text-xl font-bold">{formatearCLP(saldoTeorico)}</p>
              </div>

              {/* PASO 1: aprobar la rendición de la caja */}
              {reporte.pendientesDeCierre === 0 && mostrarFormAprobar && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-sm font-bold text-[#153A5B] mb-1">1. Aprobar la rendición de la caja</p>
                  <p className="text-xs text-slate-500 mb-3">
                    Cuenta el efectivo que hay en la caja e ingresa el monto que vas a pedir reintegrar. Al
                    aprobar, no se podrán hacer más solicitudes con este folio.
                  </p>
                  <label className="text-xs text-slate-500">Efectivo contado en caja</label>
                  <input
                    type="number"
                    placeholder="Efectivo contado"
                    value={efectivo}
                    onChange={(e) => setEfectivo(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2"
                  />
                  {diferencia !== null && (
                    <p
                      className={`text-xs font-bold mb-2 ${
                        diferencia === 0 ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {diferencia === 0
                        ? 'Cuadra con el saldo teórico.'
                        : `Diferencia contra el saldo teórico: ${diferencia < 0 ? '−' : '+'}${formatearCLP(
                            Math.abs(diferencia)
                          )}`}
                    </p>
                  )}
                  {diferencia !== null && diferencia !== 0 && (
                    <textarea
                      placeholder="Observación que explique la diferencia (obligatoria)"
                      value={observacion}
                      onChange={(e) => setObservacion(e.target.value)}
                      rows={2}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2"
                    />
                  )}
                  <label className="text-xs text-slate-500">Monto a reintegrar</label>
                  <input
                    type="number"
                    placeholder="Monto a reintegrar"
                    value={reintegro}
                    onChange={(e) => setReintegro(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2"
                  />
                  {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
                  <div className="flex gap-2">
                    {editando && (
                      <button
                        onClick={() => {
                          setEditando(false);
                          setError('');
                        }}
                        className="flex-1 bg-slate-100 text-slate-600 font-bold text-sm rounded-lg py-2"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      onClick={aprobarRendicion}
                      disabled={enviando}
                      className="flex-1 bg-[#0F5C8C] hover:bg-[#153A5B] text-white font-bold text-sm rounded-lg py-2 disabled:opacity-60"
                    >
                      {enviando ? 'Guardando…' : 'Aprobar rendición de la caja'}
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 2 y 3: PDF y recarga */}
              {aprobada && !editando && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-900">
                    <p className="font-bold mb-1">
                      Rendición aprobada el {formatearFecha(periodo.rendicion_aprobada_at)}
                      {periodo.rendicion_aprobada_por_nombre ? ` por ${periodo.rendicion_aprobada_por_nombre}` : ''}
                    </p>
                    <p>
                      Efectivo contado: <strong>{formatearCLP(periodo.efectivo_contado)}</strong> · Monto a
                      reintegrar: <strong>{formatearCLP(periodo.monto_reintegro)}</strong>
                    </p>
                    {Number(periodo.diferencia_cuadratura) !== 0 && (
                      <p className="mt-1 text-red-700">
                        Diferencia de {formatearCLP(Math.abs(Number(periodo.diferencia_cuadratura)))} (
                        {periodo.observacion_cuadratura})
                      </p>
                    )}
                    <p className="mt-1 opacity-80">Código de verificación: {periodo.codigo_verificacion}</p>
                    <p className="mt-1 opacity-80">No se aceptan más solicitudes hasta registrar la recarga.</p>
                  </div>

                  <p className="text-sm font-bold text-[#153A5B]">2. Solicitud de reintegro</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => descargarPdf()}
                      disabled={descargandoPdf}
                      className="flex-1 text-sm font-bold text-white bg-[#153A5B] hover:bg-[#0F5C8C] rounded-lg py-2.5 disabled:opacity-60"
                    >
                      {descargandoPdf ? 'Generando…' : '📄 Descargar PDF'}
                    </button>
                    <button
                      onClick={empezarEdicion}
                      className="text-xs font-bold text-[#0F5C8C] bg-blue-50 rounded-lg px-3"
                    >
                      Corregir montos
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-sm font-bold text-[#153A5B] mb-1">3. Registrar la recarga</p>
                    <p className="text-xs text-slate-500 mb-2">
                      Cuando llegue el dinero, ingresa lo recibido. Se cerrará el folio{' '}
                      {folioTexto(periodo.folio)} y se abrirá el folio {folioTexto((periodo.folio || 0) + 1)}, que
                      parte con el efectivo contado más lo recargado.
                    </p>
                    <input
                      type="number"
                      placeholder="Monto recibido"
                      value={montoRecarga !== '' ? montoRecarga : String(periodo.monto_reintegro ?? '')}
                      onChange={(e) => setMontoRecarga(e.target.value)}
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
                      onClick={registrarRecarga}
                      disabled={enviando}
                      className="w-full bg-[#0F5C8C] hover:bg-[#153A5B] text-white font-bold text-sm rounded-lg py-2 disabled:opacity-60"
                    >
                      {enviando ? 'Guardando…' : 'Registrar recarga y abrir caja nueva'}
                    </button>
                  </div>
                </div>
              )}

              {reporte.pendientesDeCierre > 0 && error && <p className="text-xs text-red-600">{error}</p>}
            </>
          )}

          {/* Historial de folios */}
          <details onToggle={(e) => e.target.open && abrirHistorial()}>
            <summary className="text-xs font-bold text-slate-400 tracking-wide cursor-pointer">
              CAJAS ANTERIORES (HISTORIAL DE FOLIOS)
            </summary>
            <div className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100">
              {cargandoHistorial && <p className="text-xs text-slate-400 p-3">Cargando…</p>}
              {historial && historial.length === 0 && (
                <p className="text-xs text-slate-400 p-3">Todavía no hay folios cerrados.</p>
              )}
              {(historial || []).map((h) => (
                <div key={h.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-[#153A5B]">Folio {folioTexto(h.folio)}</p>
                    <p className="text-slate-500">
                      {formatearFecha(h.fecha_inicio)} → {formatearFecha(h.fecha_cierre)} · inició con{' '}
                      {formatearCLP(h.monto_inicial)}
                      {h.monto_recargado ? ` · reintegro ${formatearCLP(h.monto_recargado)}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => descargarFolio(h.id)}
                    disabled={descargandoPdf}
                    className="text-xs font-bold text-[#0F5C8C] bg-blue-50 rounded-lg px-3 py-1.5 disabled:opacity-60 shrink-0"
                  >
                    📄 PDF
                  </button>
                </div>
              ))}
            </div>
          </details>
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
