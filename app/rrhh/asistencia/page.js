'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';

function formatearMinutos(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function AsistenciaRRHH() {
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [periodos, setPeriodos] = useState([]);
  const fileInputRef = useRef(null);

  async function cargarPeriodos() {
    const { data } = await supabase
      .from('asistencia_mensual')
      .select('periodo_desde, periodo_hasta')
      .order('periodo_desde', { ascending: false });
    const vistos = new Set();
    const lista = [];
    (data || []).forEach((r) => {
      const clave = `${r.periodo_desde}_${r.periodo_hasta}`;
      if (!vistos.has(clave)) {
        vistos.add(clave);
        lista.push(r);
      }
    });
    setPeriodos(lista);
  }

  useEffect(() => {
    cargarPeriodos();
  }, []);

  async function subir(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    setError('');
    setResultado(null);
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion?.session?.access_token;
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch('/api/admin/subir-asistencia', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.error || 'Ocurrió un error al procesar el archivo.');
      } else {
        setResultado(json);
        cargarPeriodos();
      }
    } catch (err) {
      setError('Ocurrió un error al procesar el archivo: ' + err.message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <AppShell links={rrhhLinks} titulo="Asistencia" requiereRRHH>
      <Link href="/rrhh" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver al Dashboard
      </Link>

      <p className="text-xs text-slate-500 mb-4">
        Sube cada mes el "Reporte de asistencia simplificado" que exporta el sistema de marcaje (un
        archivo .xls con una hoja por trabajador). La app toma de ahí, para cada trabajador, los días
        de inasistencia y los minutos de atraso del período — ya calculados respetando el horario real
        de cada uno — y los muestra en su perfil. Como respaldo, si alguna inasistencia del reporte
        cae en fechas con vacaciones ya aprobadas en la app, se descuenta automáticamente (por si el
        sistema de marcaje no quedó bien sincronizado con esas vacaciones).
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <p className="text-sm font-bold text-[#153A5B] mb-3">Subir reporte mensual</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={subiendo}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm disabled:opacity-60"
        >
          {subiendo ? 'Procesando…' : '📁 Elegir archivo .xls'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={subir}
        />
        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      </div>

      {resultado && (
        <div className="mb-6 space-y-3">
          <p className="text-xs font-bold text-slate-400 tracking-wide">
            RESULTADO — {resultado.actualizados.length} trabajador(es) actualizados
          </p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {resultado.actualizados.map((a) => (
              <div key={a.rut + a.periodo_desde} className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-[#153A5B]">{a.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {a.periodo_desde} → {a.periodo_hasta}
                  </p>
                  {a.fechas_ajustadas_por_vacaciones?.length > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      Se descontaron {a.fechas_ajustadas_por_vacaciones.length} inasistencia(s) del
                      reporte ({a.fechas_ajustadas_por_vacaciones.join(', ')}) por coincidir con
                      vacaciones ya aprobadas en la app — el archivo traía{' '}
                      {a.dias_inasistencia_original}.
                    </p>
                  )}
                </div>
                <p className="text-xs text-slate-500 text-right shrink-0">
                  {a.dias_inasistencia} inasist. · {formatearMinutos(a.atraso_minutos)} atraso
                </p>
              </div>
            ))}
          </div>

          {resultado.noEncontrados.length > 0 && (
            <>
              <p className="text-xs font-bold text-red-600 tracking-wide">
                NO SE PUDIERON EMPAREJAR ({resultado.noEncontrados.length})
              </p>
              <div className="bg-white rounded-xl border border-red-200 divide-y divide-red-100">
                {resultado.noEncontrados.map((n) => (
                  <div key={n.rut + n.hoja} className="px-4 py-3">
                    <p className="text-sm font-bold text-red-700">{n.rut}</p>
                    <p className="text-xs text-slate-500">
                      Hoja "{n.hoja}" — no existe ningún trabajador con ese RUT en la app
                      {n.error ? ` (${n.error})` : ''}.
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {resultado.sinDatos?.length > 0 && (
            <>
              <p className="text-xs font-bold text-amber-600 tracking-wide">
                SIN DATOS DE MARCAJE EN EL PERÍODO ({resultado.sinDatos.length})
              </p>
              <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100">
                {resultado.sinDatos.map((n) => (
                  <div key={(n.rut || '') + n.hoja} className="px-4 py-3">
                    <p className="text-sm font-bold text-amber-700">{n.rut || n.hoja}</p>
                    <p className="text-xs text-slate-500">{n.motivo}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">PERÍODOS CARGADOS</p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {periodos.length === 0 && (
          <p className="text-sm text-slate-400 p-4">Aún no se ha subido ningún reporte de asistencia.</p>
        )}
        {periodos.map((p) => (
          <div key={p.periodo_desde + p.periodo_hasta} className="px-4 py-3">
            <p className="text-sm font-bold text-[#153A5B]">
              {p.periodo_desde} → {p.periodo_hasta}
            </p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
