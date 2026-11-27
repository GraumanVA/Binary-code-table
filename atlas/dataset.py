"""Rebuild the source snapshot from supplied local inputs; no packages required."""
import csv
import json

from .archives import parse_archive, parse_bibliography
from .attribution import enrich_attribution
from .claims import validate_literature_claims, validate_literature_consistency
from .grassl import add_attribution, load_source
from .paths import BUILD_DIR, DATA_DIR, SOURCE_DATA_DIR


def build_dataset(*, citations=None, literature_claims=None, include_grassl=True):
    dataset = json.loads((DATA_DIR / 'snapshot.json').read_text(encoding='utf-8'))
    dataset['litsyn'] = parse_archive((SOURCE_DATA_DIR / 'index.html').read_text(encoding='utf-8'))
    dataset['bibliography'] = parse_bibliography((SOURCE_DATA_DIR / 'refs.html').read_text(encoding='utf-8'))
    with (DATA_DIR / 'brouwer_snapshot.csv').open(encoding='utf-8', newline='') as stream:
        dataset['brouwer'] = [dict(row, id=f"BRO-{row['n']}-{row['d']}",
                                     n=int(row['n']), d=int(row['d'])) for row in csv.DictReader(stream)]
    for source in ['litsyn', 'brouwer']:
        dataset['metadata'][source]['records'] = len(dataset[source])
    dataset = enrich_attribution(dataset, references=citations)
    records = literature_claims if literature_claims is not None else json.loads((DATA_DIR / 'literature_claims.json').read_text(encoding='utf-8'))
    dataset['literature_claims'] = validate_literature_claims(records, dataset['citation_metadata'])
    validate_literature_consistency(dataset)
    if include_grassl:
        reference = dataset['metadata']['grassl']['reference_id']
        if reference not in dataset['citation_metadata']:
            raise ValueError(f'Unknown Grassl reference: {reference}')
        dataset['grassl'] = load_source(SOURCE_DATA_DIR, dataset)
        add_attribution(dataset['grassl'], DATA_DIR / 'grassl_references.json', dataset['citation_metadata'])
    return dataset


def write_snapshot(dataset, directory=BUILD_DIR):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'coding_bounds_seed.json').write_text(
        json.dumps(dataset, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    outputs = [
        ('litsyn', 'litsyn_import.csv', ['n', 'd', 'k', 'N', 'lower', 'type', 'refs']),
        ('brouwer', 'brouwer_import.csv', ['n', 'd', 'lower', 'upper', 'raw']),
    ]
    for source, filename, fields in outputs:
        with (directory / filename).open('w', encoding='utf-8', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            for row in dataset[source]:
                writer.writerow({key: ','.join(row[key]) if key == 'refs' else row[key] for key in fields})
