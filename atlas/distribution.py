"""Create reproducible source and static-site ZIPs for GitHub Pages publication."""
import hashlib
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from .paths import BUILD_DIR, RELEASE_DIR, ROOT, SITE_DIR

SOURCE_FILES = ['.gitignore', 'README.md', 'NOTICE.md', 'package.json']
SOURCE_FOLDERS = ['atlas', 'src', 'data', 'docs', 'tests', '.github']
SOURCE_LOCKS = {'.atlas-update.lock', '.grassl-import.lock'}


def source_files():
    paths = [ROOT / name for name in SOURCE_FILES]
    for name in SOURCE_FOLDERS:
        paths.extend(path for path in (ROOT / name).rglob('*')
                     if path.is_file() and '__pycache__' not in path.parts and path.name not in SOURCE_LOCKS
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
    output = RELEASE_DIR
    if output.resolve() != ROOT.resolve() / BUILD_DIR.name / 'release':
        raise ValueError('Release directory must stay inside the project')
    output.mkdir(parents=True, exist_ok=True)
    source = output / 'github-pages-source.zip'
    site = output / 'github-pages-site.zip'
    write_archive(source, source_files(), ROOT)
    write_archive(site, [path for path in SITE_DIR.rglob('*') if path.is_file()], SITE_DIR)
    checksums = '\n'.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}' for path in [source, site])
    (output / 'SHA256SUMS').write_text(checksums + '\n', encoding='utf-8')
    print(f'Prepared {source.relative_to(ROOT).as_posix()} and {site.relative_to(ROOT).as_posix()}.')
    return source, site
