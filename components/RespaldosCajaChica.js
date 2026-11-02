'use client';

import { useMemo, useState } from 'react';
import { urlFirmadaComprobante, obtenerReportePeriodo } from '@/lib/cajaChica';
import { generarPdfInformeCajaChica } from '@/lib/informeCajaChicaPdf';
import { verPdfDesgloseCajaChica } from '@/lib/desgloseCajaChicaPdf';
import { formatearCLP } from '@/lib/cajaChicaLogica';

const ETIQUETA_TIPO = { factura: 'Factura', boleta: 'Boleta', vale_por: 'Vale por' };
const ETIQUETA_ESTADO_SOL = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  entregada: 'Entregada',
  rendicion_ingresada: 'Rendición ingresada',
  rendida: 'Rendida',
  rechazada: 'Rechazada',
};
const ESTADO_FOLIO = {
  abierto: { texto: 'Abierto', clase: 'bg-green-100 text-green-800' },
  aprobado: { texto: 'Rendición aprobada', clase: 'bg-amber-100 text-amber-800' },
  cerrado: { texto: 'Cerrado', clase: 'bg-slate-200 text-slate-700' },
};

const folioTexto = (folio) => (folio ? String(folio).padStart(4, '0') : 'sin folio');
const soloFecha = (iso) => (iso ? String(iso).slice(0, 10) : '');
const fechaCorta = (iso) => {
  const f = soloFecha(iso);
  if (!f) return '—';
  const [a, m, d] = f.split('-');
  return `${d}-${m}-${a}`;
};
const normalizar = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Abre el archivo original de un comprobante (URL firmada temporal). Se
// abre la pestaña antes de pedir la URL para que el navegador no la bloquee.
async function abrirArchivo(storagePath, setMensaje) {
  const ventana = window.open('', '_blank');
  try {
    const url = await urlFirmadaComprobante(storagePath);
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
  } catch (err) {
    if (ventana) ventana.close();
    setMensaje('No se pudo abrir el archivo: ' + err.message);
  }
}

