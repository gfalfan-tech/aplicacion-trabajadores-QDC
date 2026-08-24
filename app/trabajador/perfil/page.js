'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import Avatar from '@/components/Avatar';
import { subirFotoPerfil } from '@/lib/subirFotoPerfil';

export default function Perfil() {
  const { perfil, recargarPerfil } = useAuth();
  const [subiendo, setSubiendo] = useState(null); // 'avatar' | 'banner' | null
  const [mensaje, setMensaje] = useState('');
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

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

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {campos.map(([label, valor]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm font-bold text-[#153A5B]">{valor}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4">
        Tu foto de perfil y tu portada las puedes cambiar tú mismo. Para actualizar el resto de tus
        datos, contacta a RR.HH.
      </p>
    </AppShell>
  );
}
