'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useNotificaciones(trabajadorId) {
  const [notificaciones, setNotificaciones] = useState([]);

  const cargar = useCallback(async () => {
    if (!trabajadorId) return;
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('trabajador_id', trabajadorId)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotificaciones(data || []);
  }, [trabajadorId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function marcarLeida(id) {
    setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
    await supabase.from('notificaciones').update({ leida: true }).eq('id', id);
  }

  async function marcarTodasLeidas() {
    const noLeidas = notificaciones.filter((n) => !n.leida);
    if (!noLeidas.length) return;
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .in('id', noLeidas.map((n) => n.id));
  }

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return { notificaciones, noLeidas, marcarLeida, marcarTodasLeidas, recargar: cargar };
}
