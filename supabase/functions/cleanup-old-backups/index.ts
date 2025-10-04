import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('🧹 Starting backup cleanup process');
    // Get all active scheduled backups
    const { data: schedules, error: schedulesError } = await supabase.from('scheduled_backups').select('id, name, retention_days, storage_bucket');
    if (schedulesError) {
      throw new Error(`Failed to fetch schedules: ${schedulesError.message}`);
    }
    let totalDeleted = 0;
    let totalBytesFreed = 0;
    for (const schedule of schedules){
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - schedule.retention_days);
      console.log(`🔍 Checking backups for: ${schedule.name} (older than ${retentionDate.toISOString()})`);
      // Find old execution logs
      const { data: oldLogs, error: logsError } = await supabase.from('backup_execution_log').select('id, storage_path, total_size_bytes').eq('scheduled_backup_id', schedule.id).eq('status', 'success').lt('started_at', retentionDate.toISOString());
      if (logsError) {
        console.error(`❌ Failed to query logs: ${logsError.message}`);
        continue;
      }
      if (!oldLogs || oldLogs.length === 0) {
        console.log(`✅ No old backups to clean for: ${schedule.name}`);
        continue;
      }
      console.log(`📦 Found ${oldLogs.length} old backup(s) to delete`);
      // Delete files from storage
      for (const log of oldLogs){
        if (!log.storage_path) continue;
        try {
          // List files in the backup folder
          const { data: files, error: listError } = await supabase.storage.from(schedule.storage_bucket).list(log.storage_path);
          if (listError) {
            console.error(`❌ Failed to list files: ${listError.message}`);
            continue;
          }
          if (files && files.length > 0) {
            // Delete all files in the folder
            const filePaths = files.map((file)=>`${log.storage_path}/${file.name}`);
            const { error: deleteError } = await supabase.storage.from(schedule.storage_bucket).remove(filePaths);
            if (deleteError) {
              console.error(`❌ Failed to delete files: ${deleteError.message}`);
              continue;
            }
            console.log(`🗑️ Deleted ${files.length} file(s) from ${log.storage_path}`);
            totalDeleted += files.length;
            totalBytesFreed += log.total_size_bytes || 0;
          }
          // Mark the log as cleaned (optional: or delete the log entry)
          await supabase.from('backup_execution_log').update({
            metadata: {
              cleaned_at: new Date().toISOString()
            }
          }).eq('id', log.id);
        } catch (error) {
          console.error(`❌ Error cleaning ${log.storage_path}:`, error);
        }
      }
    }
    const mbFreed = (totalBytesFreed / (1024 * 1024)).toFixed(2);
    console.log(`✅ Cleanup completed: Deleted ${totalDeleted} file(s), freed ${mbFreed} MB`);
    return new Response(JSON.stringify({
      success: true,
      files_deleted: totalDeleted,
      bytes_freed: totalBytesFreed,
      mb_freed: parseFloat(mbFreed)
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
