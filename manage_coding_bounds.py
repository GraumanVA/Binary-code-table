"""One-command build or local server for the maintained bounds table."""
import argparse
import runpy
from pathlib import Path

from build_coding_bounds import build_dataset, write_snapshot
from render_coding_bounds import render
from serve_coding_bounds import main as serve
from coding_bounds_updates import apply_update_file

ROOT = Path(__file__).resolve().parent


def build():
    dataset = build_dataset()
    write_snapshot(dataset)
    runpy.run_path(str(ROOT / 'validate_coding_bounds.py'), run_name='__main__')
    render()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('build', help='validate data and rebuild both editions')
    update = commands.add_parser('apply', help='apply a validated editor update bundle and rebuild')
    update.add_argument('filename')
    commands.add_parser('package', help='build and prepare source/site packages for GitHub Pages')
    server = commands.add_parser('serve', help='rebuild and serve a local HTTP server')
    server.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if args.command == 'apply':
        apply_update_file(args.filename)
    build()
    if args.command == 'serve':
        serve(['--port', str(args.port)])
    elif args.command == 'package':
        from package_github_pages import package
        package()


if __name__ == '__main__':
    main()
