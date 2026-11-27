"""Resolve and apply editor changes against the current maintainable source data."""
import json
from pathlib import Path

from .dataset import build_dataset
from .render import prepare_payload

from .paths import ROOT
FILES = {'citations': 'data/citations.json', 'claims': 'data/literature_claims.json'}
ALLOWED = set(FILES.values())


def read_source_files():
    return {name: (ROOT / name).read_bytes() for name in FILES.values()}


def same_record(left, right):
    # JSON booleans and numbers may compare equal in Python.
    return json.dumps(left, sort_keys=True) == json.dumps(right, sort_keys=True)


def merge_records(current, changes, collection, conflicts):
    if not isinstance(changes, list):
        raise ValueError(f'Changes for {collection} must be a list')
    merged = current.copy()
    seen = set()
    for edit in changes:
        if not isinstance(edit, dict) or set(edit) != {'key', 'before', 'after'}:
            raise ValueError(f'Each {collection} change needs a key, before, and after')
        key, before, after = edit['key'], edit['before'], edit['after']
        if not isinstance(key, str) or not key or key in seen:
            raise ValueError(f'Invalid or duplicate {collection} change key {key!r}')
        seen.add(key)
        for record in (before, after):
            if record is not None and (not isinstance(record, dict)
                    or (collection == 'claims' and record.get('id') != key)):
                raise ValueError(f'Invalid {collection} change record for {key}')
        existing = current.get(key)
        if same_record(existing, after):
            continue
        if not same_record(existing, before):
            conflicts.append(f'{collection}.{key}')
            continue
        if after is None:
            merged.pop(key, None)
        else:
            merged[key] = after
    return merged


def claim_records(claims):
    if not isinstance(claims, list):
        raise ValueError('Bounds must be a list')
    indexed = {}
    for claim in claims:
        key = claim.get('id') if isinstance(claim, dict) else None
        if not isinstance(key, str) or not key or key in indexed:
            raise ValueError(f'Invalid or duplicate bound ID {key!r}')
        indexed[key] = claim
    return indexed


def merge_patch(bundle, current):
    changes = bundle.get('changes')
    if not isinstance(changes, dict) or set(changes) != set(FILES):
        raise ValueError('Update bundles may change only citations and literature claims')
    citations = current[FILES['citations']]
    if not isinstance(citations, dict):
        raise ValueError('References must be an object')
    claims = claim_records(current[FILES['claims']])
    conflicts = []
    citations = merge_records(citations, changes['citations'], 'citations', conflicts)
    claims = merge_records(claims, changes['claims'], 'claims', conflicts)
    if conflicts:
        raise ValueError('Conflicting update records: ' + ', '.join(conflicts))
    return {FILES['citations']: citations, FILES['claims']: list(claims.values())}


def prepare_update(bundle, current):
    if not isinstance(bundle, dict) or bundle.get('format') != 'a-nd-update':
        raise ValueError('Choose an A(n,d) update bundle')
    version = bundle.get('schema_version')
    if type(version) is not int or version not in (1, 2):
        raise ValueError('Choose a supported A(n,d) update bundle')
    if version == 1:
        files = bundle.get('files')
        if not isinstance(files, dict) or set(files) != ALLOWED:
            raise ValueError('Update bundles may contain only citations and literature claims')
        if bundle.get('base_version') != prepare_payload()['metadata']['version']:
            raise ValueError('The update was made from another snapshot; review it against current data')
    else:
        files = merge_patch(bundle, current)
    citations = files[FILES['citations']]
    if not isinstance(citations, dict):
        raise ValueError('References must be an object')
    for key, reference in current[FILES['citations']].items():
        proposed = citations.get(key)
        fingerprint = reference.get('source_sha256')
        if fingerprint and (not isinstance(proposed, dict) or proposed.get('source_sha256') != fingerprint):
            raise ValueError(f'Keep the original archive fingerprint for {key}')
    dataset = build_dataset(citations=citations, literature_claims=files[FILES['claims']])
    return files, dataset


def validate_update_bundle(bundle):
    current = {name: json.loads(source) for name, source in read_source_files().items()}
    files, _ = prepare_update(bundle, current)
    return files


def apply_update_file(filename, *, validate_candidate=None):
    bundle = json.loads(Path(filename).read_text(encoding='utf-8'))
    lock = ROOT / 'data/.atlas-update.lock'
    try:
        lock.touch(exist_ok=False)
    except FileExistsError as error:
        raise ValueError('Another update is applying to this checkout') from error
    staged = {}
    replaced = []
    try:
        originals = read_source_files()
        current = {name: json.loads(source) for name, source in originals.items()}
        files, dataset = prepare_update(bundle, current)
        if validate_candidate is not None:
            validate_candidate(dataset)
        for name, value in files.items():
            if same_record(value, current[name]):
                continue
            target = ROOT / name
            temporary = target.with_suffix(target.suffix + '.pending')
            with temporary.open('x', encoding='utf-8', newline='\n') as stream:
                staged[name] = temporary
                stream.write(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
        if read_source_files() != originals:
            raise ValueError('The source files changed while this update was being checked; retry applying it')
        for name, temporary in staged.items():
            temporary.replace(ROOT / name)
            replaced.append(name)
    except OSError:
        for name in reversed(replaced):
            (ROOT / name).write_bytes(originals[name])
        raise
    finally:
        for temporary in staged.values():
            temporary.unlink(missing_ok=True)
        lock.unlink()
    print('Applied validated references and literature updates.' if replaced else 'These update records are already current.')
    return dataset
