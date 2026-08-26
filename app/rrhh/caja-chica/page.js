'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { rrhhLinks } from '@/lib/navLinks';
import CajaChicaVista from '@/components/CajaChicaVista';

export default function CajaChicaRRHH() {
  return (
    <AppShell links={rrhhLinks} titulo="Caja Chica" requiereRRHH>
      <Link href="/rrhh" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver al Dashboard
      </Link>
      <CajaChicaVista />
    </AppShell>
  );
}
