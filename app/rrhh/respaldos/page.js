'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import { obtenerResumenRespaldos } from '@/lib/respaldos';
import {
  TIPOS_RESPALDO,
  etiquetaTipoRespaldo,
  agruparPorTrabajador,
  agruparPorMes,
  resumenDocumento,
} from '@/lib/respaldosLogica';
import { formatFechaCorta } from '@/lib/pdfComun';
import { verPdfPermiso, descargarPdfPermiso, verPdfVacaciones, descargarPdfVacaciones } from '@/lib/solicitudPdf';
import { verPdfDesgloseCajaChica, descargarPdfDesgloseCajaChica } from '@/lib/desgloseCajaChicaPdf';
import { verPdfRendicionGastos, descargarPdfRendicionGastos } from '@/lib/rendicionGastosPdf';

function abrirPdf(item) {
  if (item._tipo === 'permisos') return verPdfPermiso(item.solicitud, item.trabajador);
  if (item._tipo === 'vacaciones') return verPdfVacaciones(item.solicitud, item.trabajador);
  if (item._tipo === 'cajaChica') return verPdfDesgloseCajaChica(item.solicitud);
  if (item._tipo === 'rendicionGastos') return verPdfRendicionGastos(item.rendicion);
}

function descargarPdf(item) {
  if (item._tipo === 'permisos') return descargarPdfPermiso(item.solicitud, item.trabajador);
  if (item._tipo === 'vacaciones') return descargarPdfVacaciones(item.solicitud, item.trabajador);
  if (item._tipo === 'cajaChica') return descargarPdfDesgloseCajaChica(item.solicitud);
  if (item._tipo === 'rendicionGastos') return descargarPdfRendicionGastos(item.rendicion);
}

function CarpetaCard({ icono, etiqueta, total, nuevos, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-[#0F5C8C] transition-colors"
    >
      {nuevos > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] px-1.5 flex items-center justify-center">
          {nuevos > 9 ? '9+' : nuevos}
        </span>
      )}
      <p className="text-2xl mb-2">{icono}</p>
      <p className="text-sm font-bold text-[#153A5B]">{etiqueta}</p>
      <p className="text-xs text-slate-500 mt-0.5">
        {total} documento{total === 1 ? '' : 's'}
      </p>
    </button>
  );
}

function FilaDocumento({ item }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#153A5B] flex items-center gap-2">
          {formatFechaCorta((item.fecha || '').slice(0, 10))}
          {item.nuevo && (
            <span className="text-[9px] font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">NUEVO</span>
          )}
        </p>
        <p className="text-xs text-slate-500 truncate">
          {item.trabajador_nombre} · {resumenDocumento(item)}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => abrirPdf(item)}
          className="text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2"
        >
          Ver PDF
        </button>
        <button
          onClick={() => descargarPdf(item)}
          className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2"
        >
          Descargar
        </button>
      </div>
    </div>
  );
}

