"""Validate and apply exactly the two source files exported by the data editor."""
import json
from pathlib import Path

from build_coding_bounds import build_dataset
from render_coding_bounds import prepare_payload

ROOT = Path(__file__).resolve().parent
ALLOWED = {'data/citations.json', 'data/literature_claims.json'}


def validate_update_bundle(bundle):
    if not isinstance(bundle, dict) or bundle.get('format') != 'a-nd-update' or bundle.get('schema_version') != 1:
        raise ValueError('Choose an A(n,d) update bundle')
    files = bundle.get('files')
    if not isinstance(files, dict) or set(files) != ALLOWED:
        raise ValueError('Update bundles may contain only citations and literature claims')
    current = prepare_payload()
    if bundle.get('base_version') != current['metadata']['version']:
        raise ValueError('The update was made from another snapshot; review it against current data')
    citations = files['data/citations.json']
    if not isinstance(citations, dict):
        raise ValueError('References must be an object')
    for key, reference in current['citation_metadata'].items():
        proposed = citations.get(key)
        if reference.get('source_sha256') and (not isinstance(proposed, dict) or proposed.get('source_sha256') != reference['source_sha256']):
            raise ValueError(f'Keep the original archive fingerprint for {key}')
    build_dataset(citations=citations, literature_claims=files['data/literature_claims.json'])
    return files


def apply_update_file(filename):
    bundle = json.loads(Path(filename).read_text(encoding='utf-8'))
    files = validate_update_bundle(bundle)
    originals = {name: (ROOT / name).read_bytes() for name in ALLOWED}
    staged = []
    try:
        for name in sorted(ALLOWED):
            target = ROOT / name
            temporary = target.with_suffix(target.suffix + '.pending')
            temporary.write_text(json.dumps(files[name], indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
            staged.append(temporary)
        for temporary in staged:
            temporary.replace(temporary.with_suffix(''))
    except OSError:
        for name, content in originals.items():
            (ROOT / name).write_bytes(content)
        raise
    finally:
        for temporary in staged:
            if temporary.exists():
                temporary.unlink()
    print('Applied validated references and literature updates.')
