'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PapeletasVista from '@/components/PapeletasVista';
import { trabajadorLinks } from '@/lib/navLinks';
import { useAuth } from '@/lib/useAuth';

// Vista para quien tiene el rol "formalizar papeletas" sin ser RR.HH.
export default function PapeletasTrabajador() {
  const { accesoPapeletas } = useAuth();

  return (
    <AppShell links={trabajadorLinks} titulo="Papeletas por formalizar">
      <Link href="/trabajador" className="inline-block text-xs font-bold text-[#0F5C8C] mb-4">
        ← Volver al Inicio
      </Link>
      {!accesoPapeletas ? (
        <p className="text-sm text-slate-400">No tienes acceso a las papeletas. Pídele a RR.HH. que te lo asigne.</p>
      ) : (
        <PapeletasVista />
      )}
    </AppShell>
  );
}
