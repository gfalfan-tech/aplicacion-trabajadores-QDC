# Instrucciones para el Claude del TI: verificar el dominio de correo en Resend

> Este documento está escrito para ser pegado en Claude (con el navegador abierto y las sesiones ya iniciadas).
> Léelo completo antes de actuar. Si algo no calza con lo que ves en pantalla, **detente y pregunta** a la persona.

## 1. Contexto (lo mínimo que necesitas saber)

Química del Campo SpA (QDC) tiene una app interna, "Portal de Gestión de Personas", que envía correos automáticos
(solicitudes de vacaciones, permisos y caja chica a jefaturas) usando **Resend**.

Hoy los correos salen desde `onboarding@resend.dev`, un remitente de pruebas que **solo entrega a la cuenta dueña de Resend**.
Por eso los jefes no reciben nada. Para arreglarlo hay que **verificar un dominio propio en Resend**, lo que exige
crear algunos registros DNS.

**Decisión ya tomada:** se usará el **subdominio `correo.qdc.cl`** (no el dominio principal `qdc.cl`), para no mezclar
nada con el correo corporativo actual. El remitente final será `notificaciones@correo.qdc.cl`.

## 2. Objetivo

Dejar el dominio `correo.qdc.cl` en estado **Verified** dentro de Resend. Nada más.

## 3. Lo que debes hacer (en orden)

1. **Resend → Domains → Add Domain.**
   - Nombre: `correo.qdc.cl`
   - Región: si existe, elige **South America (São Paulo)**; si no, deja la que ofrezca por defecto.
   - Si Resend indica que el plan no permite más dominios, detente e informa.
2. **Copia los registros DNS que Resend te muestre** (normalmente 3: un MX, un TXT de SPF y un TXT de DKIM).
   - Usa **exactamente los valores que muestra Resend**, no los de ningún ejemplo. Cópialos con el botón de copiar, no los reescribas.
   - Resend suele pedir nombres como `send.correo`, `resend._domainkey.correo` (el panel te dice cuáles).
3. **Averigua dónde está el DNS de `qdc.cl`** (busca los nameservers del dominio, p. ej. con una consulta NS o whois, o pregúntale a la persona). Entra al panel de ese proveedor (la sesión ya debería estar iniciada).
4. **Crea los registros uno por uno**, mostrando a la persona cada uno (tipo, nombre, valor, prioridad) y **pidiendo confirmación antes de guardar cada uno**.
   Puntos a vigilar:
   - Muchos paneles agregan solos el dominio al final: si el nombre es `send.correo`, escribe `send.correo` y **no** `send.correo.qdc.cl` (revisa cómo queda la vista previa).
   - En el MX, la prioridad es la que indique Resend (normalmente 10).
   - En los TXT, pega el valor tal cual; no agregues ni quites comillas si el panel ya las pone.
   - Si el DNS está en Cloudflare, los registros deben quedar en **"DNS only"** (nube gris), no en proxy.
5. **Vuelve a Resend y presiona "Verify DNS Records".** Puede tardar desde minutos hasta unas horas. Si sigue "Pending", espera y reintenta; no cambies nada mientras tanto.
6. Cuando el estado sea **Verified**, informa a la persona: "Dominio correo.qdc.cl verificado en Resend" y lista los registros que creaste.

## 4. Lo que NO debes hacer

- **No modifiques, borres ni reemplaces ningún registro DNS que ya exista**, en especial los **MX, SPF o DKIM del dominio principal `qdc.cl`** (de ellos depende el correo corporativo). Solo agregas registros nuevos bajo `correo.qdc.cl` / `send.correo` / `resend._domainkey.correo`.
- No agregues el dominio `qdc.cl` principal a Resend; solo `correo.qdc.cl`.
- No crees, muestres ni copies **API keys** de Resend, ni las pegues en el chat. Esa parte no es tu tarea.
- No toques Supabase, Vercel ni GitHub.
- No escribas contraseñas ni códigos 2FA: si el panel los pide, pídele a la persona que los ingrese ella.
- Si el panel de DNS no permite crear alguno de los registros (por ejemplo, un MX en un subdominio), **no improvises**: informa qué registro falló y el mensaje de error.

## 5. Informe final esperado

Responde con:
- Estado en Resend (Verified / Pending / Failed).
- Proveedor de DNS encontrado.
- Lista de registros creados (tipo, nombre, valor resumido).
- Cualquier cosa rara que hayas visto.

## 6. Qué pasa después (no es tu tarea)

Germán (RR.HH./Operaciones) configurará la variable `RESEND_FROM=QDC Notificaciones <notificaciones@correo.qdc.cl>` en Vercel y en los secrets de Supabase, y hará una prueba de envío a una jefatura.
