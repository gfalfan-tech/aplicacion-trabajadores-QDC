'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell, { CLAVE_ULTIMA_VISTA } from '@/components/AppShell';
import { trabajadorLinks, rrhhLinks } from '@/lib/navLinks';
import Avatar from '@/components/Avatar';

// Directorio de la empresa: cualquier colaborador puede buscar y ver el
// perfil básico (foto, nombre, cargo, área, jefe directo) de cualquier
// otro. No muestra RUT, fecha de nacimiento, teléfono personal ni tipo
// de contrato — eso sigue siendo solo para RR.HH. en /rrhh/trabajadores.
export default function DirectorioPage() {
  const { perfil, esRRHH } = useAuth();
  const [vistaGuardada, setVistaGuardada] = useState(null);
  useEffect(() => {
    setVistaGuardada(window.localStorage.getItem(CLAVE_ULTIMA_VISTA));
  }, []);
  const links = esRRHH && vistaGuardada !== 'trabajador' ? rrhhLinks : trabajadorLinks;

  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('v_directorio_trabajadores')
        .select('id, nombre_completo, cargo, avatar_url, area_nombre, jefe_nombre')
        .order('nombre_completo');
      setLista(data || []);
      setCargando(false);
    }
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((t) =>
      [t.nombre_completo, t.cargo, t.area_nombre]
        .filter(Boolean)
        .some((campo) => campo.toLowerCase().includes(q))
    );
  }, [lista, busqueda]);

  return (
    <AppShell links={links} titulo="Directorio">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-slate-500 mb-4">
          Busca a cualquier colaborador de la empresa para ver su perfil básico.
        </p>

        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, cargo o área…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4"
        />

        {cargando ? (
          <p className="text-sm text-slate-400 py-6 text-center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">Sin resultados.</p>
        ) : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
            {filtrados.map((t) => (
              <button
                key={t.id}
                onClick={() => setSeleccionado(t)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <Avatar url={t.avatar_url} nombre={t.nombre_completo} size={40} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#153A5B] truncate">{t.nombre_completo}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {t.cargo || 'Sin cargo'}
                    {t.area_nombre ? ` · ${t.area_nombre}` : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {seleccionado && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setSeleccionado(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <Avatar url={seleccionado.avatar_url} nombre={seleccionado.nombre_completo} size={80} />
              <p className="text-base font-bold text-[#153A5B] mt-3">{seleccionado.nombre_completo}</p>
              <p className="text-sm text-slate-500">{seleccionado.cargo || 'Sin cargo'}</p>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-400">Área</span>
                <span className="font-bold text-[#153A5B]">{seleccionado.area_nombre || '—'}</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-slate-400">Jefe directo</span>
                <span className="font-bold text-[#153A5B]">{seleccionado.jefe_nombre || '—'}</span>
              </div>
            </div>

            <button
              onClick={() => setSeleccionado(null)}
              className="w-full mt-5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-lg py-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
