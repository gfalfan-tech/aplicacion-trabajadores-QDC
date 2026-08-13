'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import { generarCertificadoAntiguedadPdf } from '@/lib/certificadoAntiguedadPdf';
import { useAuth } from '@/lib/useAuth';

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

export default function CertificadosRRHH() {
  const { perfil } = useAuth();
  const [lista, setLista] = useState([]);
  const [procesandoId, setProcesandoId] = useState(null);
  const [mensaje, setMensaje] = useState('');

  async function cargar() {
    const { data } = await supabase
      .from('certificados_antiguedad')
      .select('*, trabajadores(nombre_completo, rut, cargo, fecha_ingreso, tipo_contrato)')
      .order('created_at', { ascending: false });
    setLista(data || []);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function enviarAFirma(solicitud) {
    setProcesandoId(solicitud.id);
    setMensaje('');

    try {
      generarCertificadoAntiguedadPdf(solicitud.trabajadores);
    } catch (e) {
      setMensaje('Error generando el PDF: ' + e.message);
      setProcesandoId(null);
      return;
    }

    const { error } = await supabase
      .from('certificados_antiguedad')
      .update({ estado: 'en_firma' })
      .eq('id', solicitud.id);

    setProcesandoId(null);
    if (error) {
      setMensaje('Error: ' + error.message);
    } else {
      cargar();
    }
  }

  async function marcarEntregado(solicitud) {
    setProcesandoId(solicitud.id);
    const { error } = await supabase
      .from('certificados_antiguedad')
      .update({ estado: 'emitido', issued_by: perfil.id })
      .eq('id', solicitud.id);
    setProcesandoId(null);
    if (error) {
      setMensaje('Error: ' + error.message);
    } else {
      cargar();
    }
  }

  return (
    <AppShell links={rrhhLinks} titulo="Certificados de Antigüedad" requiereRRHH>
      {mensaje && <p className="text-xs text-red-600 mb-3">{mensaje}</p>}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {lista.length === 0 && (
          <p className="text-sm text-slate-400 p-4">No hay solicitudes de certificado.</p>
        )}
        {lista.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#153A5B]">{s.trabajadores?.nombre_completo}</p>
                <p className="text-xs text-slate-500">
                  {s.trabajadores?.rut} · {s.trabajadores?.cargo || 'Sin cargo'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Solicitado el {new Date(s.requested_at).toLocaleDateString('es-CL')}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${estadoStyle[s.estado]}`}>
                {estadoLabel[s.estado]}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              {s.estado === 'solicitado' && (
                <button
                  onClick={() => enviarAFirma(s)}
                  disabled={procesandoId === s.id}
                  className="text-xs font-bold text-white bg-[#0F5C8C] rounded-lg px-3 py-2 disabled:opacity-50"
                >
                  {procesandoId === s.id ? 'Generando…' : 'Generar PDF y enviar a firma'}
                </button>
              )}
              {s.estado === 'en_firma' && (
                <>
                  <button
                    onClick={() => enviarAFirma(s)}
                    disabled={procesandoId === s.id}
                    className="text-xs font-bold text-[#0F5C8C] border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-50"
                  >
                    Volver a descargar PDF
                  </button>
                  <button
                    onClick={() => marcarEntregado(s)}
                    disabled={procesandoId === s.id}
                    className="text-xs font-bold text-white bg-green-700 rounded-lg px-3 py-2 disabled:opacity-50"
                  >
                    {procesandoId === s.id ? 'Guardando…' : 'Marcar como entregado'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
