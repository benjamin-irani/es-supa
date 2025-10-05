#!/usr/bin/env python3
"""
Supabase Backup & Restore CLI
Command-line interface for backing up and restoring Supabase projects
"""

import os
import sys
import click
from pathlib import Path
from dotenv import load_dotenv
from supabase_backup import SupabaseBackup
from supabase_restore import SupabaseRestore
from tabulate import tabulate
from datetime import datetime

# Load environment variables
load_dotenv()


def get_config():
    """Get configuration from environment variables"""
    config = {
        'supabase_url': os.getenv('SUPABASE_URL'),
        'supabase_key': os.getenv('SUPABASE_KEY'),
        'db_url': os.getenv('SUPABASE_DB_URL'),
        'backup_dir': os.getenv('BACKUP_DIR', './backups'),
        'project_name': os.getenv('PROJECT_NAME', '')
    }
    
    # Validate required config
    missing = [k for k, v in config.items() if not v and k not in ['backup_dir', 'project_name']]
    if missing:
        click.echo(f"❌ Error: Missing required environment variables: {', '.join(missing)}", err=True)
        click.echo("Please set them in your .env file or environment.", err=True)
        sys.exit(1)
    
    return config


@click.group()
@click.version_option(version='1.0.0')
def cli():
    """
    Supabase Backup & Restore Tool
    
    A comprehensive tool for backing up and restoring Supabase projects,
    including database, storage, and authentication data.
    """
    pass


