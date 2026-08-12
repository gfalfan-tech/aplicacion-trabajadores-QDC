'use client';

import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';

export default function Perfil() {
  const { perfil } = useAuth();
  if (!perfil) return null;

  const campos = [
    ['Nombre completo', perfil.nombre_completo],
    ['RUT', perfil.rut],
    ['Correo', perfil.email],
    ['Cargo', perfil.cargo || '—'],
    ['Fecha de ingreso', perfil.fecha_ingreso],
    ['Teléfono', perfil.telefono || '—'],
  ];

  return (
    <AppShell links={trabajadorLinks} titulo="Mi perfil">
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {campos.map(([label, valor]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm font-bold text-[#153A5B]">{valor}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4">Para actualizar tus datos, contacta a RR.HH.</p>
    </AppShell>
  );
}
