"""
Setup script for Supabase Backup & Restore Tool
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="supabase-backup-restore",
    version="1.0.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="A comprehensive tool for backing up and restoring Supabase projects",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/supabase-backup-restore",
    py_modules=[
        'supabase_backup',
        'supabase_restore',
        'cli',
        'example_usage'
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Database :: Database Engines/Servers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "supabase==2.3.4",
        "python-dotenv==1.0.0",
        "click==8.1.7",
        "psycopg2-binary==2.9.9",
        "requests==2.31.0",
        "tqdm==4.66.1",
        "tabulate==0.9.0",
    ],
    entry_points={
        'console_scripts': [
            'supabase-backup=cli:cli',
        ],
    },
)
