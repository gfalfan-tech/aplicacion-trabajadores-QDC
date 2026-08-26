'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { obtenerResumenPendientes } from '@/lib/pendientes';

// Banner de alerta visual con las solicitudes pendientes de aprobar
// (certificados, vacaciones, permisos, caja chica). Se usa tanto en el
// dashboard de RR.HH. (ve todo) como en el inicio de una jefatura (ve solo
// su equipo). `enlaces` define a qué pantalla manda cada chip.
export default function AlertaPendientes({ enlaces }) {
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    let activo = true;
    obtenerResumenPendientes().then((r) => {
      if (activo) setResumen(r);
    });
    return () => {
      activo = false;
    };
  }, []);

  if (!resumen) return null;

  const items = [
    { key: 'certificados', label: 'certificado', labelPlural: 'certificados', href: enlaces.certificados },
    { key: 'vacaciones', label: 'vacaciones', labelPlural: 'vacaciones', href: enlaces.vacaciones },
    { key: 'permisos', label: 'permiso', labelPlural: 'permisos', href: enlaces.permisos },
    { key: 'cajaChica', label: 'compra de caja chica', labelPlural: 'compras de caja chica', href: enlaces.cajaChica },
  ].filter((it) => resumen[it.key] > 0 && it.href);

  const total = items.reduce((acc, it) => acc + resumen[it.key], 0);

  if (total === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <p className="text-sm font-bold text-amber-800 mb-2">
        ⚠️ Tienes {total} {total === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} de tu aprobación
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            className="text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg px-3 py-1.5"
          >
            {resumen[it.key]} {resumen[it.key] === 1 ? it.label : it.labelPlural}
          </Link>
        ))}
      </div>
    </div>
  );
}
