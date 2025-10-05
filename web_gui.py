#!/usr/bin/env python3
"""
Supabase Backup & Restore - Web-Based GUI
A browser-based interface that works on all systems
"""

from flask import Flask, render_template_string, request, jsonify, send_from_directory
import threading
import os
from pathlib import Path
from datetime import datetime
import json

# Import existing backup/restore classes
from supabase_backup import SupabaseBackup
from supabase_restore import SupabaseRestore

app = Flask(__name__)

# Global state for operations
operation_status = {
    'running': False,
    'type': None,
    'progress': [],
    'completed': False,
    'error': None
}

HTML_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>Supabase Backup & Restore</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1em; }
        .tabs {
            display: flex;
            background: #f5f5f5;
            border-bottom: 2px solid #e0e0e0;
        }
        .tab {
            flex: 1;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            font-size: 1.2em;
            font-weight: 600;
            transition: all 0.3s;
            border: none;
            background: transparent;
        }
        .tab:hover { background: #e8e8e8; }
        .tab.active {
            background: white;
            border-bottom: 3px solid #667eea;
            color: #667eea;
        }
        .tab-content { display: none; padding: 30px; }
        .tab-content.active { display: block; }
        .form-group {
            margin-bottom: 25px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
            font-size: 1.05em;
        }
        .form-group input, .form-group select {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 1em;
            transition: border 0.3s;
        }
        .form-group input:focus, .form-group select:focus {
            outline: none;
            border-color: #667eea;
        }
        .form-group input[type="password"] {
            font-family: monospace;
        }
        .checkbox-group {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-top: 10px;
        }
        .checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }
        .checkbox-label input[type="checkbox"] {
            width: auto;
            cursor: pointer;
        }
        .btn {
            padding: 15px 40px;
            font-size: 1.1em;
            font-weight: 600;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s;
            display: inline-block;
            text-align: center;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
            padding: 10px 20px;
            font-size: 0.95em;
        }
        .btn-secondary:hover {
            background: #5a6268;
        }
        .log-container {
            background: #1e1e1e;
            color: #00ff00;
            padding: 20px;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            max-height: 400px;
            overflow-y: auto;
            margin-top: 20px;
            line-height: 1.6;
        }
        .log-container:empty:before {
            content: 'Waiting for operation...';
            opacity: 0.5;
        }
        .status-bar {
            background: #f8f9fa;
            padding: 15px 30px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .status-indicator {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #28a745;
        }
        .status-dot.running {
            background: #ffc107;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .alert {
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .alert-info {
            background: #d1ecf1;
            border-left: 4px solid #0c5460;
            color: #0c5460;
        }
        .alert-warning {
            background: #fff3cd;
            border-left: 4px solid #856404;
            color: #856404;
        }
        .alert-success {
            background: #d4edda;
            border-left: 4px solid #155724;
            color: #155724;
        }
        .alert-error {
            background: #f8d7da;
            border-left: 4px solid #721c24;
            color: #721c24;
        }
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        @media (max-width: 768px) {
            .grid-2 { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Supabase Backup & Restore</h1>
            <p>Professional backup and restore tool for Supabase projects</p>
        </div>
        
        <div class="tabs">
            <button class="tab active" onclick="switchTab('backup')">📦 Backup</button>
            <button class="tab" onclick="switchTab('restore')">🔄 Restore</button>
        </div>
        
        <!-- Backup Tab -->
        <div id="backup-tab" class="tab-content active">
            <div class="alert alert-info">
                <strong>ℹ️ Backup your Supabase project</strong><br>
                Enter your source project credentials below. All data will be backed up locally.
            </div>
            
            <form id="backup-form" onsubmit="startBackup(event)">
                <h3 style="margin-bottom: 20px;">Source Project Details</h3>
                
                <div class="form-group">
                    <label>Supabase URL</label>
                    <input type="url" id="backup-url" placeholder="https://your-project.supabase.co" required>
                </div>
                
                <div class="form-group">
                    <label>Service Role Key</label>
                    <input type="password" id="backup-key" placeholder="eyJ..." required>
                </div>
                
                <div class="form-group">
                    <label>Database URL</label>
                    <input type="password" id="backup-db-url" placeholder="postgresql://postgres:..." required>
                </div>
                
                <div class="form-group">
                    <label>Backup Options</label>
                    <div class="checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="backup-storage" checked>
                            Include Storage
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="backup-auth" checked>
                            Include Auth Users
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="backup-functions" checked>
                            Include Edge Functions
                        </label>
                    </div>
                </div>
                
                <button type="submit" class="btn btn-primary" id="backup-btn">
                    🚀 Start Backup
                </button>
            </form>
            
            <div id="backup-log" class="log-container"></div>
        </div>
        
        <!-- Restore Tab -->
        <div id="restore-tab" class="tab-content">
            <div class="alert alert-warning">
                <strong>⚠️ Restore to target project</strong><br>
                This will modify the target project. Make sure you have the correct credentials!
            </div>
            
            <form id="restore-form" onsubmit="startRestore(event)">
                <h3 style="margin-bottom: 20px;">Select Backup</h3>
                
                <div class="form-group">
                    <label>Backup Path</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="restore-backup-path" placeholder="backups/..." required style="flex: 1;">
                        <button type="button" class="btn btn-secondary" onclick="listBackups()">
                            List Backups
                        </button>
                    </div>
                </div>
                
                <h3 style="margin: 30px 0 20px;">Target Project Details</h3>
                
                <div class="form-group">
                    <label>Supabase URL</label>
                    <input type="url" id="restore-url" placeholder="https://target-project.supabase.co" required>
                </div>
                
                <div class="form-group">
                    <label>Service Role Key</label>
                    <input type="password" id="restore-key" placeholder="eyJ..." required>
                </div>
                
                <div class="form-group">
                    <label>Database URL</label>
                    <input type="password" id="restore-db-url" placeholder="postgresql://postgres:..." required>
                </div>
                
                <div class="grid-2">
                    <div class="form-group">
                        <label>Restore Mode</label>
                        <select id="restore-mode">
                            <option value="clean">CLEAN - Drop conflicts (recommended)</option>
                            <option value="merge">MERGE - Skip existing</option>
                            <option value="force">FORCE - Drop all (DESTRUCTIVE)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Components to Restore</label>
                        <div class="checkbox-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="restore-database" checked>
                                Database
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="restore-storage" checked>
                                Storage
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="restore-auth" checked>
                                Auth
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="restore-functions" checked>
                                Edge Functions
                            </label>
                        </div>
                    </div>
                </div>
                
                <button type="submit" class="btn btn-primary" id="restore-btn">
                    🔄 Start Restore
                </button>
            </form>
            
            <div id="restore-log" class="log-container"></div>
        </div>
        
        <div class="status-bar">
            <div class="status-indicator">
                <div class="status-dot" id="status-dot"></div>
                <span id="status-text">Ready</span>
            </div>
            <div id="status-info"></div>
        </div>
    </div>
    
    <script>
        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(tab + '-tab').classList.add('active');
        }
        
        function updateStatus(running, text) {
            const dot = document.getElementById('status-dot');
            const statusText = document.getElementById('status-text');
            
            if (running) {
                dot.classList.add('running');
                statusText.textContent = text;
            } else {
                dot.classList.remove('running');
                statusText.textContent = text;
            }
        }
        
        function addLog(logId, message) {
            const log = document.getElementById(logId);
            log.innerHTML += message + '\\n';
            log.scrollTop = log.scrollHeight;
        }
        
        async function startBackup(event) {
            event.preventDefault();
            
            const btn = document.getElementById('backup-btn');
            const log = document.getElementById('backup-log');
            
            btn.disabled = true;
            log.innerHTML = '';
            updateStatus(true, 'Backup in progress...');
            
            const data = {
                url: document.getElementById('backup-url').value,
                key: document.getElementById('backup-key').value,
                db_url: document.getElementById('backup-db-url').value,
                include_storage: document.getElementById('backup-storage').checked,
                include_auth: document.getElementById('backup-auth').checked,
                include_edge_functions: document.getElementById('backup-functions').checked
            };
            
            try {
                const response = await fetch('/api/backup', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    addLog('backup-log', '✅ Backup completed successfully!');
                    addLog('backup-log', 'Backup saved to: ' + result.backup_path);
                    updateStatus(false, 'Ready');
                } else {
                    addLog('backup-log', '❌ Backup failed: ' + result.error);
                    updateStatus(false, 'Error');
                }
            } catch (error) {
                addLog('backup-log', '❌ Error: ' + error.message);
                updateStatus(false, 'Error');
            }
            
            btn.disabled = false;
        }
        
        async function startRestore(event) {
            event.preventDefault();
            
            const url = document.getElementById('restore-url').value;
            const projectId = url.split('//')[1].split('.')[0];
            
            if (!confirm(`⚠️ VERIFY TARGET PROJECT!\\n\\nProject ID: ${projectId}\\nURL: ${url}\\n\\nThis will modify the target project.\\nAre you sure?`)) {
                return;
            }
            
            const btn = document.getElementById('restore-btn');
            const log = document.getElementById('restore-log');
            
            btn.disabled = true;
            log.innerHTML = '';
            updateStatus(true, 'Restore in progress...');
            
            const data = {
                backup_path: document.getElementById('restore-backup-path').value,
                url: url,
                key: document.getElementById('restore-key').value,
                db_url: document.getElementById('restore-db-url').value,
                mode: document.getElementById('restore-mode').value,
                restore_database: document.getElementById('restore-database').checked,
                restore_storage: document.getElementById('restore-storage').checked,
                restore_auth: document.getElementById('restore-auth').checked,
                restore_edge_functions: document.getElementById('restore-functions').checked
            };
            
            try {
                const response = await fetch('/api/restore', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    addLog('restore-log', '✅ Restore completed successfully!');
                    updateStatus(false, 'Ready');
                } else {
                    addLog('restore-log', '❌ Restore failed: ' + result.error);
                    updateStatus(false, 'Error');
                }
            } catch (error) {
                addLog('restore-log', '❌ Error: ' + error.message);
                updateStatus(false, 'Error');
            }
            
            btn.disabled = false;
        }
        
        async function listBackups() {
            try {
                const response = await fetch('/api/list-backups');
                const result = await response.json();
                
                if (result.success && result.backups.length > 0) {
                    const backup = prompt('Available backups:\\n\\n' + 
                        result.backups.map((b, i) => `${i+1}. ${b.path} (${b.size})`).join('\\n') +
                        '\\n\\nEnter number to select:');
                    
                    if (backup) {
                        const index = parseInt(backup) - 1;
                        if (index >= 0 && index < result.backups.length) {
                            document.getElementById('restore-backup-path').value = result.backups[index].path;
                        }
                    }
                } else {
                    alert('No backups found');
                }
            } catch (error) {
                alert('Error listing backups: ' + error.message);
            }
        }
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/backup', methods=['POST'])
def backup():
    data = request.json
    
    try:
        backup_handler = SupabaseBackup(
            supabase_url=data['url'],
            supabase_key=data['key'],
            db_url=data['db_url']
        )
        
        backup_path = backup_handler.create_backup(
            include_storage=data.get('include_storage', True),
            include_auth=data.get('include_auth', True),
            include_edge_functions=data.get('include_edge_functions', True)
        )
        
        return jsonify({'success': True, 'backup_path': backup_path})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/restore', methods=['POST'])
def restore():
    data = request.json
    
    try:
        restore_handler = SupabaseRestore(
            supabase_url=data['url'],
            supabase_key=data['key'],
            db_url=data['db_url']
        )
        
        restore_handler.restore_backup(
            backup_path=data['backup_path'],
            restore_database=data.get('restore_database', True),
            restore_storage=data.get('restore_storage', True),
            restore_auth=data.get('restore_auth', True),
            restore_edge_functions=data.get('restore_edge_functions', True),
            restore_roles=True,
            restore_realtime=True,
            restore_webhooks=True,
            mode=data.get('mode', 'clean'),
            confirm=True
        )
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/list-backups')
def list_backups():
    try:
        backups_dir = Path('./backups')
        if not backups_dir.exists():
            return jsonify({'success': True, 'backups': []})
        
        backups = []
        for backup in sorted(backups_dir.rglob('*/metadata.json'), reverse=True):
            backup_dir = backup.parent
            size_mb = sum(f.stat().st_size for f in backup_dir.rglob('*') if f.is_file()) / (1024 * 1024)
            backups.append({
                'path': str(backup_dir),
                'size': f'{size_mb:.1f} MB'
            })
        
        return jsonify({'success': True, 'backups': backups})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    print("=" * 70)
    print("🚀 Supabase Backup & Restore - Web GUI")
    print("=" * 70)
    print("\n📱 Open your browser and go to:")
    print("\n   http://localhost:5001")
    print("\n" + "=" * 70)
    print("\nPress Ctrl+C to stop the server")
    print()
    
    app.run(debug=False, host='0.0.0.0', port=5001)
