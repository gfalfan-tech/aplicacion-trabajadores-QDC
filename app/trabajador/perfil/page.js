'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import CambiarClave from '@/components/CambiarClave';
import { trabajadorLinks } from '@/lib/navLinks';
import Avatar from '@/components/Avatar';
import { subirFotoPerfil } from '@/lib/subirFotoPerfil';
import { obtenerAsistenciaMesActual, formatearMinutosAtraso } from '@/lib/asistencia';
import {
  pushDisponible,
  permisoActual,
  suscripcionActiva,
  activarNotificacionesPush,
  desactivarNotificacionesPush,
} from '@/lib/pushNotificaciones';

export default function Perfil() {
  const { perfil, recargarPerfil } = useAuth();
  const [subiendo, setSubiendo] = useState(null); // 'avatar' | 'banner' | null
  const [mensaje, setMensaje] = useState('');
  const [asistencia, setAsistencia] = useState(null);
  const [pushActivo, setPushActivo] = useState(false);
  const [pushCargando, setPushCargando] = useState(false);
  const [pushError, setPushError] = useState('');
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  useEffect(() => {
    if (!perfil || perfil.registra_asistencia !== 'SI') return;
    obtenerAsistenciaMesActual(perfil.id).then(setAsistencia);
  }, [perfil?.id, perfil?.registra_asistencia]);

  useEffect(() => {
    if (!pushDisponible()) return;
    suscripcionActiva().then(setPushActivo);
  }, []);

  async function alternarPush() {
    setPushCargando(true);
    setPushError('');
    try {
      if (pushActivo) {
        await desactivarNotificacionesPush();
        setPushActivo(false);
      } else {
        await activarNotificacionesPush();
        setPushActivo(true);
      }
    } catch (err) {
      setPushError(err.message);
    } finally {
      setPushCargando(false);
    }
  }

  if (!perfil) return null;

  const campos = [
    ['Nombre completo', perfil.nombre_completo],
    ['RUT', perfil.rut],
    ['Correo', perfil.email],
    ['Cargo', perfil.cargo || '—'],
    ['Fecha de ingreso', perfil.fecha_ingreso],
    ['Teléfono', perfil.telefono || '—'],
  ];

  async function subir(tipo, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(tipo);
    setMensaje('');
    try {
      await subirFotoPerfil(perfil.id, tipo, file);
      await recargarPerfil();
    } catch (err) {
      setMensaje('Error al subir la imagen: ' + err.message);
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <AppShell links={trabajadorLinks} titulo="Mi perfil">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
        {/* Banner (foto de portada) */}
        <div className="relative h-40 sm:h-52 bg-gradient-to-br from-[#0F5C8C] to-[#153A5B]">
          {perfil.banner_url && (
            <img src={perfil.banner_url} alt="Portada" className="w-full h-full object-cover" />
          )}
          <button
            onClick={() => bannerInputRef.current?.click()}
            disabled={subiendo === 'banner'}
            className="absolute bottom-3 right-3 text-xs font-bold text-[#153A5B] bg-white/90 hover:bg-white rounded-lg px-3 py-2 shadow disabled:opacity-60"
          >
            {subiendo === 'banner' ? 'Subiendo…' : '📷 Cambiar portada'}
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => subir('banner', e)}
          />
        </div>

        {/* Avatar superpuesto sobre el banner, estilo Facebook */}
        <div className="px-4 sm:px-6">
          <div className="relative -mt-12 sm:-mt-14 inline-block">
            <div className="rounded-full ring-4 ring-white bg-white">
              <Avatar url={perfil.avatar_url} nombre={perfil.nombre_completo} size={96} />
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={subiendo === 'avatar'}
              title="Cambiar foto de perfil"
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#0F5C8C] text-white text-sm flex items-center justify-center shadow disabled:opacity-60"
            >
              📷
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => subir('avatar', e)}
            />
          </div>

          <div className="py-3">
            <p className="text-lg font-bold text-[#153A5B]">{perfil.nombre_completo}</p>
            <p className="text-sm text-slate-500">{perfil.cargo || 'Sin cargo'}</p>
          </div>
        </div>
      </div>

      {mensaje && <p className="text-xs text-red-600 mb-3">{mensaje}</p>}

      {perfil.registra_asistencia === 'SI' && asistencia && (
        <>
          <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">
            ASISTENCIA {asistencia.esMesActual ? 'DE ESTE MES' : ''}
          </p>
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 grid grid-cols-2 gap-3 text-center">
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
          <p className="text-xs text-slate-400 mb-4">
            Período {asistencia.periodo_desde} → {asistencia.periodo_hasta}
            {!asistencia.esMesActual && ' (último reporte cargado por RR.HH.)'}
          </p>
        </>
      )}

      {pushDisponible() && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#153A5B]">🔔 Notificaciones en este dispositivo</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {pushActivo
                ? 'Recibirás avisos aunque tengas la app cerrada.'
                : 'Actívalas para recibir avisos aunque tengas la app cerrada.'}
            </p>
            {permisoActual() === 'denied' && (
              <p className="text-xs text-red-600 mt-1">
                Bloqueaste las notificaciones en tu navegador. Debes habilitarlas manualmente en su
                configuración de sitio para poder activarlas aquí.
              </p>
            )}
            {pushError && <p className="text-xs text-red-600 mt-1">{pushError}</p>}
          </div>
          <button
            onClick={alternarPush}
            disabled={pushCargando}
            className={`shrink-0 text-xs font-bold rounded-lg px-3 py-2 disabled:opacity-60 ${
              pushActivo
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-[#0F5C8C] text-white hover:bg-[#153A5B]'
            }`}
          >
            {pushCargando ? '...' : pushActivo ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {campos.map(([label, valor]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm font-bold text-[#153A5B]">{valor}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4 mb-4">
        Tu foto de perfil y tu portada las puedes cambiar tú mismo. Para actualizar el resto de tus
        datos, contacta a RR.HH.
      </p>

      <CambiarClave email={perfil.email} />
    </AppShell>
  );
}
