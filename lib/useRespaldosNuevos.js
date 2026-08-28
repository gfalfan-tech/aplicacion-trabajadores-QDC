'use client';

import { useEffect, useState } from 'react';
import { obtenerContadorRespaldos } from '@/lib/respaldos';

// Numerito sobre el ícono "Respaldos" del menú — solo para administrador
// (para cualquier otro rol ni se llama a la ruta de servidor).
export function useRespaldosNuevos(esAdministrador) {
  const [nuevos, setNuevos] = useState(0);

  useEffect(() => {
    if (!esAdministrador) {
      setNuevos(0);
      return;
    }
    obtenerContadorRespaldos()
      .then(setNuevos)
      .catch(() => {});
  }, [esAdministrador]);

  return nuevos;
}
