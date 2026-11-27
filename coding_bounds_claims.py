"""Validate maintainer-authored literature additions before they reach the table."""
from bisect import bisect_left
import re

from coding_bounds_math import elementary_upper


def validate_literature_claims(records, citations):
    if not isinstance(records, list):
        raise ValueError('literature_claims.json must contain a list')
    seen = set()
    for row in records:
        if not isinstance(row, dict):
            raise ValueError('Each literature claim must be an object')
        identifier = row.get('id', '')
        if not isinstance(identifier, str) or not re.fullmatch(r'PAPER-[A-Za-z0-9_.:-]+', identifier):
            raise ValueError('Literature claim IDs must start with PAPER-')
        if identifier in seen:
            raise ValueError(f'Duplicate literature claim ID: {identifier}')
        seen.add(identifier)
        for parameter in ['n', 'd']:
            if type(row.get(parameter)) is not int or not 1 <= row[parameter] <= 512:
                raise ValueError(f'{identifier}: {parameter} must be an integer from 1 to 512')
        bounds = {}
        for side in ['lower', 'upper']:
            value = row.get(side)
            if value is not None:
                if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]*', value):
                    raise ValueError(f'{identifier}: {side} must be a positive decimal string')
                bounds[side] = int(value)
        if not bounds:
            raise ValueError(f'{identifier}: supply a lower or upper bound')
        if 'lower' in bounds and 'upper' in bounds and bounds['lower'] > bounds['upper']:
            raise ValueError(f'{identifier}: lower exceeds upper')
        if row.get('active') is not False and bounds.get('lower', 1) > elementary_upper(row['n'], row['d']):
            raise ValueError(f'{identifier}: lower exceeds an elementary upper bound')
        references = row.get('references')
        if not isinstance(references, list) or not references or any(not isinstance(key, str) for key in references):
            raise ValueError(f'{identifier}: provide a nonempty references list')
        for key in references:
            if key not in citations or not citations[key].get('authors'):
                raise ValueError(f'{identifier}: unknown or incomplete citation {key}')
        if 'active' in row and type(row['active']) is not bool:
            raise ValueError(f'{identifier}: active must be true or false')
        if 'source_locator' in row and not isinstance(row['source_locator'], str):
            raise ValueError(f'{identifier}: source locator must be text')
    return records


def existing_bounds(dataset):
    """Index the atlas bounds used to check imported and maintainer-authored updates."""
    excluded = {entry['claim_id'] for entry in dataset['editorial_exclusions']}
    archive = {}
    for row in dataset['litsyn']:
        if row['id'] not in excluded:
            archive.setdefault(row['d'], []).append(row)
    for rows in archive.values():
        rows.sort(key=lambda row: row['n'])
    table = {(row['n'], row['d']): row for row in dataset['brouwer']}
    groups = {}
    for row in dataset.get('literature_claims', []):
        if row.get('active') is not False:
            pair = (row['n'], row['d']) if row['d'] % 2 else (row['n'] - 1, row['d'] - 1)
            groups.setdefault(pair, []).append(row)

    def lookup(n, d):
        if d % 2 == 0:
            n, d = n - 1, d - 1
        # The internal zero-length partner only occurs for the trivial A(1,2).
        lower = 1 if d > n else 2**n if d == 1 else 2
        upper = elementary_upper(n, d)
        eligible = archive.get(d, ())
        index = bisect_left(eligible, n, key=lambda row: row['n'])
        if index < len(eligible):
            record = eligible[index]
            divisor = 2**(record['n'] - n)
            lower = max(lower, (int(record['lower']) + divisor - 1)//divisor)
        record = table.get((n + 1, d + 1))
        if record:
            lower = max(lower, int(record['lower']))
            upper = min(upper, int(record['upper']))
        for row in groups.get((n, d), ()):
            if row.get('lower') is not None:
                lower = max(lower, int(row['lower']))
            if row.get('upper') is not None:
                upper = min(upper, int(row['upper']))
        return lower, upper

    return lookup


def validate_literature_consistency(dataset):
    """Check every update against both the other updates and imported sources."""
    lookup = existing_bounds(dataset)
    for row in dataset.get('literature_claims', []):
        if row.get('active') is False:
            continue
        n, d = row['n'], row['d']
        lower, upper = lookup(n, d)
        if lower > upper:
            raise ValueError(f"Conflicting literature updates at A({n},{d}): {lower} > {upper} ({row['id']})")
