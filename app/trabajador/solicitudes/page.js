'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import { generarPdfPermiso } from '@/lib/solicitudPdf';

const estadoStyle = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
  cancelada: 'bg-slate-100 text-slate-600',
};

function formatFecha(fechaISO) {
  // Evita el corrimiento de un día por zona horaria al parsear "YYYY-MM-DD".
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatHora(horaHHMMSS) {
  return horaHHMMSS ? horaHHMMSS.slice(0, 5) : '';
}

function fraseSolicitud(s, perfil) {
  const dias =
    s.fecha_desde === s.fecha_hasta
      ? `el día ${formatFecha(s.fecha_desde)}`
      : `desde el ${formatFecha(s.fecha_desde)} hasta el ${formatFecha(s.fecha_hasta)}`;

  const horas =
    s.hora_desde && s.hora_hasta
      ? ` entre las ${formatHora(s.hora_desde)} y las ${formatHora(s.hora_hasta)} horas`
      : '';

  const motivo = (s.motivo && s.motivo.trim()) || s.tipos_permiso?.nombre || 'motivo no especificado';

  return `Yo, ${perfil.nombre_completo}, RUT ${perfil.rut}, solicito permiso ${dias}${horas} por "${motivo}".`;
}

export default function Solicitudes() {
  const { perfil } = useAuth();
  const [tipos, setTipos] = useState([]);
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({
    tipo_permiso_id: '',
    fecha_desde: '',
    fecha_hasta: '',
    hora_desde: '',
    hora_hasta: '',
    motivo: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function cargar() {
    const { data: t } = await supabase.from('tipos_permiso').select('*').order('nombre');
    setTipos(t || []);
    const { data: s } = await supabase
      .from('solicitudes_permiso')
      .select('*, tipos_permiso(nombre)')
      .eq('trabajador_id', perfil.id)
      .order('created_at', { ascending: false });
    setLista(s || []);
  }

  useEffect(() => {
    if (perfil) cargar();
  }, [perfil?.id]);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje('');
    const { data, error } = await supabase
      .from('solicitudes_permiso')
      .insert({
        trabajador_id: perfil.id,
        tipo_permiso_id: Number(form.tipo_permiso_id),
        fecha_desde: form.fecha_desde,
        fecha_hasta: form.fecha_hasta,
        hora_desde: form.hora_desde,
        hora_hasta: form.hora_hasta,
        motivo: form.motivo,
      })
      .select()
      .single();
    setEnviando(false);
    if (error) {
      setMensaje('Error: ' + error.message);
    } else {
      setMensaje('Solicitud enviada. Se avisó a tu jefe directo para que la revise.');
      setForm({
        tipo_permiso_id: '',
        fecha_desde: '',
        fecha_hasta: '',
        hora_desde: '',
        hora_hasta: '',
        motivo: '',
      });
      cargar();
      if (data) {
        supabase.functions
          .invoke('notificar-revision', { body: { tipo: 'permiso', solicitud_id: data.id } })
          .catch(() => {});
      }
    }
  }

  async function verPdf(s) {
    await generarPdfPermiso(
      { ...s, tipo_permiso: s.tipos_permiso?.nombre },
      perfil
    );
  }

  if (!perfil) return null;

  return (
    <AppShell links={trabajadorLinks} titulo="Solicitudes de permiso">
      <form onSubmit={enviar} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-sm font-bold text-[#153A5B]">Nueva solicitud</p>
        <select
          required
          value={form.tipo_permiso_id}
          onChange={(e) => setForm({ ...form, tipo_permiso_id: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tipo de permiso</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Fecha desde</label>
            <input
              required
              type="date"
              value={form.fecha_desde}
              onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Fecha hasta</label>
            <input
              required
              type="date"
              value={form.fecha_hasta}
              onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Hora desde</label>
            <input
              required
              type="time"
              value={form.hora_desde}
              onChange={(e) => setForm({ ...form, hora_desde: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Hora hasta</label>
            <input
              required
              type="time"
              value={form.hora_hasta}
              onChange={(e) => setForm({ ...form, hora_hasta: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <textarea
          value={form.motivo}
          onChange={(e) => setForm({ ...form, motivo: e.target.value })}
          placeholder="Motivo (opcional)"
          rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          disabled={enviando}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
        >
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
        {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
      </form>

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">MIS SOLICITUDES</p>
      <div className="space-y-3">
        {lista.length === 0 && (
          <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-4">
            Aún no tienes solicitudes.
          </p>
        )}
        {lista.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-[#153A5B]">{s.tipos_permiso?.nombre}</p>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${estadoStyle[s.estado]}`}>
                {s.estado}
              </span>
            </div>
            <p className="text-xs text-slate-600 italic leading-relaxed border-l-2 border-slate-200 pl-3">
              {fraseSolicitud(s, perfil)}
            </p>
            {(s.estado === 'aprobada' || s.estado === 'rechazada') && (
              <button
                onClick={() => verPdf(s)}
                className="mt-3 text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2"
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
