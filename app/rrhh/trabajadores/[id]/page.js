'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import { generarPdfPermiso, generarPdfVacaciones } from '@/lib/solicitudPdf';
import Avatar from '@/components/Avatar';
import { obtenerAsistenciaMesActual, formatearMinutosAtraso } from '@/lib/asistencia';

const estadoStyleSolicitud = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
  cancelada: 'bg-slate-100 text-slate-600',
};

const estadoLabelCertificado = {
  solicitado: 'Solicitado',
  en_firma: 'En firma',
  emitido: 'Emitido',
};

const estadoStyleCertificado = {
  solicitado: 'bg-amber-100 text-amber-800',
  en_firma: 'bg-blue-100 text-blue-800',
  emitido: 'bg-green-100 text-green-800',
};

export default function VerPerfilTrabajador() {
  const { id } = useParams();
  const [trabajador, setTrabajador] = useState(null);
  const [roles, setRoles] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [certificados, setCertificados] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [asistencia, setAsistencia] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [noEncontrado, setNoEncontrado] = useState(false);

  useEffect(() => {
    if (!id) return;
    let activo = true;

    async function cargar() {
      setCargando(true);

      const { data: t } = await supabase
        .from('trabajadores')
        .select('*, areas(nombre), jefe_directo:jefe_directo_id(nombre_completo)')
        .eq('id', id)
        .maybeSingle();

      if (!activo) return;
      if (!t) {
        setNoEncontrado(true);
        setCargando(false);
        return;
      }
      setTrabajador(t);

      const [
        { data: rolesData },
        { data: saldoData },
        { data: permisosData },
        { data: vacacionesData },
        { data: certificadosData },
        { data: documentosData },
      ] = await Promise.all([
        supabase.from('trabajador_roles').select('rol').eq('trabajador_id', id),
        supabase.from('v_vacaciones_saldo').select('*').eq('trabajador_id', id).maybeSingle(),
        supabase
          .from('solicitudes_permiso')
          .select('*, tipos_permiso(nombre)')
          .eq('trabajador_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('solicitudes_vacaciones')
          .select('*')
          .eq('trabajador_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('certificados_antiguedad')
          .select('*')
          .eq('trabajador_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('documentos')
          .select('*, documentos_versiones(id, version, storage_path, vigente)')
          .order('created_at', { ascending: false }),
      ]);

      if (!activo) return;
      setRoles((rolesData || []).map((r) => r.rol));
      setSaldo(saldoData || null);
      setPermisos(permisosData || []);
      setVacaciones(vacacionesData || []);
      setCertificados(certificadosData || []);

      let docsConLectura = documentosData || [];
      if (docsConLectura.length) {
        const versionIds = docsConLectura.flatMap((d) =>
          (d.documentos_versiones || []).map((v) => v.id)
        );
        const { data: lecturas } = await supabase
          .from('documentos_lecturas')
          .select('documento_version_id, leido_en')
          .eq('trabajador_id', id)
          .in('documento_version_id', versionIds.length ? versionIds : ['00000000-0000-0000-0000-000000000000']);
        const leidos = new Set((lecturas || []).map((l) => l.documento_version_id));
        docsConLectura = docsConLectura.map((d) => {
          const vigente = (d.documentos_versiones || []).find((v) => v.vigente) || d.documentos_versiones?.[0];
          return { ...d, vigente, leido: vigente ? leidos.has(vigente.id) : false };
        });
      }
      if (activo) setDocumentos(docsConLectura);

      if (t.registra_asistencia === 'SI') {
        const asis = await obtenerAsistenciaMesActual(id);
        if (activo) setAsistencia(asis);
      }

      setCargando(false);
    }

    cargar();
    return () => {
      activo = false;
    };
  }, [id]);

  async function verPdfPermiso(s) {
    if (!trabajador) return;
    await generarPdfPermiso({ ...s, tipo_permiso: s.tipos_permiso?.nombre }, trabajador);
  }

  async function verPdfVacaciones(s) {
    if (!trabajador) return;
    await generarPdfVacaciones(s, trabajador);
  }

  return (
    <AppShell links={rrhhLinks} titulo="Ver perfil" requiereRRHH>
      <Link
        href="/rrhh/trabajadores"
        className="inline-block text-xs font-bold text-[#0F5C8C] mb-4"
      >
        ← Volver a Trabajadores
      </Link>

      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}

      {!cargando && noEncontrado && (
        <p className="text-sm text-slate-400">No se encontró ese trabajador.</p>
      )}

      {!cargando && trabajador && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="relative h-32 sm:h-40 bg-gradient-to-br from-[#0F5C8C] to-[#153A5B]">
              {trabajador.banner_url && (
                <img
                  src={trabajador.banner_url}
                  alt="Portada"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="px-4 sm:px-6">
              <div className="-mt-10 sm:-mt-12 inline-block rounded-full ring-4 ring-white bg-white">
                <Avatar url={trabajador.avatar_url} nombre={trabajador.nombre_completo} size={80} />
              </div>
              <div className="flex items-center justify-between mb-1 pt-2">
                <p className="text-base font-bold text-[#153A5B]">{trabajador.nombre_completo}</p>
                {trabajador.estado === 'inactivo' && (
                  <span className="text-[10px] font-bold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                    inactivo
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Vista de solo lectura — esto es lo que {trabajador.nombre_completo.split(' ')[0]} ve en su
                propio perfil. No puedes editar datos desde aquí.
              </p>
            </div>
            <div className="divide-y divide-slate-100 border-t border-slate-100 px-4 sm:px-6 pb-2">
              {[
                ['RUT', trabajador.rut],
                ['Correo', trabajador.email],
                ['Cargo', trabajador.cargo || '—'],
                ['Área', trabajador.areas?.nombre || '—'],
                ['Jefe directo', trabajador.jefe_directo?.nombre_completo || '—'],
                ['Teléfono', trabajador.telefono || '—'],
                ['Fecha de ingreso', trabajador.fecha_ingreso],
                ['Fecha de nacimiento', trabajador.fecha_nacimiento || '—'],
                ['Tipo de contrato', trabajador.tipo_contrato || '—'],
                ['Roles', roles.join(', ') || '—'],
              ].map(([label, valor]) => (
                <div key={label} className="flex items-center justify-between py-2">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-sm font-bold text-[#153A5B]">{valor}</p>
                </div>
              ))}
            </div>
          </div>

          {trabajador.registra_asistencia === 'SI' && asistencia && (
            <div>
              <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
                ASISTENCIA {asistencia.esMesActual ? 'DE ESTE MES' : ''}
              </p>
              <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-xl font-bold text-[#153A5B]">{asistencia.dias_inasistencia}</p>
                  <p className="text-[10px] text-slate-500">Días de inasistencia</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-[#153A5B]">
                    {formatearMinutosAtraso(asistencia.atraso_minutos)}
                  </p>
                  <p className="text-[10px] text-slate-500">Minutos de atraso</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Período {asistencia.periodo_desde} → {asistencia.periodo_hasta}
                {!asistencia.esMesActual && ' (último reporte cargado por RR.HH.)'}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">VACACIONES</p>
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-[#0F5C8C]">
                  {saldo ? Math.max(0, saldo.dias_disponibles_estimados) : '—'}
                </p>
                <p className="text-[10px] text-slate-500">Disponibles</p>
              </div>
              <div>
                <p className="text-xl font-bold text-[#153A5B]">
                  {saldo?.dias_progresivos_vigentes ?? '—'}
                </p>
                <p className="text-[10px] text-slate-500">Progresivos</p>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500 mt-1">
                  {saldo ? new Date(saldo.fecha_corte).toLocaleDateString('es-CL') : '—'}
                </p>
                <p className="text-[10px] text-slate-500">Corte del saldo</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {vacaciones.length === 0 && (
                <p className="text-sm text-slate-400 p-4">Sin solicitudes de vacaciones.</p>
              )}
              {vacaciones.map((s) => (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-[#153A5B]">{s.dias_habiles} días hábiles</p>
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${estadoStyleSolicitud[s.estado]}`}
                    >
                      {s.estado}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {s.fecha_desde} → {s.fecha_hasta}
                  </p>
                  {(s.estado === 'aprobada' || s.estado === 'rechazada') && (
                    <button
                      onClick={() => verPdfVacaciones(s)}
                      className="mt-2 text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2"
                    >
                      Ver PDF
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">SOLICITUDES DE PERMISO</p>
            <div className="space-y-3">
              {permisos.length === 0 && (
                <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-4">
                  Sin solicitudes de permiso.
                </p>
              )}
              {permisos.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-[#153A5B]">{s.tipos_permiso?.nombre}</p>
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${estadoStyleSolicitud[s.estado]}`}
                    >
                      {s.estado}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {s.fecha_desde} → {s.fecha_hasta}
                    {s.motivo ? ` · ${s.motivo}` : ''}
                  </p>
                  {(s.estado === 'aprobada' || s.estado === 'rechazada') && (
                    <button
                      onClick={() => verPdfPermiso(s)}
                      className="mt-2 text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2"
                    >
                      Ver PDF
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
              CERTIFICADO DE ANTIGÜEDAD
            </p>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {certificados.length === 0 && (
                <p className="text-sm text-slate-400 p-4">Sin solicitudes de certificado.</p>
              )}
              {certificados.map((s) => (
                <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Solicitado el {new Date(s.requested_at).toLocaleDateString('es-CL')}
                  </p>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full ${estadoStyleCertificado[s.estado]}`}
                  >
                    {estadoLabelCertificado[s.estado]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
              REGLAMENTO Y POLÍTICAS
            </p>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {documentos.length === 0 && (
                <p className="text-sm text-slate-400 p-4">No hay documentos publicados.</p>
              )}
              {documentos.map((d) => (
                <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#153A5B]">{d.titulo}</p>
                    <p className="text-xs text-slate-500 capitalize">{d.categoria}</p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
                      d.leido ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {d.leido ? 'Leído' : 'No leído'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
