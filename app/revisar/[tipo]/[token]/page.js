'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function formatFechaCorta(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatearMonto(monto, moneda) {
  if (moneda === 'USD') return `US$${Number(monto).toLocaleString('es-CL')}`;
  return `$${Number(monto).toLocaleString('es-CL')}`;
}

const TIPOS_VALIDOS = ['permiso', 'vacaciones', 'caja-chica', 'rendicion-gastos'];

export default function RevisarSolicitud() {
  const { tipo, token } = useParams();
  const esValido = TIPOS_VALIDOS.includes(tipo);

  const [cargando, setCargando] = useState(true);
  const [solicitud, setSolicitud] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    setCargando(true);
    let data, error;

    if (tipo === 'permiso') {
      ({ data, error } = await supabase.rpc('obtener_solicitud_permiso_token', { p_token: token }));
    } else if (tipo === 'vacaciones') {
      ({ data, error } = await supabase.rpc('obtener_solicitud_vacaciones_token', { p_token: token }));
    } else if (tipo === 'caja-chica') {
      ({ data, error } = await supabase.rpc('obtener_solicitud_caja_chica_token', { p_token: token }));
    } else if (tipo === 'rendicion-gastos') {
      ({ data, error } = await supabase.rpc('obtener_rendicion_gastos_token', { p_token: token }));
    }

    setSolicitud(!error && data && data.length > 0 ? data[0] : null);
    setCargando(false);
  }

  useEffect(() => {
    if (esValido) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, token]);

  async function decidir(accion) {
    setEnviando(true);

    if (tipo === 'permiso' || tipo === 'vacaciones') {
      // Resolución por RPC (permisos y vacaciones)
      const fn = tipo === 'permiso' ? 'resolver_solicitud_permiso' : 'resolver_solicitud_vacaciones';
      const { data, error } = await supabase.rpc(fn, { p_token: token, p_accion: accion });
      setEnviando(false);
      if (error) {
        setResultado({ ok: false, mensaje: 'Ocurrió un error, intenta de nuevo.' });
        return;
      }
      const r = Array.isArray(data) ? data[0] : data;
      setResultado(r);
      return;
    }

    // Caja chica y rendición de gastos: resolución por API route
    try {
      const res = await fetch('/api/revisar/resolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, token, accion }),
      });
      const r = await res.json();
      setResultado(r);
    } catch {
      setResultado({ ok: false, mensaje: 'Ocurrió un error, intenta de nuevo.' });
    }
    setEnviando(false);
  }

  if (!esValido) {
    return <Contenedor>Enlace inválido.</Contenedor>;
  }

  if (cargando) {
    return <Contenedor>Cargando…</Contenedor>;
  }

  if (resultado) {
    return (
      <Contenedor>
        <p className={`text-lg font-bold ${resultado.ok ? 'text-green-700' : 'text-red-700'}`}>
          {resultado.ok ? '✔ Listo' : 'No se pudo procesar'}
        </p>
        <p className="text-sm text-slate-600 mt-2">{resultado.mensaje}</p>
      </Contenedor>
    );
  }

  if (!solicitud) {
    return <Contenedor>Este enlace ya no es válido, expiró o la solicitud ya fue revisada.</Contenedor>;
  }

  // Verificar que la solicitud esté en un estado que permita revisión
  const estadoRevisable =
    tipo === 'caja-chica'
      ? solicitud.estado === 'pendiente'
      : tipo === 'rendicion-gastos'
        ? solicitud.estado === 'pendiente' || solicitud.estado === 'aprobada_jefe'
        : solicitud.estado === 'pendiente';

  if (!estadoRevisable) {
    return <Contenedor>Esta solicitud ya fue revisada anteriormente.</Contenedor>;
  }

  return (
    <Contenedor>
      <p className="text-sm text-slate-500 mb-1">{tituloTipo(tipo, solicitud)}</p>
      <p className="text-lg font-bold text-[#153A5B] mb-4">
        {solicitud.nombre_completo} · RUT {solicitud.rut}
      </p>

      <DetalleSolicitud tipo={tipo} solicitud={solicitud} />

      <div className="flex gap-3">
        <button
          disabled={enviando}
          onClick={() => decidir('aprobada')}
          className="flex-1 bg-green-600 text-white font-bold rounded-lg py-3 text-sm disabled:opacity-50"
        >
          Aprobar
        </button>
        <button
          disabled={enviando}
          onClick={() => decidir('rechazada')}
          className="flex-1 bg-red-600 text-white font-bold rounded-lg py-3 text-sm disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
    </Contenedor>
  );
}

