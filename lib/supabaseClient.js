import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_LdpMM8weg28AtLvp1hfEaQ_VMJvPv5o';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
