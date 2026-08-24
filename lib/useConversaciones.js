'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useConversaciones(trabajadorId) {
  const [conversaciones, setConversaciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!trabajadorId) return;
    const { data } = await supabase
      .from('v_mis_conversaciones')
      .select('*')
      .order('ultimo_en', { ascending: false, nullsFirst: false });
    setConversaciones(data || []);
    setCargando(false);
  }, [trabajadorId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Tiempo real: cualquier mensaje nuevo o cambio en participantes
  // (p. ej. que me agreguen a un grupo) refresca el resumen. Si el
  // proyecto de Supabase aún no tiene Realtime habilitado para estas
  // tablas, el respaldo de abajo (cada 20s) igual mantiene todo al día.
  useEffect(() => {
    if (!trabajadorId) return;
    const canal = supabase
      .channel(`resumen-conversaciones-${trabajadorId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, () => cargar())
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversaciones_participantes' },
        () => cargar()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'conversaciones_participantes' },
        () => cargar()
      )
      .subscribe();

    const intervalo = setInterval(cargar, 20000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(intervalo);
    };
  }, [trabajadorId, cargar]);

  const totalNoLeidos = conversaciones.reduce((acc, c) => acc + (c.no_leidos || 0), 0);

  return { conversaciones, totalNoLeidos, cargando, recargar: cargar };
}