// ---------------------------------------------------------------------------
// Título según tipo
// ---------------------------------------------------------------------------
function tituloTipo(tipo, solicitud) {
  if (tipo === 'permiso') return 'Solicitud de permiso';
  if (tipo === 'vacaciones') return 'Solicitud de vacaciones';
  if (tipo === 'caja-chica') return 'Solicitud de caja chica';
  if (tipo === 'rendicion-gastos') {
    if (solicitud?.revision_etapa === 'finanzas') return 'Rendición de gastos — firma Finanzas';
    return 'Rendición de gastos';
  }
  return 'Solicitud';
}

// ---------------------------------------------------------------------------
// Detalle según tipo
// ---------------------------------------------------------------------------
function DetalleSolicitud({ tipo, solicitud }) {
  if (tipo === 'permiso') {
    return (
      <div className="text-sm text-slate-700 space-y-1 mb-6">
        <p>
          <strong>Fecha:</strong>{' '}
          {solicitud.fecha_desde === solicitud.fecha_hasta
            ? formatFechaCorta(solicitud.fecha_desde)
            : `${formatFechaCorta(solicitud.fecha_desde)} — ${formatFechaCorta(solicitud.fecha_hasta)}`}
        </p>
        {solicitud.hora_desde && solicitud.hora_hasta && (
          <p>
            <strong>Horario:</strong> {solicitud.hora_desde.slice(0, 5)} a{' '}
            {solicitud.hora_hasta.slice(0, 5)} hrs
          </p>
        )}
        <p>
          <strong>Tipo:</strong> {solicitud.tipo_permiso || '—'}
        </p>
        {solicitud.motivo && (
          <p>
            <strong>Motivo:</strong> {solicitud.motivo}
          </p>
        )}
      </div>
    );
  }

  if (tipo === 'vacaciones') {
    return (
      <div className="text-sm text-slate-700 space-y-1 mb-6">
        <p>
          <strong>Desde:</strong> {formatFechaCorta(solicitud.fecha_desde)}
        </p>
        <p>
          <strong>Hasta:</strong> {formatFechaCorta(solicitud.fecha_hasta)}
        </p>
        <p>
          <strong>Días hábiles:</strong> {solicitud.dias_habiles}
        </p>
      </div>
    );
  }

  if (tipo === 'caja-chica') {
    return (
      <div className="text-sm text-slate-700 space-y-1 mb-6">
        <p>
          <strong>Monto:</strong> {formatearMonto(solicitud.monto_solicitado, 'CLP')}
        </p>
        <p>
          <strong>Artículo:</strong> {solicitud.articulo}
        </p>
        <p>
          <strong>Razón:</strong> {solicitud.razon}
        </p>
      </div>
    );
  }

  if (tipo === 'rendicion-gastos') {
    const moneda = solicitud.moneda || 'CLP';
    return (
      <div className="text-sm text-slate-700 space-y-1 mb-6">
        <p>
          <strong>Total gastos:</strong> {formatearMonto(solicitud.total_lineas, moneda)}
        </p>
        {solicitud.total_entregado_qdc > 0 && (
          <p>
            <strong>Entregado por QDC:</strong> {formatearMonto(solicitud.total_entregado_qdc, moneda)}
          </p>
        )}
        {solicitud.revision_etapa === 'finanzas' && (
          <p className="text-xs text-slate-500 mt-2">
            Ya fue aprobada por el jefe directo. Ahora necesita la aprobación de Finanzas.
          </p>
        )}
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Contenedor visual
// ---------------------------------------------------------------------------
function Contenedor({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-sm text-center">
        {typeof children === 'string' ? (
          <p className="text-sm text-slate-500">{children}</p>
        ) : (
          <div className="text-left">{children}</div>
        )}
      </div>
    </div>
  );
}
