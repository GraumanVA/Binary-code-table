"""Create reproducible source and static-site ZIPs for GitHub Pages publication."""
import hashlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent
SOURCE_FILES = [
    '.gitignore', 'README.md', 'MAINTENANCE.md', 'PUBLISHING.md', 'NOTICE.md', 'package.json',
    'index.html', 'refs.html', 'build_coding_bounds.py', 'manage_coding_bounds.py',
    'render_coding_bounds.py', 'serve_coding_bounds.py', 'validate_coding_bounds.py',
    'coding_bounds_import.py', 'coding_bounds_attribution.py', 'coding_bounds_claims.py',
    'coding_bounds_grassl.py', 'coding_bounds_math.py', 'coding_bounds_updates.py', 'package_github_pages.py',
]
SOURCE_FOLDERS = ['src', 'data', 'tests', '.github']


def source_files():
    paths = [ROOT / name for name in SOURCE_FILES]
    for name in SOURCE_FOLDERS:
        paths.extend(path for path in (ROOT / name).rglob('*')
                     if path.is_file() and '__pycache__' not in path.parts
                     and not path.name.endswith(('.pyc', '.pending')))
    return sorted(paths)


def write_archive(destination, files, base):
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            if path.is_symlink() or not path.resolve().is_relative_to(base.resolve()):
                raise ValueError(f'Package input must be a regular file inside {base}')
            entry = ZipInfo(path.relative_to(base).as_posix(), (2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes(), compresslevel=9)


def package():
    output = ROOT / 'release'
    output.mkdir(exist_ok=True)
    if output.is_symlink():
        raise ValueError('Release directory must stay inside the project')
    source = output / 'github-pages-source.zip'
    site = output / 'github-pages-site.zip'
    write_archive(source, source_files(), ROOT)
    write_archive(site, [path for path in (ROOT / 'dist').rglob('*') if path.is_file()], ROOT / 'dist')
    checksums = '\n'.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}' for path in [source, site])
    (output / 'SHA256SUMS').write_text(checksums + '\n', encoding='utf-8')
    print('Prepared release/github-pages-source.zip and release/github-pages-site.zip.')
    return source, site


if __name__ == '__main__':
    from manage_coding_bounds import build
    build()
    package()
