'use client';

import AppShell from '@/components/AppShell';
import PapeletasVista from '@/components/PapeletasVista';
import { rrhhLinks } from '@/lib/navLinks';

export default function PapeletasRRHH() {
  return (
    <AppShell links={rrhhLinks} titulo="Papeletas por formalizar" requiereRRHH>
      <PapeletasVista />
    </AppShell>
  );
}
