'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import {
  obtenerRendicion,
  guardarCabecera,
  agregarLinea,
  eliminarLinea,
  subirRespaldo,
  eliminarRespaldo,
  urlFirmadaRespaldo,
  enviarRendicion,
  eliminarRendicion,
  resolverRendicion,
} from '@/lib/rendicionGastos';
import {
  CATEGORIAS,
  TIPOS_DOCUMENTO,
  estadoRendicionLabel,
  estadoRendicionStyle,
  etiquetaCategoria,
  etiquetaTipoDocumento,
  formatearMonto,
  totalLineas,
  fechasResolucionRendicion,
  mensajeDiferencia,
} from '@/lib/rendicionGastosLogica';
import { verPdfRendicionGastos, descargarPdfRendicionGastos } from '@/lib/rendicionGastosPdf';

const LINEA_VACIA = { fecha_gasto: '', descripcion: '', monto: '', categoria: 'otros', tipo_documento: 'boleta' };

export default function RendicionGastosDetalle() {
  const { id } = useParams();
  const router = useRouter();
  const { perfil, esJefatura, esRRHH } = useAuth();

  const [rendicion, setRendicion] = useState(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [moneda, setMoneda] = useState('CLP');
  const [tipoCambio, setTipoCambio] = useState('');
  const [totalEntregado, setTotalEntregado] = useState('0');
  const [equivalenteClp, setEquivalenteClp] = useState(null);
  const [guardandoCabecera, setGuardandoCabecera] = useState(false);

  const [nuevaLinea, setNuevaLinea] = useState(LINEA_VACIA);
  const [agregandoLinea, setAgregandoLinea] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState({});
  const [eliminandoLinea, setEliminandoLinea] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);

  async function cargar() {
    setError('');
    try {
      const r = await obtenerRendicion(id);
      if (!r) {
        setError('No se encontró esa rendición, o no tienes acceso a ella.');
        return;
      }
      setRendicion(r);
      setMoneda(r.moneda);
      setTipoCambio(r.tipo_cambio ? String(r.tipo_cambio) : '');
      setTotalEntregado(String(r.total_entregado_qdc ?? 0));
      setEquivalenteClp(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (perfil && id) cargar();
  }, [perfil?.id, id]);

  if (!perfil) return null;

  const esDueño = rendicion?.trabajador_id === perfil.id;
  const esBorrador = rendicion?.estado === 'borrador';
  const puedeAprobarEsta =
    !esDueño && (esJefatura || esRRHH) && ['pendiente', 'aprobada_jefe'].includes(rendicion?.estado);

  const lineas = rendicion?.rendicion_gastos_lineas || [];
  const total = totalLineas(lineas);
  const diferencia = Number(rendicion?.total_entregado_qdc || 0) - total;

  async function onGuardarCabecera() {
    setGuardandoCabecera(true);
    setError('');
    try {
      await guardarCabecera(id, {
        moneda,
        tipo_cambio: tipoCambio ? Number(tipoCambio) : null,
        total_entregado_qdc: Number(totalEntregado) || 0,
      });
      await cargar();
      setMensaje('Datos generales guardados.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoCabecera(false);
    }
  }

  async function onAgregarLinea(e) {
    e.preventDefault();
    setAgregandoLinea(true);
    setError('');
    try {
      await agregarLinea(id, { ...nuevaLinea, monto: Number(nuevaLinea.monto) });
      setNuevaLinea(LINEA_VACIA);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAgregandoLinea(false);
    }
  }

  async function onBorrarLinea(lineaId) {
    if (!confirm('¿Eliminar esta línea de gasto?')) return;
    setEliminandoLinea(lineaId);
    try {
      await eliminarLinea(lineaId);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEliminandoLinea(null);
    }
  }

  async function onSubirFoto(lineaId, file) {
    setSubiendoFoto((s) => ({ ...s, [lineaId]: true }));
    setError('');
    try {
      await subirRespaldo({ trabajadorId: perfil.id, rendicionId: id, lineaId, file });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendoFoto((s) => ({ ...s, [lineaId]: false }));
    }
  }

  async function onBorrarFoto(respaldoId, storagePath) {
    try {
      await eliminarRespaldo(respaldoId, storagePath);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onVerFoto(storagePath) {
    try {
      const url = await urlFirmadaRespaldo(storagePath);
      window.open(url, '_blank');
    } catch (err) {
      setError(err.message);
    }
  }

  async function onEnviar() {
    if (lineas.length === 0) {
      setError('Agrega al menos una línea de gasto antes de enviar.');
      return;
    }
    if (!confirm('¿Enviar esta rendición para su revisión? Ya no podrás editarla después.')) return;
    setEnviando(true);
    setError('');
    try {
      await enviarRendicion(id);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function onEliminarBorrador() {
    if (!confirm('¿Eliminar este borrador? Esta acción no se puede deshacer.')) return;
    setEliminando(true);
    setError('');
    try {
      await eliminarRendicion(id);
      router.push('/trabajador/rendicion-gastos');
    } catch (err) {
      setError(err.message);
      setEliminando(false);
    }
  }

  async function onResolver(estado) {
    setResolviendo(true);
    setError('');
    try {
      await resolverRendicion(id, estado);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setResolviendo(false);
    }
  }

  return (
    <AppShell links={trabajadorLinks} titulo="Rendición de Gastos">
      <button onClick={() => router.push('/trabajador/rendicion-gastos')} className="text-xs text-slate-500 mb-3">
        ‹ Volver
      </button>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      {mensaje && <p className="text-xs text-green-700 mb-3">{mensaje}</p>}
      {!rendicion && !error && <p className="text-sm text-slate-400">Cargando…</p>}

      {rendicion && (
        <>
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              {!esDueño && (
                <p className="text-sm font-bold text-[#153A5B]">{rendicion.trabajadores?.nombre_completo}</p>
              )}
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-full ${estadoRendicionStyle[rendicion.estado]}`}
              >
                {estadoRendicionLabel(rendicion.estado)}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => verPdfRendicionGastos(rendicion)}
                className="text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2"
              >
                Ver PDF
              </button>
              <button
                onClick={() => descargarPdfRendicionGastos(rendicion)}
                className="text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-2"
              >
                Descargar
              </button>
            </div>
          </div>

          {esDueño && !esBorrador && (
            <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4 space-y-0.5">
              {fechasResolucionRendicion(rendicion, rendicion.trabajadores?.jefe_directo_id).map((f) => (
                <p key={f.etiqueta} className="text-[10px] text-slate-400">
                  {f.etiqueta}: {new Date(f.fecha).toLocaleString('es-CL')}
                </p>
              ))}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 space-y-3">
            <p className="text-sm font-bold text-[#153A5B]">Datos generales</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Moneda</label>
                <select
                  disabled={!esBorrador || !esDueño}
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="CLP">CLP</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Total entregado por QDC</label>
                <input
                  disabled={!esBorrador || !esDueño}
                  type="number"
                  step="0.01"
                  value={totalEntregado}
                  onChange={(e) => setTotalEntregado(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            </div>

            {moneda === 'USD' && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">Tipo de cambio (valor del dólar, ingresado a mano)</label>
                <div className="flex gap-2">
                  <input
                    disabled={!esBorrador || !esDueño}
                    type="number"
                    step="0.01"
                    value={tipoCambio}
                    onChange={(e) => setTipoCambio(e.target.value)}
                    placeholder="Ej: 950"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setEquivalenteClp(total * Number(tipoCambio || 0))}
                    disabled={!tipoCambio}
                    className="text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2 disabled:opacity-50 shrink-0"
                  >
                    Convertir
                  </button>
                </div>
                {equivalenteClp !== null && (
                  <p className="text-xs text-slate-500 mt-1">
                    Total gastado equivalente: {formatearMonto(equivalenteClp, 'CLP')}
                  </p>
                )}
              </div>
            )}

            {esBorrador && esDueño && (
              <button
                onClick={onGuardarCabecera}
                disabled={guardandoCabecera}
                className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-2 disabled:opacity-60"
              >
                {guardandoCabecera ? 'Guardando…' : 'Guardar datos generales'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4 text-center">
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-bold text-[#153A5B]">{formatearMonto(rendicion.total_entregado_qdc, moneda)}</p>
              <p className="text-[10px] text-slate-500">Entregado por QDC</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-bold text-[#0F5C8C]">{formatearMonto(total, moneda)}</p>
              <p className="text-[10px] text-slate-500">Total gastado</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className={`text-sm font-bold ${diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatearMonto(diferencia, moneda)}
              </p>
              <p className="text-[10px] text-slate-500">Diferencia</p>
            </div>
          </div>

          <p className={`text-xs font-bold mb-4 ${diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {mensajeDiferencia(diferencia, moneda)}
          </p>

          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">LÍNEAS DE GASTO</p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
            {lineas.length === 0 && <p className="text-sm text-slate-400 p-4">Sin líneas cargadas.</p>}
            {lineas.map((l) => (
              <div key={l.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#153A5B]">
                      {formatearMonto(l.monto, moneda)} — {etiquetaCategoria(l.categoria)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(`${l.fecha_gasto}T00:00:00`).toLocaleDateString('es-CL')} ·{' '}
                      {etiquetaTipoDocumento(l.tipo_documento)}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{l.descripcion}</p>
                  </div>
                  {esBorrador && esDueño && (
                    <button
                      onClick={() => onBorrarLinea(l.id)}
                      disabled={eliminandoLinea === l.id}
                      className="text-[10px] font-bold text-red-700 bg-red-50 rounded-lg px-2 py-1 shrink-0 disabled:opacity-60"
                    >
                      {eliminandoLinea === l.id ? '…' : 'Eliminar'}
                    </button>
                  )}
                </div>

                {l.tipo_documento !== 'vale_por' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(l.rendicion_gastos_respaldos || []).map((r) => (
                      <div key={r.id} className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1">
                        <button onClick={() => onVerFoto(r.storage_path)} className="text-[10px] text-[#0F5C8C] font-bold">
                          📎 Ver respaldo
                        </button>
                        {esBorrador && esDueño && (
                          <button onClick={() => onBorrarFoto(r.id, r.storage_path)} className="text-[10px] text-red-600">
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {esBorrador && esDueño && (
                      <label className="text-[10px] font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-2 py-1 cursor-pointer">
                        {subiendoFoto[l.id] ? 'Subiendo…' : '+ Agregar foto'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={subiendoFoto[l.id]}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onSubirFoto(l.id, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {esBorrador && esDueño && (
            <form onSubmit={onAgregarLinea} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
              <p className="text-sm font-bold text-[#153A5B]">Agregar línea de gasto</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Fecha del gasto</label>
                  <input
                    required
                    type="date"
                    value={nuevaLinea.fecha_gasto}
                    onChange={(e) => setNuevaLinea({ ...nuevaLinea, fecha_gasto: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Monto ({moneda})</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={nuevaLinea.monto}
                    onChange={(e) => setNuevaLinea({ ...nuevaLinea, monto: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Categoría</label>
                  <select
                    value={nuevaLinea.categoria}
                    onChange={(e) => setNuevaLinea({ ...nuevaLinea, categoria: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Tipo de documento</label>
                  <select
                    value={nuevaLinea.tipo_documento}
                    onChange={(e) => setNuevaLinea({ ...nuevaLinea, tipo_documento: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  {nuevaLinea.tipo_documento === 'vale_por'
                    ? 'Justificación (explica a qué corresponde este gasto)'
                    : 'Descripción'}
                </label>
                <textarea
                  required
                  value={nuevaLinea.descripcion}
                  onChange={(e) => setNuevaLinea({ ...nuevaLinea, descripcion: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                disabled={agregandoLinea}
                className="w-full bg-[#153A5B] text-white font-bold rounded-lg py-2 text-sm disabled:opacity-60"
              >
                {agregandoLinea ? 'Agregando…' : 'Agregar línea'}
              </button>
            </form>
          )}

          {esBorrador && esDueño && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={onEliminarBorrador}
                disabled={eliminando}
                className="flex-1 text-xs font-bold text-red-700 bg-red-50 rounded-lg py-3 disabled:opacity-60"
              >
                {eliminando ? 'Eliminando…' : 'Eliminar borrador'}
              </button>
              <button
                onClick={onEnviar}
                disabled={enviando}
                className="flex-1 text-sm font-bold text-white bg-[#0F5C8C] rounded-lg py-3 disabled:opacity-60"
              >
                {enviando ? 'Enviando…' : 'Enviar para revisión'}
              </button>
            </div>
          )}

          {puedeAprobarEsta && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => onResolver('rechazada')}
                disabled={resolviendo}
                className="flex-1 text-sm font-bold text-red-800 bg-red-100 rounded-lg py-3 disabled:opacity-60"
              >
                Rechazar
              </button>
              <button
                onClick={() => onResolver('aprobada')}
                disabled={resolviendo}
                className="flex-1 text-sm font-bold text-green-800 bg-green-100 rounded-lg py-3 disabled:opacity-60"
              >
                Aprobar
              </button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
