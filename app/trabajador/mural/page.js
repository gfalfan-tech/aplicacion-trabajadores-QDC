'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import MuralInteracciones from '@/components/MuralInteracciones';

const iconos = { circular: '📢', imagen: '🖼️', curso: '🎓', comunicado: '📰' };

export default function MuralTrabajador() {
  const { perfil } = useAuth();
  const [lista, setLista] = useState([]);
  const [ampliadas, setAmpliadas] = useState({});

  function toggleAmpliada(id) {
    setAmpliadas((a) => ({ ...a, [id]: !a[id] }));
  }

  useEffect(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    supabase
      .from('publicaciones_mural')
      .select('*')
      .or(`fecha_expiracion.is.null,fecha_expiracion.gte.${hoy}`)
      .order('publicado_en', { ascending: false })
      .then(({ data }) => setLista(data || []));
  }, []);

  return (
    <AppShell links={trabajadorLinks} titulo="Diario mural">
      <div className="space-y-3">
        {lista.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E6F1FB] flex items-center justify-center text-lg">
                {iconos[p.tipo] || '📰'}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#153A5B]">{p.titulo}</p>
                <p className="text-xs text-slate-500 mt-1">{p.contenido}</p>
                {p.imagen_url && (
                  <img
                    src={p.imagen_url}
                    alt={p.titulo}
                    onClick={() => toggleAmpliada(p.id)}
                    className={`mt-2 rounded-lg border border-slate-200 w-full object-contain bg-slate-50 cursor-zoom-in transition-all ${
                      ampliadas[p.id] ? 'max-h-[80vh] cursor-zoom-out' : 'max-h-96'
                    }`}
                  />
                )}
                <p className="text-[10px] text-slate-400 mt-2">
                  {new Date(p.publicado_en).toLocaleDateString('es-CL', {
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
                {perfil && (
                  <MuralInteracciones publicacionId={p.id} trabajadorId={perfil.id} />
                )}
              </div>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p className="text-sm text-slate-400">Aún no hay publicaciones.</p>}
      </div>
    </AppShell>
  );
}