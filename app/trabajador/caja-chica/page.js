'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import { useAuth } from '@/lib/useAuth';
import CajaChicaVista from '@/components/CajaChicaVista';

export default function CajaChicaTrabajador() {
  const { accesoCajaChica } = useAuth();

  return (
    <AppShell links={trabajadorLinks} titulo="Caja Chica">
      <Link href="/trabajador" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver al Inicio
      </Link>
      {!accesoCajaChica ? (
        <p className="text-sm text-slate-400">No tienes acceso a Caja Chica. Pídele a RR.HH. que te lo asigne.</p>
      ) : (
        <CajaChicaVista />
      )}
    </AppShell>
  );
}
