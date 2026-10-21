-- =========================================================
-- Beneficio "día de cumpleaños" (reemplaza el tipo "Sin goce de sueldo").
-- Reglas:
--  * Permiso de jornada completa (sin horas), un solo día.
--  * Un día hábil (lunes a viernes, sin feriados) entre 5 días hábiles
--    antes y 5 días hábiles después del cumpleaños (el mismo día del
--    cumpleaños si es hábil).
--  * Uno por año por trabajador (pendiente o aprobado cuenta; si lo
--    rechazan puede volver a pedirlo).
--  * Si alguien cumple el 29 de febrero, en años no bisiestos se usa el 28.
--  * Se aprueba igual que cualquier permiso y NO descuenta vacaciones.
-- Aplicar en el SQL Editor de Supabase. Seguro de re-ejecutar completo.
-- =========================================================

-- 1) Marca el tipo de permiso y renombra "Sin goce de sueldo".
alter table tipos_permiso add column if not exists es_cumpleanos boolean not null default false;

update tipos_permiso
   set nombre = 'Beneficio día de cumpleaños',
       es_cumpleanos = true
 where nombre ilike 'sin goce%'
    or es_cumpleanos = true;

do $$
begin
  if not exists (select 1 from tipos_permiso where es_cumpleanos) then
    raise exception 'No se encontró el tipo "Sin goce de sueldo" para renombrar. Revisa los nombres en la tabla tipos_permiso.';
  end if;
end $$;

-- 2) Permisos de día completo: sin horas (el resto de la app ya lo trata
--    como "todo el día"), y año del beneficio para evitar duplicados.
alter table solicitudes_permiso alter column hora_desde drop not null;
alter table solicitudes_permiso alter column hora_hasta drop not null;
alter table solicitudes_permiso add column if not exists anio_beneficio int;

create unique index if not exists ux_cumpleanos_uno_por_anio
  on solicitudes_permiso (trabajador_id, anio_beneficio)
  where anio_beneficio is not null and estado in ('pendiente', 'aprobada');

-- 3) Funciones de apoyo.
create or replace function es_dia_habil(p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select extract(isodow from p_fecha) < 6
     and not exists (select 1 from feriados f where f.fecha = p_fecha);
$$;

create or replace function cumple_en_anio(p_nacimiento date, p_anio int)
returns date
language sql
immutable
as $$
  select case
    when extract(month from p_nacimiento) = 2
     and extract(day from p_nacimiento) = 29
     and not ((p_anio % 4 = 0 and p_anio % 100 <> 0) or p_anio % 400 = 0)
    then make_date(p_anio, 2, 28)
    else make_date(p_anio, extract(month from p_nacimiento)::int, extract(day from p_nacimiento)::int)
  end;
$$;

-- 4) Validación en la base (el candado final, aunque alguien se salte la pantalla).
create or replace function validar_permiso_cumpleanos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es boolean;
  v_nac date;
  v_anio int;
  v_cumple date;
  v_dist int;
  v_ok boolean := false;
begin
  select es_cumpleanos into v_es from tipos_permiso where id = new.tipo_permiso_id;
  if not coalesce(v_es, false) then
    new.anio_beneficio := null;
    return new;
  end if;

  select fecha_nacimiento into v_nac from trabajadores where id = new.trabajador_id;
  if v_nac is null then
    raise exception 'No tienes fecha de nacimiento registrada. Contacta a RR.HH.';
  end if;

  if new.fecha_desde <> new.fecha_hasta then
    raise exception 'El beneficio de cumpleaños es de un solo día.';
  end if;

  if (tg_op = 'INSERT' or new.fecha_desde is distinct from old.fecha_desde)
     and new.fecha_desde < (now() at time zone 'America/Santiago')::date then
    raise exception 'El día elegido no puede ser una fecha pasada.';
  end if;

  if not es_dia_habil(new.fecha_desde) then
    raise exception 'El día elegido debe ser un día hábil (lunes a viernes, sin feriados).';
  end if;

  for v_anio in (extract(year from new.fecha_desde)::int - 1) .. (extract(year from new.fecha_desde)::int + 1) loop
    v_cumple := cumple_en_anio(v_nac, v_anio);
    if new.fecha_desde = v_cumple then
      v_dist := 0;
    elsif new.fecha_desde > v_cumple then
      select count(*) into v_dist
        from generate_series(v_cumple + 1, new.fecha_desde, interval '1 day') g
       where es_dia_habil(g::date);
    else
      select count(*) into v_dist
        from generate_series(new.fecha_desde, v_cumple - 1, interval '1 day') g
       where es_dia_habil(g::date);
    end if;
    if v_dist <= 5 then
      v_ok := true;
      new.anio_beneficio := v_anio;
      exit;
    end if;
  end loop;

  if not v_ok then
    raise exception 'El día elegido debe estar a máximo 5 días hábiles de tu cumpleaños.';
  end if;

  -- Jornada completa: sin horas.
  new.hora_desde := null;
  new.hora_hasta := null;
  return new;
end;
$$;

drop trigger if exists trg_validar_permiso_cumpleanos on solicitudes_permiso;
create trigger trg_validar_permiso_cumpleanos
  before insert or update of fecha_desde, fecha_hasta, tipo_permiso_id
  on solicitudes_permiso
  for each row execute function validar_permiso_cumpleanos();
