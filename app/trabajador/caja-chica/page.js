'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import { useAuth } from '@/lib/useAuth';
import CajaChicaVista from '@/components/CajaChicaVista';

export default function CajaChicaTrabajador() {
  const { esJefatura, esRRHH } = useAuth();

  return (
    <AppShell links={trabajadorLinks} titulo="Caja Chica">
      <Link href="/trabajador" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver al Inicio
      </Link>
      {!esJefatura && !esRRHH ? (
        <p className="text-sm text-slate-400">Esta sección es solo para jefatura, RR.HH. y administrador.</p>
      ) : (
        <CajaChicaVista />
      )}
    </AppShell>
  );
}
