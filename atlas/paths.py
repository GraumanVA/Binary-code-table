"""Paths shared by the Atlas build and maintenance commands."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'data'
SOURCE_DATA_DIR = DATA_DIR / 'sources'
WEB_SOURCE_DIR = ROOT / 'src'
BUILD_DIR = ROOT / 'build'
SITE_DIR = ROOT / 'dist'
RELEASE_DIR = BUILD_DIR / 'release'
