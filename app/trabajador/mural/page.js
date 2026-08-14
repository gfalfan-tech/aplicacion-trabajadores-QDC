'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';

const iconos = { circular: '📢', imagen: '🖼️', curso: '🎓', comunicado: '📰' };

export default function MuralTrabajador() {
  const [lista, setLista] = useState([]);

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
              <div>
                <p className="text-sm font-bold text-[#153A5B]">{p.titulo}</p>
                <p className="text-xs text-slate-500 mt-1">{p.contenido}</p>
                <p className="text-[10px] text-slate-400 mt-2">
                  {new Date(p.publicado_en).toLocaleDateString('es-CL', {
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              </div>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p className="text-sm text-slate-400">Aún no hay publicaciones.</p>}
      </div>
    </AppShell>
  );
}