@cli.command()
@click.option('--no-storage', is_flag=True, help='Skip storage backup')
@click.option('--no-auth', is_flag=True, help='Skip auth users backup')
@click.option('--no-edge-functions', is_flag=True, help='Skip edge functions backup')
@click.option('--output', '-o', help='Custom backup directory path')
@click.option('--project-name', '-p', help='Project name prefix for backup files (e.g., "ipa")')
def backup(no_storage, no_auth, no_edge_functions, output, project_name):
    """Create a new backup of your Supabase project"""
    config = get_config()
    
    if output:
        config['backup_dir'] = output
    
    if project_name:
        config['project_name'] = project_name
    
    click.echo("🚀 Starting Supabase backup...\n")
    
    backup_handler = SupabaseBackup(
        supabase_url=config['supabase_url'],
        supabase_key=config['supabase_key'],
        db_url=config['db_url'],
        backup_dir=config['backup_dir'],
        project_name=config['project_name']
    )
    
    try:
        backup_path = backup_handler.create_backup(
            include_storage=not no_storage,
            include_auth=not no_auth,
            include_edge_functions=not no_edge_functions
        )
        click.echo(f"\n✨ Backup saved to: {backup_path}")
    except Exception as e:
        click.echo(f"\n❌ Backup failed: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.argument('backup_path', required=False)
@click.option('--no-database', is_flag=True, help='Skip database restore')
@click.option('--no-storage', is_flag=True, help='Skip storage restore')
@click.option('--no-auth', is_flag=True, help='Skip auth users restore')
@click.option('--no-edge-functions', is_flag=True, help='Skip edge functions restore')
@click.option('--no-roles', is_flag=True, help='Skip database roles restore')
@click.option('--no-realtime', is_flag=True, help='Skip realtime config restore')
@click.option('--no-webhooks', is_flag=True, help='Skip webhooks restore')
@click.option('--mode', '-m', type=click.Choice(['clean', 'merge', 'force']), default='clean',
              help='Restore mode: clean (drop conflicts), merge (skip existing), force (drop all)')
@click.option('--yes', '-y', is_flag=True, help='Skip confirmation prompt')
@click.option('--latest', is_flag=True, help='Restore the latest backup')
def restore(backup_path, no_database, no_storage, no_auth, no_edge_functions, 
           no_roles, no_realtime, no_webhooks, mode, yes, latest):
    """Restore a backup to your Supabase project"""
    config = get_config()
    
    # If latest flag is set, find the latest backup
    if latest:
        backup_handler = SupabaseBackup(
            supabase_url=config['supabase_url'],
            supabase_key=config['supabase_key'],
            db_url=config['db_url'],
            backup_dir=config['backup_dir']
        )
        backups = backup_handler.list_backups()
        if not backups:
            click.echo("❌ No backups found", err=True)
            sys.exit(1)
        backup_path = backups[0]['path']
        click.echo(f"Using latest backup: {backup_path}\n")
    
    if not backup_path:
        click.echo("❌ Error: Please provide a backup path or use --latest flag", err=True)
        sys.exit(1)
    
    click.echo("🚀 Starting Supabase restore...\n")
    
    restore_handler = SupabaseRestore(
        supabase_url=config['supabase_url'],
        supabase_key=config['supabase_key'],
        db_url=config['db_url']
    )
    
    try:
        restore_handler.restore_backup(
            backup_path=backup_path,
            restore_database=not no_database,
            restore_storage=not no_storage,
            restore_auth=not no_auth,
            restore_edge_functions=not no_edge_functions,
            restore_roles=not no_roles,
            restore_realtime=not no_realtime,
            restore_webhooks=not no_webhooks,
            deploy_functions=True,  # Auto-deploy edge functions
            mode=mode,
            confirm=yes
        )
    except Exception as e:
        click.echo(f"\n❌ Restore failed: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--backup-dir', help='Custom backup directory to list from')
def list(backup_dir):
    """List all available backups"""
    config = get_config()
    
    if backup_dir:
        config['backup_dir'] = backup_dir
    
    backup_handler = SupabaseBackup(
        supabase_url=config['supabase_url'],
        supabase_key=config['supabase_key'],
        db_url=config['db_url'],
        backup_dir=config['backup_dir']
    )
    
    backups = backup_handler.list_backups()
    
    if not backups:
        click.echo("No backups found.")
        return
    
    # Prepare table data
    table_data = []
    for backup in backups:
        timestamp = datetime.fromisoformat(backup['timestamp'])
        formatted_time = timestamp.strftime('%Y-%m-%d %H:%M:%S')
        
        components = []
        if backup.get('include_storage'):
            components.append('Storage')
        if backup.get('include_auth'):
            components.append('Auth')
        components.append('Database')
        
        table_data.append([
            formatted_time,
            ', '.join(components),
            Path(backup['path']).name
        ])
    
    click.echo("\n📦 Available Backups:\n")
    click.echo(tabulate(table_data, headers=['Timestamp', 'Components', 'Name'], tablefmt='grid'))
    click.echo(f"\nBackup directory: {config['backup_dir']}\n")


@cli.command()
@click.argument('backup_path')
def verify(backup_path):
    """Verify a restored backup"""
    config = get_config()
    
    click.echo("🔍 Verifying restore...\n")
    
    restore_handler = SupabaseRestore(
        supabase_url=config['supabase_url'],
        supabase_key=config['supabase_key'],
        db_url=config['db_url']
    )
    
    try:
        results = restore_handler.verify_restore(backup_path)
        
        click.echo("Verification Results:")
        click.echo(f"  Database: {'✅' if results['database'] else '❌'}")
        if 'table_count' in results['details']:
            click.echo(f"    Tables: {results['details']['table_count']}")
        
        click.echo(f"  Storage: {'✅' if results['storage'] else '❌'}")
        if 'bucket_count' in results['details']:
            click.echo(f"    Buckets: {results['details']['bucket_count']}")
        
        click.echo(f"  Auth: {'✅' if results['auth'] else '❌'}")
        if 'user_count' in results['details']:
            click.echo(f"    Users: {results['details']['user_count']}")
        
        # Show errors if any
        errors = {k: v for k, v in results['details'].items() if k.endswith('_error')}
        if errors:
            click.echo("\n⚠️  Errors:")
            for key, error in errors.items():
                click.echo(f"  {key}: {error}")
        
    except Exception as e:
        click.echo(f"❌ Verification failed: {e}", err=True)
        sys.exit(1)


@cli.command()
def config():
    """Show current configuration"""
    try:
        cfg = get_config()
        
        click.echo("\n⚙️  Current Configuration:\n")
        
        # Mask sensitive data
        masked_key = cfg['supabase_key'][:10] + '...' if cfg['supabase_key'] else 'Not set'
        masked_db = cfg['db_url'].split('@')[1] if '@' in cfg['db_url'] else 'Not set'
        
        table_data = [
            ['Supabase URL', cfg['supabase_url']],
            ['Supabase Key', masked_key],
            ['Database', masked_db],
            ['Backup Directory', cfg['backup_dir']]
        ]
        
        click.echo(tabulate(table_data, headers=['Setting', 'Value'], tablefmt='grid'))
        click.echo()
        
    except SystemExit:
        click.echo("\n❌ Configuration incomplete. Please check your .env file.\n")


if __name__ == '__main__':
    cli()
