'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = aún cargando
  const [perfil, setPerfil] = useState(null);
  const [roles, setRoles] = useState([]);
  const userIdCargadoRef = useRef(null);

  async function cargarPerfil(userId) {
    userIdCargadoRef.current = userId;
    const { data: trabajador } = await supabase
      .from('trabajadores')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const { data: rolesData } = await supabase
      .from('trabajador_roles')
      .select('rol')
      .eq('trabajador_id', userId);

    setPerfil(trabajador || null);
    setRoles((rolesData || []).map((r) => r.rol));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) cargarPerfil(data.session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        // Evita recargar el perfil (y disparar de nuevo todas las consultas
        // que dependen de él) cuando Supabase solo renueva el token en segundo
        // plano para el mismo usuario ya cargado.
        if (userIdCargadoRef.current !== s.user.id) {
          cargarPerfil(s.user.id);
        }
      } else {
        userIdCargadoRef.current = null;
        setPerfil(null);
        setRoles([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const esRRHH = roles.includes('rrhh') || roles.includes('administrador');
  const esJefatura = roles.includes('jefatura');

  return (
    <AuthContext.Provider
      value={{ session, perfil, roles, esRRHH, esJefatura, cargando: session === undefined }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
