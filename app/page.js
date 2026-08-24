'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

export default function Home() {
  const { session, perfil, cargando, esRRHH } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (cargando) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    // Igual que en AppShell: hay que esperar a que el perfil (y con él, los
    // roles) terminen de cargar antes de decidir a dónde mandar a alguien.
    // Si no, esRRHH todavía vale "false" por defecto y a un RRHH lo manda
    // siempre a /trabajador antes de saber que en realidad es RRHH.
    if (!perfil) return;
    if (!perfil.clave_definida) {
      router.replace('/crear-clave');
      return;
    }
    router.replace(esRRHH ? '/rrhh' : '/trabajador');
  }, [cargando, session, perfil, esRRHH, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
      Cargando…
    </div>
  );
}
