import { supabase } from "../lib/supabase";

export async function claimJobTask(jobTaskId: string, vehicleName?: string) {
  if (!supabase) return { data: null, error: null };

  const { data, error } = await supabase.rpc("claim_job_task", {
    p_job_task_id: jobTaskId,
    p_vehicle_name: vehicleName ?? null,
  });

  return { data, error };
}