function FilaSolicitud({ sol, folio, setMensaje, mostrarFolio }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#153A5B]">
            {sol.articulo}
            {mostrarFolio && (
              <span className="ml-2 text-[10px] font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-full px-2 py-0.5">
                Folio {folioTexto(folio)}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {sol.solicitante_nombre} · {fechaCorta(sol.fecha_rendicion || sol.created_at)} ·{' '}
            {formatearCLP(sol.monto_solicitado)} · {ETIQUETA_ESTADO_SOL[sol.estado] || sol.estado}
          </p>
        </div>
        <button
          onClick={() => verPdfDesgloseCajaChica(sol)}
          className="shrink-0 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2"
        >
          Ver desglose
        </button>
      </div>

      {sol.comprobantes.length === 0 ? (
        <p className="text-xs text-slate-400 mt-2">Sin comprobantes cargados.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {sol.comprobantes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-600 min-w-0 truncate">
                <span className="font-bold">{ETIQUETA_TIPO[c.tipo] || c.tipo}</span>
                {c.numero_documento ? ` N° ${c.numero_documento}` : ''} · {formatearCLP(c.monto)}
                {c.descripcion ? ` · ${c.descripcion}` : ''}
              </p>
              {c.storage_path ? (
                <button
                  onClick={() => abrirArchivo(c.storage_path, setMensaje)}
                  className="shrink-0 text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-1.5"
                >
                  Ver factura
                </button>
              ) : (
                <span className="shrink-0 text-[10px] text-slate-400">Sin archivo</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RespaldosCajaChica({ folios }) {
  const [folioId, setFolioId] = useState(null);
  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [generando, setGenerando] = useState(false);

  const buscando = texto.trim() !== '' || desde !== '' || hasta !== '';

  const resultados = useMemo(() => {
    if (!buscando) return [];
    const q = normalizar(texto.trim());
    const salida = [];
    folios.forEach((f) =>
      f.solicitudes.forEach((s) => {
        const fecha = soloFecha(s.fecha_rendicion || s.created_at);
        if (desde && fecha < desde) return;
        if (hasta && fecha > hasta) return;
        if (q) {
          const pajar = normalizar(
            [
              s.solicitante_nombre,
              s.articulo,
              folioTexto(f.folio),
              ...s.comprobantes.flatMap((c) => [c.numero_documento, c.descripcion, ETIQUETA_TIPO[c.tipo]]),
            ].join(' ')
          );
          if (!pajar.includes(q)) return;
        }
        salida.push({ sol: s, folio: f.folio });
      })
    );
    return salida;
  }, [folios, texto, desde, hasta, buscando]);

  const folio = folios.find((f) => f.id === folioId) || null;

  async function descargarReintegro(f) {
    setGenerando(true);
    setMensaje('');
    try {
      const reporte = await obtenerReportePeriodo(f.id);
      await generarPdfInformeCajaChica(reporte);
    } catch (err) {
      setMensaje('No se pudo generar el PDF de reintegro: ' + err.message);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <label className="block">
          <span className="text-[10px] font-bold text-slate-400 tracking-wide">BUSCAR</span>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="N° de factura, persona, artículo, folio…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold text-slate-400 tracking-wide">DESDE</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold text-slate-400 tracking-wide">HASTA</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        {buscando && (
          <button
            onClick={() => {
              setTexto('');
              setDesde('');
              setHasta('');
            }}
            className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2.5"
          >
            Limpiar
          </button>
        )}
      </div>

      {mensaje && <p className="text-sm text-red-600 mb-3">{mensaje}</p>}

      {buscando && (
        <>
          <p className="text-xs text-slate-500 mb-2">
            {resultados.length} resultado{resultados.length === 1 ? '' : 's'}
          </p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {resultados.length === 0 && <p className="text-sm text-slate-400 p-4">Sin coincidencias.</p>}
            {resultados.map(({ sol, folio: nro }) => (
              <FilaSolicitud key={sol.id} sol={sol} folio={nro} setMensaje={setMensaje} mostrarFolio />
            ))}
          </div>
        </>
      )}

      {!buscando && !folio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {folios.length === 0 && <p className="text-sm text-slate-400 col-span-full">Aún no hay cajas registradas.</p>}
          {folios.map((f) => {
            const est = ESTADO_FOLIO[f.estado_folio];
            return (
              <button
                key={f.id}
                onClick={() => setFolioId(f.id)}
                className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-[#0F5C8C] transition-colors"
              >
                <p className="text-2xl mb-2">📂</p>
                <p className="text-sm font-bold text-[#153A5B]">Folio {folioTexto(f.folio)}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {f.solicitudes.length} solicitud{f.solicitudes.length === 1 ? '' : 'es'}
                </p>
                <span className={`inline-block mt-2 text-[10px] font-bold rounded-full px-2 py-0.5 ${est.clase}`}>
                  {est.texto}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!buscando && folio && (
        <div>
          <button onClick={() => setFolioId(null)} className="text-xs font-bold text-[#0F5C8C] mb-3">
            ← Todos los folios
          </button>
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#153A5B]">
                Folio {folioTexto(folio.folio)}{' '}
                <span
                  className={`ml-1 text-[10px] font-bold rounded-full px-2 py-0.5 ${ESTADO_FOLIO[folio.estado_folio].clase}`}
                >
                  {ESTADO_FOLIO[folio.estado_folio].texto}
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Abierto el {fechaCorta(folio.fecha_inicio)}
                {folio.fecha_cierre ? ` · cerrado el ${fechaCorta(folio.fecha_cierre)}` : ''} · fondo inicial{' '}
                {formatearCLP(folio.monto_inicial)}
                {folio.monto_reintegro != null ? ` · reintegro ${formatearCLP(folio.monto_reintegro)}` : ''}
              </p>
            </div>
            {folio.estado_folio === 'abierto' ? (
              <p className="text-xs text-slate-400">El PDF de reintegro estará disponible al aprobar la caja.</p>
            ) : (
              <button
                onClick={() => descargarReintegro(folio)}
                disabled={generando}
                className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-2 disabled:opacity-60"
              >
                {generando ? 'Generando…' : 'PDF de reintegro'}
              </button>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {folio.solicitudes.length === 0 && (
              <p className="text-sm text-slate-400 p-4">Este folio aún no tiene solicitudes.</p>
            )}
            {folio.solicitudes.map((s) => (
              <FilaSolicitud key={s.id} sol={s} folio={folio.folio} setMensaje={setMensaje} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
