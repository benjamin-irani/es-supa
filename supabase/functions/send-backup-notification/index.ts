import { Resend } from 'npm:resend@4.0.0';
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.warn('⚠️ RESEND_API_KEY not configured, skipping email notification');
      return new Response(JSON.stringify({
        message: 'Email not configured'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const resend = new Resend(resendApiKey);
    const body = await req.json();
    console.log(`📧 Sending ${body.status} notification for: ${body.backup_name}`);
    let subject;
    let htmlContent;
    if (body.status === 'success') {
      const sizeInMB = body.total_size ? (body.total_size / (1024 * 1024)).toFixed(2) : '0';
      subject = `✅ Scheduled Backup Completed: ${body.backup_name}`;
      htmlContent = `
        <h2>Scheduled Backup Completed Successfully</h2>
        <p>Your scheduled backup "<strong>${body.backup_name}</strong>" has completed successfully.</p>
        
        <h3>Execution Details:</h3>
        <ul>
          <li><strong>Status:</strong> ✅ Success</li>
          <li><strong>Files Generated:</strong> ${body.files?.length || 0}</li>
          <li><strong>Total Size:</strong> ${sizeInMB} MB</li>
          <li><strong>Storage Path:</strong> ${body.storage_path || 'N/A'}</li>
          <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
        </ul>
        
        ${body.files && body.files.length > 0 ? `
          <h3>Generated Files:</h3>
          <ul>
            ${body.files.map((file)=>`<li>${file}</li>`).join('')}
          </ul>
        ` : ''}
        
        <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; color: #666;">
          This is an automated notification from your backup system.
        </p>
      `;
    } else {
      subject = `❌ Scheduled Backup Failed: ${body.backup_name}`;
      htmlContent = `
        <h2>Scheduled Backup Failed</h2>
        <p>Your scheduled backup "<strong>${body.backup_name}</strong>" failed to complete.</p>
        
        <h3>Error Details:</h3>
        <div style="background-color: #fee; padding: 15px; border-left: 4px solid #c00; margin: 15px 0;">
          <strong>Error:</strong> ${body.error || 'Unknown error'}
        </div>
        
        <h3>Recommended Actions:</h3>
        <ul>
          <li>Check the backup configuration in your admin dashboard</li>
          <li>Verify that all required services are running</li>
          <li>Review the backup execution logs for more details</li>
          <li>Try running the backup manually to diagnose the issue</li>
        </ul>
        
        <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; color: #666;">
          This is an automated notification from your backup system.
        </p>
      `;
    }
    // Send email to all recipients
    const emailPromises = body.emails.map((email)=>resend.emails.send({
        from: 'Backup System <onboarding@resend.dev>',
        to: [
          email
        ],
        subject,
        html: htmlContent
      }));
    await Promise.all(emailPromises);
    console.log(`✅ Notifications sent to ${body.emails.length} recipient(s)`);
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('❌ Notification error:', error);
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
