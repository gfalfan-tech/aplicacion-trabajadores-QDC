'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';

export default function DocumentosTrabajador() {
  const { perfil } = useAuth();
  const [lista, setLista] = useState([]);

  useEffect(() => {
    supabase
      .from('documentos')
      .select('*, documentos_versiones(id, version, storage_path, vigente)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setLista(data || []));
  }, []);

  async function abrir(path) {
    const { data } = await supabase.storage.from('documentos').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function marcarLeido(versionId) {
    if (!perfil) return;
    await supabase.from('documentos_lecturas').upsert(
      {
        documento_version_id: versionId,
        trabajador_id: perfil.id,
        leido_en: new Date().toISOString(),
        aceptado: true,
        aceptado_en: new Date().toISOString(),
      },
      { onConflict: 'documento_version_id,trabajador_id' }
    );
  }

  return (
    <AppShell links={trabajadorLinks} titulo="Reglamento y políticas">
      <div className="space-y-3">
        {lista.map((d) => {
          const versiones = d.documentos_versiones || [];
          const vigente = versiones.find((v) => v.vigente) || versiones[0];
          return (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-[#153A5B]">{d.titulo}</p>
              <p className="text-xs text-slate-500 capitalize mb-3">{d.categoria}</p>
              {vigente && (
                <div className="flex gap-2">
                  <button
                    onClick={() => abrir(vigente.storage_path)}
                    className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-2"
                  >
                    Ver documento
                  </button>
                  <button
                    onClick={() => marcarLeido(vigente.id)}
                    className="text-xs font-bold text-[#153A5B] border border-slate-200 rounded-lg px-3 py-2"
                  >
                    Marcar como leído
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {lista.length === 0 && <p className="text-sm text-slate-400">Aún no hay documentos publicados.</p>}
      </div>
    </AppShell>
  );
}
