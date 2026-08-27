'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import {
  obtenerEstadoCajaChica,
  crearSolicitudCajaChica,
  resolverSolicitudCajaChica,
  obtenerReporteCajaChica,
  obtenerTrabajadoresYAprobadoresRespaldo,
  agregarAprobadorRespaldo,
  quitarAprobadorRespaldo,
  recargarCajaChica,
} from '@/lib/cajaChica';
import { formatearCLP } from '@/lib/cajaChicaLogica';
import { generarPdfReciboCajaChica } from '@/lib/reciboCajaChicaPdf';
import { verPdfSolicitudCajaChica } from '@/lib/verSolicitudCajaChicaPdf';
import { verPdfDesgloseCajaChica, descargarPdfDesgloseCajaChica } from '@/lib/desgloseCajaChicaPdf';
import ModalRendirSolicitud from '@/components/ModalRendirSolicitud';
import ModalReporteCajaChica from '@/components/ModalReporteCajaChica';

const ETIQUETA_ESTADO = {
  pendiente: { texto: 'Pendiente', color: 'bg-amber-100 text-amber-800' },
  rechazada: { texto: 'Rechazada', color: 'bg-red-100 text-red-800' },
  aprobada: { texto: 'Aprobada — falta entregar', color: 'bg-blue-100 text-blue-800' },
  entregada: { texto: 'Entregada — falta rendir', color: 'bg-indigo-100 text-indigo-800' },
  rendicion_ingresada: { texto: 'Rendición por confirmar', color: 'bg-purple-100 text-purple-800' },
  rendida: { texto: 'Rendida', color: 'bg-green-100 text-green-800' },
};

