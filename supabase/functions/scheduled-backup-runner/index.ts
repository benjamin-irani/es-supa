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
    console.log('🔄 Scheduled backup runner started');
    // Query for due backups
    const { data: dueBackups, error: queryError } = await supabase.from('scheduled_backups').select('*').eq('is_active', true).lte('next_run_at', new Date().toISOString()).order('next_run_at', {
      ascending: true
    });
    if (queryError) {
      throw new Error(`Failed to query scheduled backups: ${queryError.message}`);
    }
    if (!dueBackups || dueBackups.length === 0) {
      console.log('✅ No backups due at this time');
      return new Response(JSON.stringify({
        message: 'No backups due'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`📋 Found ${dueBackups.length} due backup(s)`);
    const results = [];
    for (const backup of dueBackups){
      console.log(`🚀 Processing backup: ${backup.name}`);
      // Create execution log entry
      const { data: logEntry, error: logError } = await supabase.from('backup_execution_log').insert({
        scheduled_backup_id: backup.id,
        execution_type: 'scheduled',
        status: 'running',
        started_at: new Date().toISOString()
      }).select().single();
      if (logError) {
        console.error(`❌ Failed to create log entry: ${logError.message}`);
        continue;
      }
      try {
        // Call generate-migration-sql edge function
        const { data: sqlData, error: sqlError } = await supabase.functions.invoke('generate-migration-sql', {
          body: backup.generation_options
        });
        if (sqlError) throw sqlError;
        console.log(`📦 Generated ${Object.keys(sqlData.files).length} SQL file(s)`);
        // Upload files to storage
        const uploadedFiles = [];
        let totalSize = 0;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const backupFolder = `${backup.name.toLowerCase().replace(/\s+/g, '-')}/${timestamp}`;
        for (const [filename, content] of Object.entries(sqlData.files)){
          const filePath = `${backupFolder}/${filename}`;
          const fileContent = atob(content);
          const fileSize = new Blob([
            fileContent
          ]).size;
          const { error: uploadError } = await supabase.storage.from(backup.storage_bucket).upload(filePath, fileContent, {
            contentType: 'application/sql',
            upsert: false
          });
          if (uploadError) {
            console.error(`❌ Failed to upload ${filename}: ${uploadError.message}`);
            throw uploadError;
          }
          uploadedFiles.push(filename);
          totalSize += fileSize;
          console.log(`✅ Uploaded: ${filename} (${(fileSize / 1024).toFixed(2)} KB)`);
        }
        // Update execution log with success
        await supabase.from('backup_execution_log').update({
          status: 'success',
          completed_at: new Date().toISOString(),
          files_generated: uploadedFiles,
          total_size_bytes: totalSize,
          storage_path: backupFolder,
          metadata: {
            tables: sqlData.metadata?.stats?.tables || 0,
            functions: sqlData.metadata?.stats?.functions || 0
          }
        }).eq('id', logEntry.id);
        // Calculate next run time using database function
        const { data: nextRun } = await supabase.rpc('calculate_next_run_time', {
          p_schedule_type: backup.schedule_type,
          p_schedule_time: backup.schedule_time,
          p_schedule_day_of_week: backup.schedule_day_of_week,
          p_schedule_day_of_month: backup.schedule_day_of_month
        });
        // Update scheduled backup
        await supabase.from('scheduled_backups').update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'success',
          last_run_error: null,
          next_run_at: nextRun
        }).eq('id', backup.id);
        // Send notification
        if (backup.notification_emails && backup.notification_emails.length > 0) {
          await supabase.functions.invoke('send-backup-notification', {
            body: {
              backup_name: backup.name,
              status: 'success',
              emails: backup.notification_emails,
              files: uploadedFiles,
              total_size: totalSize,
              storage_path: backupFolder
            }
          });
        }
        // Trigger webhooks
        try {
          await supabase.functions.invoke('trigger-webhook', {
            body: {
              event: 'backup_complete',
              data: {
                backup_name: backup.name,
                files: uploadedFiles,
                total_size: totalSize,
                storage_path: backupFolder
              }
            }
          });
        } catch (webhookError) {
          console.error('Webhook trigger failed:', webhookError);
        }
        results.push({
          backup: backup.name,
          status: 'success',
          files: uploadedFiles.length,
          size: totalSize
        });
        console.log(`✅ Backup completed: ${backup.name}`);
      } catch (error) {
        console.error(`❌ Backup failed: ${backup.name}`, error);
        // Update execution log with failure
        await supabase.from('backup_execution_log').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message
        }).eq('id', logEntry.id);
        // Update scheduled backup
        await supabase.from('scheduled_backups').update({
          last_run_at: new Date().toISOString(),
          last_run_status: 'failed',
          last_run_error: error.message
        }).eq('id', backup.id);
        // Send failure notification
        if (backup.notification_emails && backup.notification_emails.length > 0) {
          await supabase.functions.invoke('send-backup-notification', {
            body: {
              backup_name: backup.name,
              status: 'failed',
              emails: backup.notification_emails,
              error: error.message
            }
          });
        }
        // Trigger webhooks
        try {
          await supabase.functions.invoke('trigger-webhook', {
            body: {
              event: 'backup_failed',
              data: {
                backup_name: backup.name,
                error: error.message
              }
            }
          });
        } catch (webhookError) {
          console.error('Webhook trigger failed:', webhookError);
        }
        results.push({
          backup: backup.name,
          status: 'failed',
          error: error.message
        });
      }
    }
    console.log('✅ Scheduled backup runner completed');
    return new Response(JSON.stringify({
      results
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('❌ Scheduled backup runner error:', error);
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
