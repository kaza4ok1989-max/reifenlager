
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ktcwrivsqjqxnuputcmm.supabase.co';

const supabaseKey = 'sb_publishable_C4L5OcyiGWL2laGVu2f-Rw_mQAH8zRK';

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
