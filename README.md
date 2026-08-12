# Portal de Gestión de Personas — QDC

App Next.js conectada a Supabase. Estructura por módulos:

- `app/login` — inicio de sesión
- `app/trabajador/*` — vista trabajador (inicio, solicitudes, vacaciones, documentos, mural, perfil)
- `app/rrhh/*` — panel RR.HH. (dashboard con aprobaciones, trabajadores, documentos, mural)
- `app/api/admin/create-trabajador` — ruta de servidor que crea trabajadores e invita por correo
- `lib/` — cliente de Supabase, contexto de autenticación, listas de navegación (compartido)
- `components/AppShell.js` — estructura visual compartida (sidebar en escritorio, barra inferior en celular)

Cada pantalla vive en su propio archivo: para cambiar "Vacaciones" solo se edita `app/trabajador/vacaciones/page.js`, sin tocar el resto.

## Variables de entorno (configurar en Vercel → Project Settings → Environment Variables)

- `NEXT_PUBLIC_SUPABASE_URL` = `https://kcxskzmmyjlamfambnhm.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave publicable (`sb_publishable_...`)
- `SUPABASE_SERVICE_ROLE_KEY` = la clave `service_role` de tu proyecto (Supabase Dashboard → Project Settings → API). **Nunca la subas al repositorio.** Solo se usa dentro de `app/api/admin/create-trabajador`, en el servidor.

Las dos primeras ya tienen un valor por defecto en el código como respaldo, pero es buena práctica configurarlas igual.

## Desarrollo local

```bash
npm install
npm run dev
```

## Primer usuario (administrador)

Antes de poder iniciar sesión necesitas un primer usuario. Ver `qdc_crear_primer_admin.sql` (te lo entrego aparte) para el paso a paso.
