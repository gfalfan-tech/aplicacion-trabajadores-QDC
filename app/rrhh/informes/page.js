'use client';

import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import { generarInformeRRHH } from '@/lib/informeRRHH';
import { generarPdfInforme } from '@/lib/informePdf';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function inicioDeMesISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatearMinutos(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function InformesRRHH() {
  const [desde, setDesde] = useState(inicioDeMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [informe, setInforme] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  async function emitir() {
    if (!desde || !hasta || hasta < desde) {
      setError('Elige un rango de fechas válido.');
      return;
    }
    setCargando(true);
    setError('');
    setInforme(null);
    try {
      const datos = await generarInformeRRHH(desde, hasta);
      setInforme(datos);
    } catch (err) {
      setError('No se pudo generar el informe: ' + err.message);
    } finally {
      setCargando(false);
    }
  }

  async function descargarPdf() {
    if (!informe) return;
    setGenerandoPdf(true);
    try {
      await generarPdfInforme(informe);
    } catch (err) {
      setError('No se pudo generar el PDF: ' + err.message);
    } finally {
      setGenerandoPdf(false);
    }
  }

  return (
    <AppShell links={rrhhLinks} titulo="Informes" requiereRRHH>
      <Link href="/rrhh" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver al Dashboard
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-sm font-bold text-[#153A5B]">Emitir informe</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={emitir}
          disabled={cargando}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm disabled:opacity-60"
        >
          {cargando ? 'Generando…' : '🧾 Emitir informe'}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {informe && (
        <div className="space-y-6">
          <button
            onClick={descargarPdf}
            disabled={generandoPdf}
            className="text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2 disabled:opacity-60"
          >
            {generandoPdf ? 'Generando PDF…' : '⬇️ Descargar PDF'}
          </button>

          <div>
            <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
              PERMISOS, ATRASOS, VACACIONES Y CERTIFICADOS POR TRABAJADOR
            </p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="px-3 py-2">Trabajador</th>
                    <th className="px-3 py-2">Permisos</th>
                    <th className="px-3 py-2">Atraso</th>
                    <th className="px-3 py-2">Inasist.</th>
                    <th className="px-3 py-2">Vacaciones</th>
                    <th className="px-3 py-2">Certificados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {informe.filasTrabajadores.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-slate-400">
                        Sin movimiento en este período.
                      </td>
                    </tr>
                  )}
                  {informe.filasTrabajadores.map((f) => (
                    <tr key={f.trabajador.id}>
                      <td className="px-3 py-2 font-bold text-[#153A5B]">{f.trabajador.nombre_completo}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {f.permisosCantidad || 0} sol.
                        {f.permisosMinutos > 0 && <> · {formatearMinutos(f.permisosMinutos)}</>}
                        {f.permisosDiasCompletos > 0 && <> · {f.permisosDiasCompletos} día(s) completo(s)</>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{formatearMinutos(f.atrasoMinutos)}</td>
                      <td className="px-3 py-2 text-slate-600">{f.inasistenciaDias || 0}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {f.vacacionesCantidad || 0} sol. · {f.vacacionesDiasHabiles || 0} días háb.
                      </td>
                      <td className="px-3 py-2 text-slate-600">{f.certificadosCantidad || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Los atrasos/inasistencias corresponden a los períodos mensuales de asistencia subidos que
              se traslapan con el rango elegido (se guardan por mes completo, no día por día).
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
              PUBLICACIONES DEL MURAL EN EL PERÍODO
            </p>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {informe.filasMural.length === 0 && (
                <p className="text-sm text-slate-400 p-4">No hubo publicaciones en este período.</p>
              )}
              {informe.filasMural.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#153A5B]">{p.titulo}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(p.publicado_en).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 text-right shrink-0">
                    {p.reacciones} reacciones · {p.comentarios} comentarios
                  </p>
                </div>
              ))}
            </div>
          </div>

          {informe.ingresos.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
                INGRESOS DE PERSONAL EN EL PERÍODO
              </p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {informe.ingresos.map((t) => (
                  <div key={t.id} className="px-4 py-3">
                    <p className="text-sm font-bold text-[#153A5B]">{t.nombre_completo}</p>
                    <p className="text-xs text-slate-500">
                      {t.cargo || 'Sin cargo'} · ingresó el {t.fecha_ingreso}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {informe.cumpleanosAniversarios.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
                CUMPLEAÑOS Y ANIVERSARIOS LABORALES DEL PERÍODO
              </p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {informe.cumpleanosAniversarios.map((e, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between">
                    <p className="text-sm font-bold text-[#153A5B]">{e.trabajador.nombre_completo}</p>
                    <p className="text-xs text-slate-500 capitalize">
                      {e.tipo} · {e.mesDia}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {informe.inactivosActuales.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
                TRABAJADORES ACTUALMENTE INACTIVOS
              </p>
              <p className="text-[10px] text-slate-400 mb-2">
                No se guarda la fecha exacta en que quedaron inactivos, así que esta lista no está
                acotada al período elegido.
              </p>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {informe.inactivosActuales.map((t) => (
                  <div key={t.id} className="px-4 py-3">
                    <p className="text-sm font-bold text-[#153A5B]">{t.nombre_completo}</p>
                    <p className="text-xs text-slate-500">{t.cargo || 'Sin cargo'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
