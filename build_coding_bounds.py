"""Rebuild the source snapshot from supplied local inputs; no packages required."""
import csv
import json
from pathlib import Path
from coding_bounds_attribution import enrich_attribution
from coding_bounds_import import parse_archive, parse_bibliography
from coding_bounds_claims import validate_literature_claims, validate_literature_consistency

ROOT = Path(__file__).resolve().parent


def build_dataset(*, citations=None, literature_claims=None):
    dataset = json.loads((ROOT / 'data/snapshot.json').read_text(encoding='utf-8'))
    dataset['litsyn'] = parse_archive((ROOT / 'index.html').read_text(encoding='utf-8'))
    dataset['bibliography'] = parse_bibliography((ROOT / 'refs.html').read_text(encoding='utf-8'))
    with (ROOT / 'data/brouwer_snapshot.csv').open(encoding='utf-8', newline='') as stream:
        dataset['brouwer'] = [dict(row, id=f"BRO-{row['n']}-{row['d']}",
                                     n=int(row['n']), d=int(row['d'])) for row in csv.DictReader(stream)]
    for source in ['litsyn', 'brouwer']:
        dataset['metadata'][source]['records'] = len(dataset[source])
    dataset = enrich_attribution(dataset, references=citations)
    records = literature_claims if literature_claims is not None else json.loads((ROOT / 'data/literature_claims.json').read_text(encoding='utf-8'))
    dataset['literature_claims'] = validate_literature_claims(records, dataset['citation_metadata'])
    validate_literature_consistency(dataset)
    return dataset


def write_snapshot(dataset):
    (ROOT / 'coding_bounds_seed.json').write_text(
        json.dumps(dataset, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    outputs = [
        ('litsyn', 'litsyn_import.csv', ['n', 'd', 'k', 'N', 'lower', 'type', 'refs']),
        ('brouwer', 'brouwer_import.csv', ['n', 'd', 'lower', 'upper', 'raw']),
    ]
    for source, filename, fields in outputs:
        with (ROOT / filename).open('w', encoding='utf-8', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            for row in dataset[source]:
                writer.writerow({key: ','.join(row[key]) if key == 'refs' else row[key] for key in fields})


if __name__ == '__main__':
    snapshot = build_dataset()
    write_snapshot(snapshot)
    print(f"Imported {len(snapshot['litsyn'])} archive rows, "
          f"{len(snapshot['brouwer'])} Brouwer cells and {len(snapshot['bibliography'])} references.")
