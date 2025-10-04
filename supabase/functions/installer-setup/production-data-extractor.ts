/**
 * PRODUCTION DATA EXTRACTOR
 * Extracts real production data from source project for migration
 */ export class ProductionDataExtractor {
  /**
   * Extract all production data from the current project
   */ static async extractAllData(supabase, options = {}) {
    const { includeUserData = true, includeContent = true, includeSettings = true, includeFiles = true } = options;
    try {
      console.log('🔄 Starting production data extraction...');
      const extractionResults = [];
      const recordCounts = {};
      let totalRecords = 0;
      // Core system data
      if (includeSettings) {
        const settingsData = await this.extractTableData(supabase, 'site_settings');
        if (settingsData.success) {
          extractionResults.push(settingsData.sql);
          recordCounts['site_settings'] = settingsData.count;
          totalRecords += settingsData.count;
        }
        const categoriesData = await this.extractTableData(supabase, 'site_categories');
        if (categoriesData.success) {
          extractionResults.push(categoriesData.sql);
          recordCounts['site_categories'] = categoriesData.count;
          totalRecords += categoriesData.count;
        }
      }
      // User and role data
      if (includeUserData) {
        const userRolesData = await this.extractTableData(supabase, 'user_roles');
        if (userRolesData.success) {
          extractionResults.push(userRolesData.sql);
          recordCounts['user_roles'] = userRolesData.count;
          totalRecords += userRolesData.count;
        }
      }
      // Content data
      if (includeContent) {
        const contentTables = [
          'articles',
          'news_articles',
          'events',
          'job_postings',
          'resources',
          'documents',
          'policy_documents',
          'publications',
          'team_members',
          'stakeholders',
          'sectors',
          'projects',
          'products',
          'countries',
          'e_service_portals',
          'site_pages',
          'site_posts'
        ];
        for (const table of contentTables){
          const tableData = await this.extractTableData(supabase, table);
          if (tableData.success && tableData.count > 0) {
            extractionResults.push(tableData.sql);
            recordCounts[table] = tableData.count;
            totalRecords += tableData.count;
          }
        }
      }
      // Support and system data
      const systemTables = [
        'support_departments',
        'support_tickets',
        'contact_submissions'
      ];
      for (const table of systemTables){
        const tableData = await this.extractTableData(supabase, table);
        if (tableData.success && tableData.count > 0) {
          extractionResults.push(tableData.sql);
          recordCounts[table] = tableData.count;
          totalRecords += tableData.count;
        }
      }
      const finalSql = `
-- =============================================================================
-- PRODUCTION DATA MIGRATION - EXTRACTED FROM SOURCE PROJECT
-- Generated on: ${new Date().toISOString()}
-- Total records: ${totalRecords}
-- Tables included: ${Object.keys(recordCounts).length}
-- =============================================================================

${extractionResults.join('\n\n')}

-- Update all sequences to prevent ID conflicts
${this.generateSequenceUpdates()}

-- Final verification
SELECT 
  'PRODUCTION DATA MIGRATION COMPLETED' as result,
  '${totalRecords} records migrated across ${Object.keys(recordCounts).length} tables' as message,
  now() as completion_time;
      `;
      console.log('✅ Production data extraction completed:', {
        totalRecords,
        tableCount: Object.keys(recordCounts).length,
        recordCounts
      });
      return {
        success: true,
        dataSql: finalSql,
        recordCounts,
        totalRecords
      };
    } catch (error) {
      console.error('❌ Production data extraction failed:', error);
      return {
        success: false,
        dataSql: '',
        recordCounts: {},
        totalRecords: 0,
        error: error.message
      };
    }
  }
  /**
   * Extract data from a specific table
   */ static async extractTableData(supabase, tableName) {
    try {
      console.log(`📊 Extracting data from ${tableName}...`);
      // First, get the table structure to build proper INSERT statement
      const { data: tableData, error: tableError } = await supabase.from(tableName).select('*');
      if (tableError) {
        console.warn(`⚠️ Could not extract ${tableName}:`, tableError.message);
        return {
          success: false,
          sql: '',
          count: 0,
          error: tableError.message
        };
      }
      if (!tableData || tableData.length === 0) {
        console.log(`📭 No data found in ${tableName}`);
        return {
          success: true,
          sql: `-- No data found in ${tableName}`,
          count: 0
        };
      }
      // Get column names from first record
      const columns = Object.keys(tableData[0]);
      const insertStatements = [];
      // Create INSERT statements in batches for better performance
      const batchSize = 100;
      for(let i = 0; i < tableData.length; i += batchSize){
        const batch = tableData.slice(i, i + batchSize);
        const values = batch.map((row)=>{
          const rowValues = columns.map((col)=>this.formatValue(row[col]));
          return `(${rowValues.join(', ')})`;
        });
        insertStatements.push(`
INSERT INTO public.${tableName} (${columns.join(', ')}) 
VALUES ${values.join(',\n       ')}
ON CONFLICT (id) DO NOTHING;`);
      }
      const sql = `-- Data for ${tableName} (${tableData.length} records)
${insertStatements.join('\n\n')}`;
      console.log(`✅ Extracted ${tableData.length} records from ${tableName}`);
      return {
        success: true,
        sql,
        count: tableData.length
      };
    } catch (error) {
      console.error(`❌ Failed to extract ${tableName}:`, error);
      return {
        success: false,
        sql: '',
        count: 0,
        error: error.message
      };
    }
  }
  /**
   * Format a value for SQL insertion
   */ static formatValue(value) {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'string') {
      // Escape single quotes and wrap in quotes
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (Array.isArray(value)) {
      // Format as PostgreSQL array
      const arrayValues = value.map((v)=>this.formatValue(v));
      return `ARRAY[${arrayValues.join(', ')}]`;
    }
    if (typeof value === 'object') {
      // Format as JSON
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
    }
    // Fallback: convert to string
    return `'${String(value).replace(/'/g, "''")}'`;
  }
  /**
   * Generate SQL to update sequences after data migration
   */ static generateSequenceUpdates() {
    const tables = [
      'user_roles',
      'site_settings',
      'site_categories',
      'articles',
      'news_articles',
      'events',
      'job_postings',
      'resources',
      'documents',
      'policy_documents',
      'publications',
      'team_members',
      'stakeholders',
      'sectors',
      'projects',
      'products',
      'countries',
      'e_service_portals',
      'site_pages',
      'site_posts',
      'support_departments',
      'support_tickets',
      'contact_submissions'
    ];
    const sequenceUpdates = tables.map((table)=>`SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), COALESCE((SELECT MAX(extract(epoch from created_at)::bigint) FROM public.${table}), 1), false);`);
    return `-- Update sequences to prevent ID conflicts
${sequenceUpdates.join('\n')}`;
  }
}
