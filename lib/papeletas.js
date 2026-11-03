// Llamadas desde el cliente para la pantalla "Papeletas por formalizar".
// Todo pasa por rutas de servidor (/api/papeletas/*), que validan que quien
// llama sea RR.HH./administrador o tenga el rol 'formalizar_papeletas'.

import { supabase } from '@/lib/supabaseClient';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

async function llamar(url, opciones = {}) {
  const resp = await fetch(url, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await token()}`,
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || 'No se pudo completar la operación.');
  return json;
}

export function obtenerPapeletas() {
  return llamar('/api/papeletas/lista');
}

export function formalizarPapeleta(tipo, id, formalizada) {
  return llamar('/api/papeletas/formalizar', {
    method: 'POST',
    body: JSON.stringify({ tipo, id, formalizada }),
  });
}

export function notificarPapeleta(tipo, id) {
  return llamar('/api/papeletas/notificar', { method: 'POST', body: JSON.stringify({ tipo, id }) });
}

export async function obtenerContadorPapeletas() {
  const t = await token();
  if (!t) return 0;
  const resp = await fetch('/api/papeletas/contador', { headers: { Authorization: `Bearer ${t}` } });
  if (!resp.ok) return 0;
  const json = await resp.json().catch(() => ({}));
  return json.pendientes || 0;
}