function Chip({ estado }) {
  const info = ETIQUETA_ESTADO[estado] || { texto: estado, color: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${info.color}`}>{info.texto}</span>
  );
}

export default function CajaChicaVista() {
  const { perfil, esRRHH, esJefatura } = useAuth();
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const [mostrarFormInicial, setMostrarFormInicial] = useState(false);
  const [montoInicial, setMontoInicial] = useState('');

  const [mostrarFormSolicitud, setMostrarFormSolicitud] = useState(false);
  const [formSolicitud, setFormSolicitud] = useState({ monto_solicitado: '', articulo: '', razon: '' });
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);

  const [rechazando, setRechazando] = useState(null); // {id, motivo}
  const [rindiendo, setRindiendo] = useState(null); // solicitud
  const [reporte, setReporte] = useState(null);
  const [aprobadores, setAprobadores] = useState(null);
  const [seleccionAprobador, setSeleccionAprobador] = useState('');

  async function cargar() {
    setError('');
    try {
      const datos = await obtenerEstadoCajaChica();
      setEstado(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crearFondoInicial() {
    setError('');
    const m = Number(montoInicial);
    if (!m || m <= 0) {
      setError('Ingresa un monto válido.');
      return;
    }
    try {
      await recargarCajaChica(m, 'Fondo inicial');
      setMostrarFormInicial(false);
      setMontoInicial('');
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function enviarSolicitud() {
    setError('');
    const monto = Number(formSolicitud.monto_solicitado);
    if (!monto || monto <= 0) {
      setError('Ingresa un monto válido.');
      return;
    }
    if (estado?.totales && monto > estado.totales.disponible) {
      setError(
        `El monto solicitado (${formatearCLP(monto)}) supera el total disponible en caja chica (${formatearCLP(
          estado.totales.disponible
        )}). Ajusta el monto o espera a que se recargue el fondo.`
      );
      return;
    }
    setEnviandoSolicitud(true);
    try {
      await crearSolicitudCajaChica(formSolicitud);
      setMostrarFormSolicitud(false);
      setFormSolicitud({ monto_solicitado: '', articulo: '', razon: '' });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviandoSolicitud(false);
    }
  }

  async function accion(id, tipo, extra = {}) {
    setError('');
    try {
      await resolverSolicitudCajaChica(id, tipo, extra);
      setRechazando(null);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function abrirReporte() {
    try {
      const datos = await obtenerReporteCajaChica();
      setReporte(datos);
    } catch (err) {
      setError(err.message);
    }
  }

  async function abrirAprobadores() {
    try {
      const datos = await obtenerTrabajadoresYAprobadoresRespaldo();
      setAprobadores(datos.trabajadores);
    } catch (err) {
      setError(err.message);
    }
  }

  if (cargando) return <p className="text-sm text-slate-400">Cargando…</p>;
  if (!estado) return <p className="text-sm text-red-600">{error}</p>;

  const { periodo, totales, solicitudes } = estado;
  const pendientesDeAprobar = solicitudes.filter((s) => s.estado === 'pendiente' && s.puede_aprobar);
  const porEntregar = solicitudes.filter((s) => s.estado === 'aprobada');
  const rendicionesPorConfirmar = solicitudes.filter((s) => s.estado === 'rendicion_ingresada');
  const misSolicitudes = solicitudes.filter((s) => s.es_solicitante);
  const historial = solicitudes.filter((s) => ['rendida', 'rechazada'].includes(s.estado));

  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {!periodo ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <p className="text-sm font-bold text-[#153A5B] mb-2">Caja chica sin configurar</p>
          {esRRHH ? (
            mostrarFormInicial ? (
              <div className="space-y-2">
                <input
                  type="number"
                  placeholder="Monto inicial"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={crearFondoInicial}
                  className="w-full bg-[#0F5C8C] text-white font-bold text-sm rounded-lg py-2"
                >
                  Abrir caja chica con este monto
                </button>
              </div>
            ) : (
              <button
                onClick={() => setMostrarFormInicial(true)}
                className="text-xs font-bold text-white bg-[#0F5C8C] hover:bg-[#153A5B] rounded-lg px-3 py-2"
              >
                Ingresar monto inicial
              </button>
            )
          ) : (
            <p className="text-xs text-slate-500">RR.HH./administrador debe ingresar el monto inicial.</p>
          )}
        </div>
      ) : (
        <>
          {/* Totales */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Total disponible</p>
              <p className="text-xl font-bold text-[#153A5B]">{formatearCLP(totales.disponible)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">En proceso de compra</p>
              <p className="text-xl font-bold text-[#153A5B]">{formatearCLP(totales.enProceso)}</p>
            </div>
          </div>
          {esRRHH && (totales.vueltoPendiente > 0 || totales.deudorPendiente > 0) && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {totales.vueltoPendiente > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-[10px] text-amber-700 font-bold">VUELTO POR RECIBIR</p>
                  <p className="text-sm font-bold text-amber-800">{formatearCLP(totales.vueltoPendiente)}</p>
                </div>
              )}
              {totales.deudorPendiente > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-[10px] text-red-700 font-bold">SALDO DEUDOR POR ENTREGAR</p>
                  <p className="text-sm font-bold text-red-800">{formatearCLP(totales.deudorPendiente)}</p>
                </div>
              )}
            </div>
          )}

          {/* Solicitar compra */}
          {(esJefatura || esRRHH) && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
              {mostrarFormSolicitud ? (
                <div className="space-y-2">
                  <input
                    type="number"
                    placeholder="Monto a solicitar"
                    value={formSolicitud.monto_solicitado}
                    onChange={(e) => setFormSolicitud((f) => ({ ...f, monto_solicitado: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="¿Qué vas a comprar?"
                    value={formSolicitud.articulo}
                    onChange={(e) => setFormSolicitud((f) => ({ ...f, articulo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <textarea
                    placeholder="Razón de la compra"
                    value={formSolicitud.razon}
                    onChange={(e) => setFormSolicitud((f) => ({ ...f, razon: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMostrarFormSolicitud(false)}
                      className="flex-1 bg-slate-100 text-slate-600 font-bold text-sm rounded-lg py-2"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={enviarSolicitud}
                      disabled={enviandoSolicitud}
                      className="flex-1 bg-[#0F5C8C] text-white font-bold text-sm rounded-lg py-2 disabled:opacity-60"
                    >
                      {enviandoSolicitud ? 'Enviando…' : 'Enviar solicitud'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setMostrarFormSolicitud(true)}
                  className="w-full bg-[#0F5C8C] hover:bg-[#153A5B] text-white font-bold text-sm rounded-lg py-2"
                >
                  💵 Solicitar compra
                </button>
              )}
            </div>
          )}

          {/* Pendientes de mi aprobación */}
          {pendientesDeAprobar.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">PENDIENTES DE TU APROBACIÓN</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
                {pendientesDeAprobar.map((s) => (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex justify-between mb-1">
                      <p className="text-sm font-bold text-[#153A5B]">{s.solicitante_nombre}</p>
                      <p className="text-sm font-bold text-[#0F5C8C]">{formatearCLP(s.monto_solicitado)}</p>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {s.articulo} — {s.razon}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => verPdfSolicitudCajaChica(s)}
                        className="text-xs font-bold text-[#0F5C8C] bg-blue-50 rounded-lg px-3 py-1.5"
                      >
                        📄 Ver solicitud
                      </button>
                      <button
                        onClick={() => accion(s.id, 'aprobar')}
                        className="text-xs font-bold text-green-800 bg-green-100 rounded-lg px-3 py-1.5"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => setRechazando({ id: s.id, motivo: '' })}
                        className="text-xs font-bold text-red-800 bg-red-100 rounded-lg px-3 py-1.5"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Por entregar (RRHH) */}
          {esRRHH && porEntregar.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">APROBADAS — POR ENTREGAR</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
                {porEntregar.map((s) => (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex justify-between mb-1">
                      <p className="text-sm font-bold text-[#153A5B]">{s.solicitante_nombre}</p>
                      <p className="text-sm font-bold text-[#0F5C8C]">{formatearCLP(s.monto_solicitado)}</p>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{s.articulo}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => generarPdfReciboCajaChica(s)}
                        className="text-xs font-bold text-[#0F5C8C] bg-blue-50 rounded-lg px-3 py-1.5"
                      >
                        📄 Recibo PDF
                      </button>
                      <button
                        onClick={() => accion(s.id, 'entregar')}
                        className="text-xs font-bold text-green-800 bg-green-100 rounded-lg px-3 py-1.5"
                      >
                        Marcar como entregado
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Rendiciones por confirmar (RRHH) */}
          {esRRHH && rendicionesPorConfirmar.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">RENDICIONES POR CONFIRMAR</p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
                {rendicionesPorConfirmar.map((s) => {
                  const diferencia = Number(s.monto_solicitado) - Number(s.monto_rendido);
                  return (
                    <div key={s.id} className="px-4 py-3">
                      <div className="flex justify-between mb-1">
                        <p className="text-sm font-bold text-[#153A5B]">{s.solicitante_nombre}</p>
                        <p className="text-xs text-slate-500">
                          Rendido {formatearCLP(s.monto_rendido)} de {formatearCLP(s.monto_solicitado)}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{s.articulo}</p>
                      {diferencia > 0 && (
                        <p className="text-xs font-bold text-amber-700 mb-2">
                          Vuelto a recibir: {formatearCLP(diferencia)}
                        </p>
                      )}
                      {diferencia < 0 && (
                        <p className="text-xs font-bold text-red-700 mb-2">
                          Saldo a entregar: {formatearCLP(-diferencia)}
                        </p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => verPdfDesgloseCajaChica(s)}
                          className="text-xs font-bold text-[#0F5C8C] bg-blue-50 rounded-lg px-3 py-1.5"
                        >
                          📄 Ver desglose
                        </button>
                        <button
                          onClick={() => descargarPdfDesgloseCajaChica(s)}
                          className="text-xs font-bold text-[#0F5C8C] bg-blue-50 rounded-lg px-3 py-1.5"
                        >
                          ⬇️ Descargar
                        </button>
                        <button
                          onClick={() => accion(s.id, 'confirmar_rendicion')}
                          className="text-xs font-bold text-green-800 bg-green-100 rounded-lg px-3 py-1.5"
                        >
                          Confirmar rendición
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Mis solicitudes */}
          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">MIS SOLICITUDES</p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
            {misSolicitudes.length === 0 && (
              <p className="text-sm text-slate-400 p-4">Aún no has solicitado nada en este período.</p>
            )}
            {misSolicitudes.map((s) => (
              <div key={s.id} className="px-4 py-3">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm font-bold text-[#153A5B]">{s.articulo}</p>
                  <Chip estado={s.estado} />
                </div>
                <p className="text-xs text-slate-500 mb-2">{formatearCLP(s.monto_solicitado)}</p>
                {s.estado === 'rechazada' && s.motivo_rechazo && (
                  <p className="text-xs text-red-600 mb-2">Motivo: {s.motivo_rechazo}</p>
                )}
                {s.estado === 'entregada' && (
                  <button
                    onClick={() => setRindiendo(s)}
                    className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-1.5"
                  >
                    Rendir cuentas
                  </button>
                )}
                {(s.estado === 'rendicion_ingresada' || s.estado === 'rendida') && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => verPdfDesgloseCajaChica(s)}
                      className="text-xs font-bold text-[#0F5C8C] bg-blue-50 rounded-lg px-3 py-1.5"
                    >
                      📄 Ver desglose
                    </button>
                    <button
                      onClick={() => descargarPdfDesgloseCajaChica(s)}
                      className="text-xs font-bold text-[#0F5C8C] bg-blue-50 rounded-lg px-3 py-1.5"
                    >
                      ⬇️ Descargar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Historial */}
          {historial.length > 0 && (
            <details className="mb-4">
              <summary className="text-xs font-bold text-slate-400 tracking-wide cursor-pointer">
                HISTORIAL DEL PERÍODO ({historial.length})
              </summary>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mt-2">
                {historial.map((s) => (
                  <div key={s.id} className="px-4 py-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-bold text-[#153A5B]">{s.articulo}</p>
                      <p className="text-xs text-slate-500">{s.solicitante_nombre}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#0F5C8C]">{formatearCLP(s.monto_solicitado)}</p>
                      <Chip estado={s.estado} />
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Administración (RRHH) */}
          {esRRHH && (
            <>
              <button
                onClick={abrirReporte}
                className="w-full bg-[#153A5B] hover:bg-[#0F5C8C] text-white font-bold text-sm rounded-lg py-2.5 mb-4"
              >
                📋 Rendir caja chica
              </button>

              <details>
                <summary className="text-xs font-bold text-slate-400 tracking-wide cursor-pointer mb-2">
                  APROBADORES DE RESPALDO
                </summary>
                <div className="bg-white rounded-xl border border-slate-200 p-4 mt-2">
                  <p className="text-xs text-slate-500 mb-3">
                    Pueden aprobar solicitudes cuando el solicitante no tiene un jefe directo con acceso
                    a este módulo (por ejemplo, si RR.HH./administrador solicita).
                  </p>
                  {(estado.aprobadoresRespaldo || []).map((a) => (
                    <div key={a.trabajador_id} className="flex items-center justify-between py-1.5">
                      <p className="text-sm text-[#153A5B]">{a.nombre_completo}</p>
                      <button
                        onClick={async () => {
                          await quitarAprobadorRespaldo(a.trabajador_id);
                          cargar();
                        }}
                        className="text-xs text-red-600"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                  {aprobadores === null ? (
                    <button onClick={abrirAprobadores} className="text-xs font-bold text-[#0F5C8C] mt-2">
                      + Agregar aprobador
                    </button>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <select
                        value={seleccionAprobador}
                        onChange={(e) => setSeleccionAprobador(e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="">Elegir trabajador…</option>
                        {aprobadores.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre_completo}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={async () => {
                          if (!seleccionAprobador) return;
                          await agregarAprobadorRespaldo(seleccionAprobador);
                          setSeleccionAprobador('');
                          cargar();
                        }}
                        className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-1.5"
                      >
                        Agregar
                      </button>
                    </div>
                  )}
                </div>
              </details>
            </>
          )}
        </>
      )}

      {rechazando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <p className="text-sm font-bold text-[#153A5B] mb-2">Motivo del rechazo</p>
            <textarea
              value={rechazando.motivo}
              onChange={(e) => setRechazando((r) => ({ ...r, motivo: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
              rows={3}
              placeholder="Explica brevemente por qué se rechaza (opcional)"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRechazando(null)}
                className="flex-1 bg-slate-100 text-slate-600 font-bold text-sm rounded-lg py-2"
              >
                Cancelar
              </button>
              <button
                onClick={() => accion(rechazando.id, 'rechazar', { motivo: rechazando.motivo })}
                className="flex-1 bg-red-600 text-white font-bold text-sm rounded-lg py-2"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {rindiendo && (
        <ModalRendirSolicitud
          solicitud={rindiendo}
          trabajadorId={perfil.id}
          onCerrar={() => setRindiendo(null)}
          onListo={() => {
            setRindiendo(null);
            cargar();
          }}
        />
      )}

      {reporte && (
        <ModalReporteCajaChica
          reporte={reporte}
          onCerrar={() => setReporte(null)}
          onRecargado={() => {
            setReporte(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