export default function RespaldosAdmin() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [tipo, setTipo] = useState(null);
  const [trabajadorId, setTrabajadorId] = useState(null);
  const [mes, setMes] = useState(null);

  useEffect(() => {
    obtenerResumenRespaldos()
      .then(setDatos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  function volverATipos() {
    setTipo(null);
    setTrabajadorId(null);
    setMes(null);
  }
  function volverATrabajadores() {
    setTrabajadorId(null);
    setMes(null);
  }
  function volverAMeses() {
    setMes(null);
  }

  if (cargando) {
    return (
      <AppShell links={rrhhLinks} titulo="Respaldos" requiereRRHH requiereAdministrador>
        <p className="text-sm text-slate-400">Cargando…</p>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell links={rrhhLinks} titulo="Respaldos" requiereRRHH requiereAdministrador>
        <p className="text-sm text-red-600">{error}</p>
      </AppShell>
    );
  }

  const conTipo = (lista, t) => lista.map((item) => ({ ...item, _tipo: t }));
  const porTipo = {
    permisos: conTipo(datos.tipos.permisos, 'permisos'),
    vacaciones: conTipo(datos.tipos.vacaciones, 'vacaciones'),
    cajaChica: conTipo(datos.tipos.cajaChica, 'cajaChica'),
    rendicionGastos: conTipo(datos.tipos.rendicionGastos, 'rendicionGastos'),
  };
  const todos = [...porTipo.permisos, ...porTipo.vacaciones, ...porTipo.cajaChica, ...porTipo.rendicionGastos];
  const nuevos = todos.filter((i) => i.nuevo).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return (
    <AppShell links={rrhhLinks} titulo="Respaldos" requiereRRHH requiereAdministrador>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-4 flex-wrap">
        <button onClick={volverATipos} className={`hover:underline ${!tipo ? 'font-bold text-[#153A5B]' : ''}`}>
          Respaldos
        </button>
        {tipo && (
          <>
            <span>›</span>
            <button
              onClick={volverATrabajadores}
              className={`hover:underline ${!trabajadorId ? 'font-bold text-[#153A5B]' : ''}`}
            >
              {etiquetaTipoRespaldo(tipo)}
            </button>
          </>
        )}
        {trabajadorId && (
          <>
            <span>›</span>
            <button onClick={volverAMeses} className={`hover:underline ${!mes ? 'font-bold text-[#153A5B]' : ''}`}>
              {porTipo[tipo].find((i) => i.trabajador_id === trabajadorId)?.trabajador_nombre || '—'}
            </button>
          </>
        )}
        {mes && (
          <>
            <span>›</span>
            <span className="font-bold text-[#153A5B]">
              {agruparPorMes(porTipo[tipo].filter((i) => i.trabajador_id === trabajadorId)).find((m) => m.clave === mes)
                ?.etiqueta}
            </span>
          </>
        )}
      </div>

      {/* Nivel 0: tipos, con el bloque de "Nuevos" arriba */}
      {!tipo && (
        <>
          {nuevos.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-red-700 tracking-wide mb-2">🆕 NUEVOS ({nuevos.length})</p>
              <div className="bg-white rounded-xl border border-red-200 divide-y divide-slate-100">
                {nuevos.map((item) => (
                  <FilaDocumento key={`${item._tipo}-${item.id}`} item={item} />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">CARPETAS</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TIPOS_RESPALDO.map((t) => (
              <CarpetaCard
                key={t.key}
                icono={t.icon}
                etiqueta={t.label}
                total={porTipo[t.key].length}
                nuevos={porTipo[t.key].filter((i) => i.nuevo).length}
                onClick={() => setTipo(t.key)}
              />
            ))}
          </div>
        </>
      )}

      {/* Nivel 1: trabajadores dentro de un tipo */}
      {tipo && !trabajadorId && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {agruparPorTrabajador(porTipo[tipo]).length === 0 && (
            <p className="text-sm text-slate-400 col-span-full">Sin documentos en esta carpeta todavía.</p>
          )}
          {agruparPorTrabajador(porTipo[tipo]).map((carpeta) => (
            <CarpetaCard
              key={carpeta.trabajador_id}
              icono="👤"
              etiqueta={carpeta.trabajador_nombre}
              total={carpeta.docs.length}
              nuevos={carpeta.nuevos}
              onClick={() => setTrabajadorId(carpeta.trabajador_id)}
            />
          ))}
        </div>
      )}

      {/* Nivel 2: meses dentro de un trabajador */}
      {tipo && trabajadorId && !mes && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {agruparPorMes(porTipo[tipo].filter((i) => i.trabajador_id === trabajadorId)).map((carpeta) => (
            <CarpetaCard
              key={carpeta.clave}
              icono="📅"
              etiqueta={carpeta.etiqueta}
              total={carpeta.docs.length}
              nuevos={carpeta.nuevos}
              onClick={() => setMes(carpeta.clave)}
            />
          ))}
        </div>
      )}

      {/* Nivel 3: documentos del mes */}
      {tipo && trabajadorId && mes && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {porTipo[tipo]
            .filter((i) => i.trabajador_id === trabajadorId && i.fecha && i.fecha.slice(0, 7) === mes)
            .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
            .map((item) => (
              <FilaDocumento key={item.id} item={item} />
            ))}
        </div>
      )}
    </AppShell>
  );
}
