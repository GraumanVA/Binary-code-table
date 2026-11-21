"""Load explicit author/year fields without inferring them from citation prose."""
import json
import re
import hashlib
from pathlib import Path

DATA = Path(__file__).resolve().parent / 'data'


def strip_latex_comments(text):
    """Keep escaped percent signs; discard comments before joining source lines."""
    return re.sub(r'(?<!\\)%[^\n]*', '', text)


def clean_citation(text):
    return ' '.join(strip_latex_comments(text).split())


def bibliography_metadata(bibliography, reviewed=None):
    if reviewed is None:
        reviewed = json.loads((DATA / 'citations.json').read_text(encoding='utf-8'))
    result = {}
    for key, citation in bibliography.items():
        cleaned = clean_citation(citation)
        if key not in reviewed:
            result[key] = dict(authors=[], year='', citation=cleaned, needs_review=True)
        else:
            entry = reviewed[key]
            source_hash = entry.get('source_sha256')
            changed = hashlib.sha256(cleaned.encode('utf-8')).hexdigest() != source_hash if source_hash else cleaned != clean_citation(entry['citation'])
            if changed:
                raise ValueError(f'Citation {key} changed; review data/citations.json')
            result[key] = dict(entry)
    return result


def enrich_attribution(data, references=None):
    if references is None:
        references = json.loads((DATA / 'citations.json').read_text(encoding='utf-8'))
    references = dict(references)
    for key, reference in references.items():
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]*', key) or key in {'constructor', 'prototype', '__proto__'}:
            raise ValueError('Invalid reference key')
        if not isinstance(reference, dict) or not isinstance(reference.get('authors'), list) or not reference['authors']:
            raise ValueError(f'Citation {key}: provide an authors list')
        if any(not isinstance(author, str) or not author.strip() for author in reference['authors']):
            raise ValueError(f'Citation {key}: author names must be nonempty strings')
        if not isinstance(reference.get('year'), str) or not isinstance(reference.get('citation'), str) or not reference['citation'].strip():
            raise ValueError(f'Citation {key}: provide a year string and full citation')
        if reference.get('url') and (not isinstance(reference['url'], str) or not reference['url'].startswith(('https://', 'http://'))):
            raise ValueError(f'Citation {key}: source URLs must use HTTP or HTTPS')
    references.update(bibliography_metadata(data['bibliography'], references))
    links = json.loads((DATA / 'bound_references.json').read_text(encoding='utf-8'))
    claims = {row['id']: row for row in data['brouwer']}
    bound_references = {}
    for link in links:
        claim = claims.get(link['claim_id'])
        if link['reference_id'] not in references:
            raise ValueError(f"Unknown reference: {link['reference_id']}")
        if claim and claim[link['side']] == link['value']:
            sides = bound_references.setdefault(claim['id'], {})
            sides.setdefault(link['side'], []).append(link['reference_id'])
    return dict(data, citation_metadata=references, bound_references=bound_references)
