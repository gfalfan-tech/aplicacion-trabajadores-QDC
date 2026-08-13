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
    if (perfil && !perfil.clave_definida) {
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
