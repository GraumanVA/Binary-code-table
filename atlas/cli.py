"""Command line for the A(n,d) Atlas."""
import argparse
from pathlib import Path

from .dataset import build_dataset, write_snapshot
from .distribution import package
from .grassl import import_snapshot
from .paths import BUILD_DIR, ROOT, SOURCE_DATA_DIR
from .render import render
from .serve import serve
from .updates import apply_update_file
from .validation import validate_dataset, write_report


def build(dataset=None, *, report=None):
    if dataset is None:
        dataset = build_dataset()
    if report is None:
        report = validate_dataset(dataset)
    render(dataset)
    write_snapshot(dataset)
    path = write_report(report, BUILD_DIR)
    print(f'Validation report written to {path.relative_to(ROOT).as_posix()}.')


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m atlas', description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('build', help='validate data and rebuild both editions')
    commands.add_parser('check', help='validate source data without writing a build')
    update = commands.add_parser('apply', help='apply a validated editor update bundle and rebuild')
    update.add_argument('filename', type=Path)
    commands.add_parser('package', help='build and prepare source/site packages for GitHub Pages')
    import_grassl = commands.add_parser('import-grassl', help='import a saved complete binary CodeTables page')
    import_grassl.add_argument('filename', type=Path)
    import_grassl.add_argument('--captured', required=True, metavar='YYYY-MM-DD', help='capture date of the saved page')
    server = commands.add_parser('serve', help='rebuild and serve a local HTTP server')
    server.add_argument('--port', type=int, default=8000)
    args = parser.parse_args(argv)

    try:
        if args.command == 'import-grassl':
            count = import_snapshot(args.filename, SOURCE_DATA_DIR, args.captured)
            print(f'Saved {count:,} Grassl source cells under data/sources/.')
            return
        if args.command == 'check':
            print(validate_dataset(build_dataset()).rstrip())
            return
        if args.command == 'apply':
            report = None

            def validate_candidate(dataset):
                nonlocal report
                report = validate_dataset(dataset)

            dataset = apply_update_file(args.filename, validate_candidate=validate_candidate)
            build(dataset, report=report)
            return
        build()
        if args.command == 'serve':
            serve(args.port)
        elif args.command == 'package':
            package()
    except (OSError, ValueError) as error:
        parser.exit(1, f'{parser.prog}: {error}\n')
