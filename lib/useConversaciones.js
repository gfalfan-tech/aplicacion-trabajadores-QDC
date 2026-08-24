'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

let contadorInstancias = 0;

export function useConversaciones(trabajadorId) {
  const [conversaciones, setConversaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Este hook se usa a la vez en AppShell (para el numerito del menú) y en
  // la propia pantalla de Mensajes. Cada instancia necesita su PROPIO canal
  // de tiempo real — si dos instancias usan el mismo nombre de canal,
  // Supabase Realtime falla con "cannot add callbacks after subscribe()".
  const instanciaIdRef = useRef(null);
  if (instanciaIdRef.current === null) {
    contadorInstancias += 1;
    instanciaIdRef.current = contadorInstancias;
  }

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
      .channel(`resumen-conversaciones-${trabajadorId}-${instanciaIdRef.current}`)
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
