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

export default function RevisarSolicitud() {
  const { tipo, token } = useParams();
  const esPermiso = tipo === 'permiso';
  const esValido = tipo === 'permiso' || tipo === 'vacaciones';

  const [cargando, setCargando] = useState(true);
  const [solicitud, setSolicitud] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    setCargando(true);
    const fn = esPermiso ? 'obtener_solicitud_permiso_token' : 'obtener_solicitud_vacaciones_token';
    const { data, error } = await supabase.rpc(fn, { p_token: token });
    setSolicitud(!error && data && data.length > 0 ? data[0] : null);
    setCargando(false);
  }

  useEffect(() => {
    if (esValido) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, token]);

  async function decidir(accion) {
    setEnviando(true);
    const fn = esPermiso ? 'resolver_solicitud_permiso' : 'resolver_solicitud_vacaciones';
    const { data, error } = await supabase.rpc(fn, { p_token: token, p_accion: accion });
    setEnviando(false);
    if (error) {
      setResultado({ ok: false, mensaje: 'Ocurrió un error, intenta de nuevo.' });
      return;
    }
    const r = Array.isArray(data) ? data[0] : data;
    setResultado(r);
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

  if (solicitud.estado !== 'pendiente') {
    return <Contenedor>Esta solicitud ya fue revisada anteriormente.</Contenedor>;
  }

  return (
    <Contenedor>
      <p className="text-sm text-slate-500 mb-1">
        {esPermiso ? 'Solicitud de permiso' : 'Solicitud de vacaciones'}
      </p>
      <p className="text-lg font-bold text-[#153A5B] mb-4">
        {solicitud.nombre_completo} · RUT {solicitud.rut}
      </p>

      {esPermiso ? (
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
      ) : (
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
      )}

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
