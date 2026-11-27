"""Check the release dataset and all parameter pairs reached by its sources."""

from pathlib import Path

from .claims import existing_bounds, odd_pair


MAX_PARAMETER = 512


def validate_source_rows(rows, source):
    """Check source-level invariants without pinning a particular snapshot."""
    parameters = set()
    for row in rows:
        n, d = row['n'], row['d']
        if type(n) is not int or type(d) is not int or not (1 <= n <= MAX_PARAMETER and 1 <= d <= MAX_PARAMETER):
            raise ValueError(f'{source} parameters must be integers from 1 to {MAX_PARAMETER}: ({n}, {d})')
        if (n, d) in parameters:
            raise ValueError(f'Duplicate {source} entry at A({n},{d})')
        parameters.add((n, d))
        if source == 'Litsyn':
            if not (3 <= d <= n and d % 2 and 0 <= row['k'] <= n
                    and int(row['N']) > 0 and int(row['lower']) == int(row['N']) * 2**row['k']):
                raise ValueError(f'Invalid Litsyn construction at A({n},{d})')
        elif d % 2 or not 1 <= int(row['lower']) <= int(row['upper']):
            raise ValueError(f'Invalid Brouwer bounds at A({n},{d})')


def validate_dataset(dataset):
    """Return a release report or raise a descriptive consistency error."""
    archive = dataset['litsyn']
    brouwer = dataset['brouwer']
    grassl = dataset.get('grassl', [])
    literature = [row for row in dataset.get('literature_claims', []) if row.get('active') is not False]
    validate_source_rows(archive, 'Litsyn')
    validate_source_rows(brouwer, 'Brouwer')

    archive_ids = {row['id'] for row in archive}
    exclusions = {}
    for entry in dataset['editorial_exclusions']:
        identifier = entry['claim_id']
        reason = entry.get('reason')
        if identifier not in archive_ids or identifier in exclusions or not isinstance(reason, str) or not reason.strip():
            raise ValueError(f'Invalid editorial exclusion for {identifier}')
        exclusions[identifier] = reason

    eligible_archive = [row for row in archive if row['id'] not in exclusions]
    citations = dataset['citation_metadata']
    bibliographic_keys = {key for row in eligible_archive for key in row['refs']}
    missing = sorted(key for key in bibliographic_keys if key not in citations or not citations[key].get('authors'))
    if missing:
        raise ValueError(f'Missing or unreviewed Litsyn citations: {", ".join(missing)}')

    sources = [*eligible_archive, *brouwer, *grassl, *literature]
    source_pairs = {odd_pair(row['n'], row['d']) for row in sources}
    distances = {d for _, d in source_pairs}
    # Every sourced distance can inherit a lower bound at a longer length.
    # Retain explicitly sourced cells with d > n as well, including A(1,2).
    checked_pairs = source_pairs | {(n, d) for d in distances for n in range(d, MAX_PARAMETER + 1)}
    lookup = existing_bounds(dataset)
    for n, d in sorted(checked_pairs, key=lambda pair: (pair[1], pair[0])):
        lower, upper = lookup(n, d)
        if lower > upper:
            shown_n, shown_d = (n, d) if n else (1, 2)
            raise ValueError(f'Conflicting bounds at A({shown_n},{shown_d}): {lower} > {upper}')

    lines = [
        'A(n,d) Atlas | Release validation',
        f'Litsyn source rows: {len(archive)}',
        f'Excluded Litsyn rows: {len(exclusions)}',
        f'Brouwer source rows: {len(brouwer)}',
        f'Grassl source pairs: {len(grassl)}',
        f'Active literature updates: {len(literature)}',
        f'Parameter pairs with source records: {len(source_pairs)}',
        f'Parameter pairs checked, including derived bounds at sourced distances: {len(checked_pairs)}',
        'Equivalent odd/even pairs are counted once.',
        'Conflicting bounds: 0',
        '',
        'Editorial exclusions:',
        *[f'  {identifier}: {reason}' for identifier, reason in exclusions.items()],
        '',
        'Validation checks internal consistency and does not verify cited constructions.',
    ]
    return '\n'.join(lines) + '\n'


def write_report(report: str, output_directory: Path) -> Path:
    output_directory.mkdir(parents=True, exist_ok=True)
    path = output_directory / 'coding_bounds_validation.txt'
    path.write_text(report, encoding='utf-8')
    return path
