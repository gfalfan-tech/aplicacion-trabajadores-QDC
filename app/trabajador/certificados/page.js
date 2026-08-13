'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';

const estadoLabel = {
  solicitado: 'Solicitado',
  en_firma: 'En firma',
  emitido: 'Emitido',
};

const estadoStyle = {
  solicitado: 'bg-amber-100 text-amber-800',
  en_firma: 'bg-blue-100 text-blue-800',
  emitido: 'bg-green-100 text-green-800',
};

export default function CertificadosTrabajador() {
  const { perfil } = useAuth();
  const [lista, setLista] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function cargar() {
    const { data } = await supabase
      .from('certificados_antiguedad')
      .select('*')
      .eq('trabajador_id', perfil.id)
      .order('created_at', { ascending: false });
    setLista(data || []);
  }

  useEffect(() => {
    if (perfil) cargar();
  }, [perfil]);

  const tieneSolicitudActiva = lista.some((s) => s.estado !== 'emitido');

  async function solicitar() {
    setEnviando(true);
    setMensaje('');
    const { error } = await supabase.from('certificados_antiguedad').insert({
      trabajador_id: perfil.id,
    });
    setEnviando(false);
    if (error) {
      setMensaje('Error: ' + error.message);
    } else {
      setMensaje('Solicitud enviada.');
      cargar();
    }
  }

  if (!perfil) return null;

  return (
    <AppShell links={trabajadorLinks} titulo="Certificado de Antigüedad">
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <p className="text-sm font-bold text-[#153A5B] mb-1">Certificado de Antigüedad</p>
        <p className="text-xs text-slate-500 mb-3">
          Solicita tu certificado de antigüedad. RR.HH. lo generará y enviará a firma; te
          avisaremos aquí cuando esté disponible para retiro.
        </p>
        <button
          onClick={solicitar}
          disabled={enviando || tieneSolicitudActiva}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm disabled:opacity-50"
        >
          {tieneSolicitudActiva
            ? 'Ya tienes una solicitud en curso'
            : enviando
            ? 'Enviando…'
            : 'Solicitar Certificado de Antigüedad'}
        </button>
        {mensaje && <p className="text-xs text-slate-500 mt-2">{mensaje}</p>}
      </div>

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">MIS SOLICITUDES</p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {lista.length === 0 && (
          <p className="text-sm text-slate-400 p-4">Aún no has solicitado un certificado.</p>
        )}
        {lista.map((s) => (
          <div key={s.id} className="px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Solicitado el {new Date(s.requested_at).toLocaleDateString('es-CL')}
            </p>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${estadoStyle[s.estado]}`}>
              {estadoLabel[s.estado]}
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
