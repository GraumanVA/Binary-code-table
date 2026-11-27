"""Build a standalone edition and a publishable dist/ directory from src/."""
import hashlib
import json
from pathlib import Path

from .paths import BUILD_DIR, ROOT, SITE_DIR, WEB_SOURCE_DIR as SOURCE
from .dataset import build_dataset

SCRIPTS = ['math.js', 'bounds.js', 'state.js', 'format.js', 'export.js', 'app.js', 'data.js', 'boot.js']
WORKER_SCRIPTS = ['math.js', 'bounds.js', 'state.js', 'export.js', 'export-worker.js']


def embedded_json(value):
    # JSON parsing restores '<'; HTML parsing never sees an injected end tag.
    return json.dumps(value, ensure_ascii=False).replace('<', chr(92) + 'u003c')


def prepare_payload(dataset=None):
    payload = dict(build_dataset() if dataset is None else dataset)
    payload['metadata'] = dict(payload['metadata'])
    payload['metadata'].pop('version', None)
    rules = '\n'.join((SOURCE / name).read_text(encoding='utf-8') for name in ['math.js', 'bounds.js'])
    digest = hashlib.sha256((json.dumps(payload, sort_keys=True, ensure_ascii=False) + rules).encode('utf-8')).hexdigest()
    payload['metadata']['version'] = 'snapshot-' + digest[:16]
    return payload


def worker_source():
    return '\n'.join((SOURCE / name).read_text(encoding='utf-8') for name in WORKER_SCRIPTS)


def render(dataset):
    payload = prepare_payload(dataset)
    template = (SOURCE / 'index.template.html').read_text(encoding='utf-8')
    scripts = []
    for name in SCRIPTS:
        code = (SOURCE / name).read_text(encoding='utf-8')
        if '</script' in code.lower():
            raise ValueError(f'Unsafe script terminator in {name}')
        scripts.append('<script>\n' + code + '\n</script>')
    html = template.replace('href="./editor.html"', 'href="../dist/editor.html"').replace('__STYLES__', (SOURCE / 'styles.css').read_text(encoding='utf-8'))
    html = html.replace('__SEED__', embedded_json(payload))
    html = html.replace('__WORKER__', '<script id="exportWorker" type="application/json">' + embedded_json(worker_source()) + '</script>')
    html = html.replace('__SCRIPTS__', '\n'.join(scripts))
    if any(token in html for token in ['__STYLES__', '__SEED__', '__WORKER__', '__SCRIPTS__']):
        raise ValueError('Unresolved template marker')
    BUILD_DIR.mkdir(exist_ok=True)
    (BUILD_DIR / 'coding_bounds.html').write_text(html, encoding='utf-8')
    destination = SITE_DIR
    if destination.resolve() != ROOT.resolve() / 'dist':
        raise ValueError('Publication output must stay inside the project dist directory')
    destination.mkdir(exist_ok=True)
    if any(path.is_symlink() for path in destination.rglob('*')):
        raise ValueError('Publication output must not contain symbolic links')
    emitted = set()
    assets = destination / 'assets'
    public_data = destination / 'data'
    assets.mkdir(exist_ok=True)
    public_data.mkdir(exist_ok=True)

    def publish_asset(name, content):
        digest = hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]
        path = Path(name)
        filename = f'{path.stem}.{digest}{path.suffix}'
        (assets / filename).write_text(content, encoding='utf-8')
        emitted.add('assets/' + filename)
        return './assets/' + filename

    styles_url = publish_asset('styles.css', (SOURCE / 'styles.css').read_text(encoding='utf-8'))
    script_urls = [publish_asset(name, (SOURCE / name).read_text(encoding='utf-8')) for name in SCRIPTS]
    worker_url = publish_asset('export-worker.bundle.js', worker_source())
    version = payload['metadata']['version']
    bounds = {key: payload[key] for key in ['litsyn', 'brouwer', 'grassl', 'literature_claims', 'editorial_exclusions', 'code_types']}
    references = {key: payload[key] for key in ['bibliography', 'citation_metadata', 'bound_references']}
    filenames = {'bounds': f'bounds.{version}.json', 'references': f'references.{version}.json'}
    for key, contents in [('bounds', bounds), ('references', references)]:
        document = dict(contents, version=version)
        (public_data / filenames[key]).write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        emitted.add('data/' + filenames[key])
    manifest = dict(schema_version=1, version=version, metadata=payload['metadata'], files=filenames)
    manifest_text = json.dumps(manifest, indent=2, ensure_ascii=False) + '\n'
    (public_data / f'manifest.{version}.json').write_text(manifest_text, encoding='utf-8')
    (public_data / 'manifest.json').write_text(manifest_text, encoding='utf-8')
    emitted.update(['data/manifest.json', f'data/manifest.{version}.json'])
    config = dict(manifest=f'./data/manifest.{version}.json', worker=worker_url)
    external = template.replace('<style>\n__STYLES__\n</style>', f'<link rel="stylesheet" href="{styles_url}">')
    external = external.replace('<script id="seed" type="application/json">__SEED__</script>',
                                '<script id="appConfig" type="application/json">' + embedded_json(config) + '</script>')
    external = external.replace('__WORKER__', '')
    external = external.replace('__SCRIPTS__', '\n'.join(f'<script defer src="{url}"></script>' for url in script_urls))
    (destination / 'index.html').write_text(external, encoding='utf-8')
    emitted.add('index.html')
    editor_styles = [styles_url, publish_asset('editor.css', (SOURCE / 'editor.css').read_text(encoding='utf-8'))]
    editor_scripts = ['math.js', 'bounds.js', 'format.js', 'data.js', 'editor-model.js', 'editor.js']
    editor_urls = [publish_asset(name, (SOURCE / name).read_text(encoding='utf-8')) for name in editor_scripts]
    editor = (SOURCE / 'editor.template.html').read_text(encoding='utf-8')
    editor = editor.replace('__EDITOR_STYLES__', '\n'.join(f'<link rel="stylesheet" href="{url}">' for url in editor_styles))
    editor = editor.replace('__EDITOR_CONFIG__', embedded_json(dict(manifest=config['manifest'])))
    editor = editor.replace('__EDITOR_SCRIPTS__', '\n'.join(f'<script defer src="{url}"></script>' for url in editor_urls))
    (destination / 'editor.html').write_text(editor, encoding='utf-8')
    emitted.add('editor.html')
    (destination / '.nojekyll').write_text('', encoding='utf-8')
    emitted.add('.nojekyll')
    release = dict(version=version, scope=payload['metadata']['scope'],
                   source_dates={name: payload['metadata'][name].get('date') for name in ['litsyn', 'brouwer', 'grassl']},
                   manifest=config['manifest'])
    (destination / 'release.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8')
    emitted.add('release.json')
    # dist/ is generated output: retain precisely the current release, not stale
    # assets, data files or wording from earlier builds.
    for output in destination.rglob('*'):
        if output.is_file() and output.relative_to(destination).as_posix() not in emitted:
            output.unlink()
    print(f"Built external-data dist/ and standalone edition ({version}).")
    return html
