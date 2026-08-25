'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import { generarPdfVacaciones } from '@/lib/solicitudPdf';
import { calcularDiasHabiles } from '@/lib/diasHabiles';

const estadoStyle = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
  cancelada: 'bg-slate-100 text-slate-600',
};

export default function Vacaciones() {
  const { perfil } = useAuth();
  const [saldo, setSaldo] = useState(null);
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ fecha_desde: '', fecha_hasta: '' });
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [previewDias, setPreviewDias] = useState(null);

  useEffect(() => {
    if (!form.fecha_desde || !form.fecha_hasta || form.fecha_hasta < form.fecha_desde) {
      setPreviewDias(null);
      return;
    }
    let vigente = true;
    calcularDiasHabiles(form.fecha_desde, form.fecha_hasta).then((n) => {
      if (vigente) setPreviewDias(n);
    });
    return () => {
      vigente = false;
    };
  }, [form.fecha_desde, form.fecha_hasta]);

  async function cargar() {
    const { data: s } = await supabase
      .from('v_vacaciones_saldo')
      .select('*')
      .eq('trabajador_id', perfil.id)
      .maybeSingle();
    setSaldo(s);
    const { data: l } = await supabase
      .from('solicitudes_vacaciones')
      .select('*')
      .eq('trabajador_id', perfil.id)
      .order('created_at', { ascending: false });
    setLista(l || []);
  }

  useEffect(() => {
    if (perfil) cargar();
  }, [perfil?.id]);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');
    const dias = await calcularDiasHabiles(form.fecha_desde, form.fecha_hasta);
    const { data, error } = await supabase
      .from('solicitudes_vacaciones')
      .insert({
        trabajador_id: perfil.id,
        fecha_desde: form.fecha_desde,
        fecha_hasta: form.fecha_hasta,
        dias_habiles: dias,
      })
      .select()
      .single();
    setEnviando(false);
    if (error) {
      setMensaje('Error: ' + error.message);
    } else {
      setMensaje(`Solicitud enviada (${dias} días hábiles). Se avisó a tu jefe directo para que la revise.`);
      setForm({ fecha_desde: '', fecha_hasta: '' });
      cargar();
      if (data) {
        supabase.functions
          .invoke('notificar-revision', { body: { tipo: 'vacaciones', solicitud_id: data.id } })
          .catch(() => {});
      }
    }
  }

  async function verPdf(s) {
    await generarPdfVacaciones(s, perfil);
  }

  if (!perfil) return null;

  return (
    <AppShell links={trabajadorLinks} titulo="Vacaciones">
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xl font-bold text-[#0F5C8C]">
            {saldo ? Math.max(0, saldo.dias_disponibles_estimados) : '—'}
          </p>
          <p className="text-[10px] text-slate-500">Disponibles</p>
        </div>
        <div>
          <p className="text-xl font-bold text-[#153A5B]">{saldo?.dias_progresivos_vigentes ?? '—'}</p>
          <p className="text-[10px] text-slate-500">Progresivos</p>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-500 mt-1">
            {saldo ? new Date(saldo.fecha_corte).toLocaleDateString('es-CL') : '—'}
          </p>
          <p className="text-[10px] text-slate-500">Corte del saldo</p>
        </div>
      </div>

      <form onSubmit={enviar} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-sm font-bold text-[#153A5B]">Solicitar vacaciones</p>
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            type="date"
            value={form.fecha_desde}
            onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="date"
            value={form.fecha_hasta}
            onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {previewDias !== null && (
          <p className="text-xs text-slate-500">
            Esto descuenta <span className="font-bold text-[#153A5B]">{previewDias} días hábiles</span> (de
            lunes a viernes, sin contar feriados).
          </p>
        )}
        <button
          disabled={enviando}
          className="w-full bg-[#153A5B] text-white font-bold rounded-lg py-2 text-sm"
        >
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
        {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
      </form>

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">MIS SOLICITUDES</p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {lista.length === 0 && <p className="text-sm text-slate-400 p-4">Aún no tienes solicitudes.</p>}
        {lista.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#153A5B]">{s.dias_habiles} días hábiles</p>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${estadoStyle[s.estado]}`}>
                {s.estado}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {s.fecha_desde} → {s.fecha_hasta}
            </p>
            {(s.estado === 'aprobada' || s.estado === 'rechazada') && (
              <button
                onClick={() => verPdf(s)}
                className="mt-2 text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2"
              >
                Ver PDF
              </button>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
