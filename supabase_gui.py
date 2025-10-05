#!/usr/bin/env python3
"""
Supabase Backup & Restore - Graphical User Interface
A user-friendly GUI for backing up and restoring Supabase projects
"""

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, filedialog
import threading
import sys
import os
from pathlib import Path
from datetime import datetime
import subprocess

# Import existing backup/restore classes (without breaking them)
from supabase_backup import SupabaseBackup
from supabase_restore import SupabaseRestore


class SupabaseGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Supabase Backup & Restore Tool")
        self.root.geometry("900x700")
        self.root.resizable(True, True)
        
        # Configure style
        style = ttk.Style()
        style.theme_use('default')
        
        # Create notebook (tabs)
        self.notebook = ttk.Notebook(root)
        self.notebook.pack(fill='both', expand=True, padx=10, pady=10)
        
        # Create tabs
        self.backup_tab = ttk.Frame(self.notebook)
        self.restore_tab = ttk.Frame(self.notebook)
        
        self.notebook.add(self.backup_tab, text='📦 Backup')
        self.notebook.add(self.restore_tab, text='🔄 Restore')
        
        # Build UI for each tab
        self.build_backup_tab()
        self.build_restore_tab()
        
        # Status bar
        self.status_bar = ttk.Label(root, text="Ready", relief=tk.SUNKEN, anchor=tk.W)
        self.status_bar.pack(side=tk.BOTTOM, fill=tk.X)
    
    def build_backup_tab(self):
        """Build the backup tab UI"""
        # Main frame
        main_frame = ttk.Frame(self.backup_tab, padding="10")
        main_frame.pack(fill='both', expand=True)
        
        # Title
        title = ttk.Label(main_frame, text="📦 Backup Supabase Project", 
                         font=('Arial', 16, 'bold'))
        title.pack(pady=(0, 20))
        
        # Source project frame
        source_frame = ttk.LabelFrame(main_frame, text="Source Project Details", padding="10")
        source_frame.pack(fill='x', pady=(0, 10))
        
        # Supabase URL
        ttk.Label(source_frame, text="Supabase URL:").grid(row=0, column=0, sticky='w', pady=5)
        self.backup_url = ttk.Entry(source_frame, width=50)
        self.backup_url.grid(row=0, column=1, sticky='ew', pady=5, padx=(10, 0))
        self.backup_url.insert(0, "https://your-project.supabase.co")
        
        # Service Role Key
        ttk.Label(source_frame, text="Service Role Key:").grid(row=1, column=0, sticky='w', pady=5)
        self.backup_key = ttk.Entry(source_frame, width=50, show='*')
        self.backup_key.grid(row=1, column=1, sticky='ew', pady=5, padx=(10, 0))
        
        # Database URL
        ttk.Label(source_frame, text="Database URL:").grid(row=2, column=0, sticky='w', pady=5)
        self.backup_db_url = ttk.Entry(source_frame, width=50, show='*')
        self.backup_db_url.grid(row=2, column=1, sticky='ew', pady=5, padx=(10, 0))
        
        # Show/Hide password button
        self.backup_show_pass = tk.BooleanVar()
        ttk.Checkbutton(source_frame, text="Show credentials", 
                       variable=self.backup_show_pass,
                       command=self.toggle_backup_credentials).grid(row=3, column=1, sticky='w', padx=(10, 0))
        
        source_frame.columnconfigure(1, weight=1)
        
        # Options frame
        options_frame = ttk.LabelFrame(main_frame, text="Backup Options", padding="10")
        options_frame.pack(fill='x', pady=(0, 10))
        
        self.backup_storage = tk.BooleanVar(value=True)
        self.backup_auth = tk.BooleanVar(value=True)
        self.backup_edge_functions = tk.BooleanVar(value=True)
        
        ttk.Checkbutton(options_frame, text="Include Storage", 
                       variable=self.backup_storage).grid(row=0, column=0, sticky='w', pady=2)
        ttk.Checkbutton(options_frame, text="Include Auth Users", 
                       variable=self.backup_auth).grid(row=1, column=0, sticky='w', pady=2)
        ttk.Checkbutton(options_frame, text="Include Edge Functions", 
                       variable=self.backup_edge_functions).grid(row=2, column=0, sticky='w', pady=2)
        
        # Backup directory
        dir_frame = ttk.Frame(options_frame)
        dir_frame.grid(row=3, column=0, sticky='ew', pady=(10, 0))
        ttk.Label(dir_frame, text="Backup Directory:").pack(side='left')
        self.backup_dir = ttk.Entry(dir_frame, width=30)
        self.backup_dir.pack(side='left', padx=(10, 5))
        self.backup_dir.insert(0, "./backups")
        ttk.Button(dir_frame, text="Browse...", 
                  command=self.browse_backup_dir).pack(side='left')
        
        # Backup button
        self.backup_btn = ttk.Button(main_frame, text="🚀 Start Backup", 
                                     command=self.start_backup,
                                     style='Accent.TButton')
        self.backup_btn.pack(pady=10)
        
        # Progress
        self.backup_progress = ttk.Progressbar(main_frame, mode='indeterminate')
        self.backup_progress.pack(fill='x', pady=(0, 10))
        
        # Output log
        log_frame = ttk.LabelFrame(main_frame, text="Backup Log", padding="5")
        log_frame.pack(fill='both', expand=True)
        
        self.backup_log = scrolledtext.ScrolledText(log_frame, height=15, wrap=tk.WORD)
        self.backup_log.pack(fill='both', expand=True)
    
    def build_restore_tab(self):
        """Build the restore tab UI"""
        # Main frame
        main_frame = ttk.Frame(self.restore_tab, padding="10")
        main_frame.pack(fill='both', expand=True)
        
        # Title
        title = ttk.Label(main_frame, text="🔄 Restore Supabase Project", 
                         font=('Arial', 16, 'bold'))
        title.pack(pady=(0, 20))
        
        # Backup selection frame
        backup_frame = ttk.LabelFrame(main_frame, text="Select Backup", padding="10")
        backup_frame.pack(fill='x', pady=(0, 10))
        
        ttk.Label(backup_frame, text="Backup to restore:").grid(row=0, column=0, sticky='w', pady=5)
        self.restore_backup_path = ttk.Entry(backup_frame, width=40)
        self.restore_backup_path.grid(row=0, column=1, sticky='ew', pady=5, padx=(10, 5))
        ttk.Button(backup_frame, text="Browse...", 
                  command=self.browse_backup).grid(row=0, column=2, pady=5)
        ttk.Button(backup_frame, text="List Backups", 
                  command=self.list_backups).grid(row=0, column=3, pady=5, padx=(5, 0))
        
        backup_frame.columnconfigure(1, weight=1)
        
        # Target project frame
        target_frame = ttk.LabelFrame(main_frame, text="Target Project Details", padding="10")
        target_frame.pack(fill='x', pady=(0, 10))
        
        # Supabase URL
        ttk.Label(target_frame, text="Supabase URL:").grid(row=0, column=0, sticky='w', pady=5)
        self.restore_url = ttk.Entry(target_frame, width=50)
        self.restore_url.grid(row=0, column=1, sticky='ew', pady=5, padx=(10, 0))
        self.restore_url.insert(0, "https://target-project.supabase.co")
        
        # Service Role Key
        ttk.Label(target_frame, text="Service Role Key:").grid(row=1, column=0, sticky='w', pady=5)
        self.restore_key = ttk.Entry(target_frame, width=50, show='*')
        self.restore_key.grid(row=1, column=1, sticky='ew', pady=5, padx=(10, 0))
        
        # Database URL
        ttk.Label(target_frame, text="Database URL:").grid(row=2, column=0, sticky='w', pady=5)
        self.restore_db_url = ttk.Entry(target_frame, width=50, show='*')
        self.restore_db_url.grid(row=2, column=1, sticky='ew', pady=5, padx=(10, 0))
        
        # Show/Hide password button
        self.restore_show_pass = tk.BooleanVar()
        ttk.Checkbutton(target_frame, text="Show credentials", 
                       variable=self.restore_show_pass,
                       command=self.toggle_restore_credentials).grid(row=3, column=1, sticky='w', padx=(10, 0))
        
        target_frame.columnconfigure(1, weight=1)
        
        # Restore options frame
        options_frame = ttk.LabelFrame(main_frame, text="Restore Options", padding="10")
        options_frame.pack(fill='x', pady=(0, 10))
        
        # Restore mode
        ttk.Label(options_frame, text="Restore Mode:").grid(row=0, column=0, sticky='w', pady=5)
        self.restore_mode = ttk.Combobox(options_frame, width=30, state='readonly')
        self.restore_mode['values'] = ('CLEAN - Drop conflicts (recommended)', 
                                       'MERGE - Skip existing', 
                                       'FORCE - Drop all (DESTRUCTIVE)')
        self.restore_mode.current(0)
        self.restore_mode.grid(row=0, column=1, sticky='w', pady=5, padx=(10, 0))
        
        # Component checkboxes
        self.restore_database = tk.BooleanVar(value=True)
        self.restore_storage = tk.BooleanVar(value=True)
        self.restore_auth = tk.BooleanVar(value=True)
        self.restore_edge_functions = tk.BooleanVar(value=True)
        self.restore_roles = tk.BooleanVar(value=True)
        
        ttk.Checkbutton(options_frame, text="Restore Database", 
                       variable=self.restore_database).grid(row=1, column=0, sticky='w', pady=2)
        ttk.Checkbutton(options_frame, text="Restore Storage", 
                       variable=self.restore_storage).grid(row=2, column=0, sticky='w', pady=2)
        ttk.Checkbutton(options_frame, text="Restore Auth Users", 
                       variable=self.restore_auth).grid(row=3, column=0, sticky='w', pady=2)
        ttk.Checkbutton(options_frame, text="Restore Edge Functions", 
                       variable=self.restore_edge_functions).grid(row=1, column=1, sticky='w', pady=2, padx=(20, 0))
        ttk.Checkbutton(options_frame, text="Restore Database Roles", 
                       variable=self.restore_roles).grid(row=2, column=1, sticky='w', pady=2, padx=(20, 0))
        
        # Restore button
        self.restore_btn = ttk.Button(main_frame, text="🔄 Start Restore", 
                                      command=self.start_restore,
                                      style='Accent.TButton')
        self.restore_btn.pack(pady=10)
        
        # Progress
        self.restore_progress = ttk.Progressbar(main_frame, mode='indeterminate')
        self.restore_progress.pack(fill='x', pady=(0, 10))
        
        # Output log
        log_frame = ttk.LabelFrame(main_frame, text="Restore Log", padding="5")
        log_frame.pack(fill='both', expand=True)
        
        self.restore_log = scrolledtext.ScrolledText(log_frame, height=15, wrap=tk.WORD)
        self.restore_log.pack(fill='both', expand=True)
    
    def toggle_backup_credentials(self):
        """Toggle visibility of backup credentials"""
        if self.backup_show_pass.get():
            self.backup_key.config(show='')
            self.backup_db_url.config(show='')
        else:
            self.backup_key.config(show='*')
            self.backup_db_url.config(show='*')
    
    def toggle_restore_credentials(self):
        """Toggle visibility of restore credentials"""
        if self.restore_show_pass.get():
            self.restore_key.config(show='')
            self.restore_db_url.config(show='')
        else:
            self.restore_key.config(show='*')
            self.restore_db_url.config(show='*')
    
    def browse_backup_dir(self):
        """Browse for backup directory"""
        directory = filedialog.askdirectory(initialdir="./backups")
        if directory:
            self.backup_dir.delete(0, tk.END)
            self.backup_dir.insert(0, directory)
    
    def browse_backup(self):
        """Browse for backup to restore"""
        directory = filedialog.askdirectory(initialdir="./backups", 
                                           title="Select Backup Directory")
        if directory:
            self.restore_backup_path.delete(0, tk.END)
            self.restore_backup_path.insert(0, directory)
    
    def list_backups(self):
        """Show list of available backups"""
        backups_dir = Path("./backups")
        if not backups_dir.exists():
            messagebox.showinfo("No Backups", "No backups directory found.")
            return
        
        backups = sorted(backups_dir.rglob("*/metadata.json"), reverse=True)
        if not backups:
            messagebox.showinfo("No Backups", "No backups found.")
            return
        
        # Create popup window
        popup = tk.Toplevel(self.root)
        popup.title("Available Backups")
        popup.geometry("600x400")
        
        ttk.Label(popup, text="Select a backup:", font=('Arial', 12, 'bold')).pack(pady=10)
        
        # Listbox with scrollbar
        frame = ttk.Frame(popup)
        frame.pack(fill='both', expand=True, padx=10, pady=(0, 10))
        
        scrollbar = ttk.Scrollbar(frame)
        scrollbar.pack(side='right', fill='y')
        
        listbox = tk.Listbox(frame, yscrollcommand=scrollbar.set)
        listbox.pack(side='left', fill='both', expand=True)
        scrollbar.config(command=listbox.yview)
        
        # Add backups to listbox
        backup_paths = []
        for backup in backups:
            backup_dir = backup.parent
            rel_path = backup_dir.relative_to(backups_dir)
            size_mb = sum(f.stat().st_size for f in backup_dir.rglob('*') if f.is_file()) / (1024 * 1024)
            listbox.insert(tk.END, f"{rel_path} ({size_mb:.1f} MB)")
            backup_paths.append(str(backup_dir))
        
        def select_backup():
            selection = listbox.curselection()
            if selection:
                self.restore_backup_path.delete(0, tk.END)
                self.restore_backup_path.insert(0, backup_paths[selection[0]])
                popup.destroy()
        
        ttk.Button(popup, text="Select", command=select_backup).pack(pady=10)
    
    def log_backup(self, message):
        """Add message to backup log"""
        self.backup_log.insert(tk.END, message + "\n")
        self.backup_log.see(tk.END)
        self.root.update_idletasks()
    
    def log_restore(self, message):
        """Add message to restore log"""
        self.restore_log.insert(tk.END, message + "\n")
        self.restore_log.see(tk.END)
        self.root.update_idletasks()
    
    def start_backup(self):
        """Start backup process in background thread"""
        # Validate inputs
        url = self.backup_url.get().strip()
        key = self.backup_key.get().strip()
        db_url = self.backup_db_url.get().strip()
        
        if not url or not key or not db_url:
            messagebox.showerror("Error", "Please fill in all source project details!")
            return
        
        if url == "https://your-project.supabase.co":
            messagebox.showerror("Error", "Please enter your actual Supabase URL!")
            return
        
        # Confirm
        if not messagebox.askyesno("Confirm Backup", 
                                   f"Start backup of:\n{url}\n\nThis may take several minutes."):
            return
        
        # Clear log
        self.backup_log.delete(1.0, tk.END)
        
        # Disable button and start progress
        self.backup_btn.config(state='disabled')
        self.backup_progress.start()
        self.status_bar.config(text="Backup in progress...")
        
        # Run backup in thread
        thread = threading.Thread(target=self.run_backup, args=(url, key, db_url))
        thread.daemon = True
        thread.start()
    
    def run_backup(self, url, key, db_url):
        """Run backup process (called in background thread)"""
        try:
            self.log_backup("=" * 70)
            self.log_backup("🚀 Starting Supabase Backup")
            self.log_backup("=" * 70)
            self.log_backup(f"Source: {url}")
            self.log_backup(f"Backup Directory: {self.backup_dir.get()}")
            self.log_backup("")
            
            # Create backup instance
            backup = SupabaseBackup(
                supabase_url=url,
                supabase_key=key,
                db_url=db_url,
                backup_dir=self.backup_dir.get()
            )
            
            # Run backup
            backup_path = backup.create_backup(
                include_storage=self.backup_storage.get(),
                include_auth=self.backup_auth.get(),
                include_edge_functions=self.backup_edge_functions.get()
            )
            
            self.log_backup("")
            self.log_backup("=" * 70)
            self.log_backup("✅ Backup Completed Successfully!")
            self.log_backup("=" * 70)
            self.log_backup(f"Backup saved to: {backup_path}")
            
            # Show success message
            self.root.after(0, lambda: messagebox.showinfo("Success", 
                                                          f"Backup completed!\n\nSaved to:\n{backup_path}"))
            
        except Exception as e:
            self.log_backup(f"\n❌ Backup failed: {str(e)}")
            self.root.after(0, lambda: messagebox.showerror("Error", f"Backup failed:\n{str(e)}"))
        
        finally:
            # Re-enable button and stop progress
            self.root.after(0, lambda: self.backup_btn.config(state='normal'))
            self.root.after(0, lambda: self.backup_progress.stop())
            self.root.after(0, lambda: self.status_bar.config(text="Ready"))
    
    def start_restore(self):
        """Start restore process in background thread"""
        # Validate inputs
        backup_path = self.restore_backup_path.get().strip()
        url = self.restore_url.get().strip()
        key = self.restore_key.get().strip()
        db_url = self.restore_db_url.get().strip()
        
        if not backup_path:
            messagebox.showerror("Error", "Please select a backup to restore!")
            return
        
        if not url or not key or not db_url:
            messagebox.showerror("Error", "Please fill in all target project details!")
            return
        
        if url == "https://target-project.supabase.co":
            messagebox.showerror("Error", "Please enter your actual target Supabase URL!")
            return
        
        # Extract project ID
        project_id = url.split('//')[1].split('.')[0] if '//' in url else 'unknown'
        
        # Get restore mode
        mode_map = {0: 'clean', 1: 'merge', 2: 'force'}
        mode = mode_map.get(self.restore_mode.current(), 'clean')
        
        # Confirm with project ID
        confirm_msg = f"⚠️ IMPORTANT: Verify target project!\n\n"
        confirm_msg += f"Target Project ID: {project_id}\n"
        confirm_msg += f"Target URL: {url}\n\n"
        confirm_msg += f"Restore Mode: {mode.upper()}\n\n"
        confirm_msg += f"This will modify the target project.\n"
        confirm_msg += f"Are you sure you want to proceed?"
        
        if not messagebox.askyesno("Confirm Restore", confirm_msg):
            return
        
        # Clear log
        self.restore_log.delete(1.0, tk.END)
        
        # Disable button and start progress
        self.restore_btn.config(state='disabled')
        self.restore_progress.start()
        self.status_bar.config(text="Restore in progress...")
        
        # Run restore in thread
        thread = threading.Thread(target=self.run_restore, 
                                 args=(backup_path, url, key, db_url, mode))
        thread.daemon = True
        thread.start()
    
    def run_restore(self, backup_path, url, key, db_url, mode):
        """Run restore process (called in background thread)"""
        try:
            self.log_restore("=" * 70)
            self.log_restore("🔄 Starting Supabase Restore")
            self.log_restore("=" * 70)
            self.log_restore(f"Backup: {backup_path}")
            self.log_restore(f"Target: {url}")
            self.log_restore(f"Mode: {mode.upper()}")
            self.log_restore("")
            
            # Create restore instance
            restore = SupabaseRestore(
                supabase_url=url,
                supabase_key=key,
                db_url=db_url
            )
            
            # Run restore
            restore.restore_backup(
                backup_path=backup_path,
                restore_database=self.restore_database.get(),
                restore_storage=self.restore_storage.get(),
                restore_auth=self.restore_auth.get(),
                restore_edge_functions=self.restore_edge_functions.get(),
                restore_roles=self.restore_roles.get(),
                restore_realtime=True,
                restore_webhooks=True,
                mode=mode,
                confirm=True
            )
            
            self.log_restore("")
            self.log_restore("=" * 70)
            self.log_restore("✅ Restore Completed Successfully!")
            self.log_restore("=" * 70)
            
            # Show success message
            self.root.after(0, lambda: messagebox.showinfo("Success", 
                                                          f"Restore completed!\n\nTarget: {url}"))
            
        except Exception as e:
            self.log_restore(f"\n❌ Restore failed: {str(e)}")
            self.root.after(0, lambda: messagebox.showerror("Error", f"Restore failed:\n{str(e)}"))
        
        finally:
            # Re-enable button and stop progress
            self.root.after(0, lambda: self.restore_btn.config(state='normal'))
            self.root.after(0, lambda: self.restore_progress.stop())
            self.root.after(0, lambda: self.status_bar.config(text="Ready"))


def main():
    """Main entry point"""
    root = tk.Tk()
    app = SupabaseGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
