'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import MuralPost from '@/components/MuralPost';
import { trabajadorLinks } from '@/lib/navLinks';

function MuralTrabajadorContenido() {
  const { perfil } = useAuth();
  const searchParams = useSearchParams();
  const resaltadoId = searchParams.get('post');
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

  useEffect(() => {
    if (!resaltadoId || lista.length === 0) return;
    const el = document.getElementById(`post-${resaltadoId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [resaltadoId, lista]);

  if (!perfil) return null;

  return (
    <AppShell links={trabajadorLinks} titulo="Diario mural">
      <div className="space-y-3">
        {lista.map((p) => (
          <MuralPost
            key={p.id}
            post={p}
            perfil={perfil}
            esRRHH={false}
            expirada={false}
            resaltada={String(p.id) === resaltadoId}
          />
        ))}
        {lista.length === 0 && <p className="text-sm text-slate-400">Aún no hay publicaciones.</p>}
      </div>
    </AppShell>
  );
}

export default function MuralTrabajador() {
  return (
    <Suspense fallback={null}>
      <MuralTrabajadorContenido />
    </Suspense>
  );
}
