import copy
import io
import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from atlas.updates import apply_update_file, validate_update_bundle
from atlas.distribution import source_files, write_archive
from atlas.render import prepare_payload

ROOT = Path(__file__).resolve().parents[1]


class UpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = prepare_payload()

    def bundle(self):
        return dict(format='a-nd-update', schema_version=1, base_version=self.dataset['metadata']['version'],
                    files={'data/citations.json': copy.deepcopy(self.dataset['citation_metadata']),
                           'data/literature_claims.json': []})

    def patch_bundle(self, *, citations=None, claims=None):
        return dict(format='a-nd-update', schema_version=2, base_version='an-older-snapshot',
                    changes={'citations': citations or [], 'claims': claims or []})

    def test_reviewed_reference_and_literature_updates_validate_together(self):
        bundle = self.bundle()
        bundle['files']['data/citations.json']['shek89']['citation'] = 'Corrected citation display.'
        bundle['files']['data/literature_claims.json'] = [dict(
            id='PAPER-TEST-17-3', n=17, d=3, lower='6144', references=['milshtein2026'], source_locator='Abstract')]
        self.assertEqual(validate_update_bundle(bundle), bundle['files'])

    def test_invalid_or_stale_bundles_fail_before_applying(self):
        bad = []
        stale = self.bundle()
        stale['base_version'] = 'old'
        bad.append(stale)
        foreign = self.bundle()
        foreign['files']['../index.html'] = 'not allowed'
        bad.append(foreign)
        for replacement in [None, {}, dict(authors=['Author'], year='2026', citation='No fingerprint')]:
            altered = self.bundle()
            altered['files']['data/citations.json']['shek89'] = replacement
            bad.append(altered)
        conflict = self.bundle()
        conflict['files']['data/literature_claims.json'] = [dict(
            id='PAPER-TEST-18-4', n=18, d=4, upper='6000', references=['milshtein2026'])]
        bad.append(conflict)
        for bundle in bad:
            with self.subTest(bundle_type=bundle.get('base_version')), self.assertRaises(ValueError):
                validate_update_bundle(bundle)

    def test_apply_writes_only_validated_source_files(self):
        # Use an ordinary project directory: some managed Windows environments
        # cannot read the mode-700 folders created by TemporaryDirectory.
        folder = ROOT / ('.test-output-' + uuid.uuid4().hex)
        folder.mkdir()
        (folder / 'data').mkdir()
        try:
            for name in ['citations.json', 'literature_claims.json']:
                (folder / 'data' / name).write_bytes((ROOT / 'data' / name).read_bytes())
            filename = folder / 'update.json'
            bundle = self.bundle()
            bundle['files']['data/citations.json']['shek89']['citation'] = 'Corrected citation display.'
            filename.write_text(json.dumps(bundle), encoding='utf-8')
            with patch('atlas.updates.ROOT', folder):
                apply_update_file(filename)
            self.assertEqual(json.loads((folder / 'data/citations.json').read_text(encoding='utf-8')),
                             bundle['files']['data/citations.json'])
            self.assertEqual(json.loads((folder / 'data/literature_claims.json').read_text(encoding='utf-8')), [])
            self.assertEqual(sorted(path.name for path in (folder / 'data').iterdir()), ['citations.json', 'literature_claims.json'])
            bundle['base_version'] = 'old'
            filename.write_text(json.dumps(bundle), encoding='utf-8')
            before = (folder / 'data/citations.json').read_bytes()
            with patch('atlas.updates.ROOT', folder), self.assertRaises(ValueError):
                apply_update_file(filename)
            self.assertEqual((folder / 'data/citations.json').read_bytes(), before)
        finally:
            # Remove only the known files in the directory created by this test.
            for name in ['citations.json', 'literature_claims.json', 'citations.json.pending', 'literature_claims.json.pending']:
                (folder / 'data' / name).unlink(missing_ok=True)
            (folder / 'update.json').unlink(missing_ok=True)
            (folder / 'data').rmdir()
            folder.rmdir()

    def test_patch_merges_older_reviewed_updates_and_can_be_reapplied(self):
        old = self.dataset['citation_metadata']['shek89']
        corrected = dict(old, citation='Corrected citation display.')
        claim = dict(id='PAPER-TEST-17-3', n=17, d=3, lower='6144',
                     references=['milshtein2026'], source_locator='Abstract')
        bundle = self.patch_bundle(
            citations=[dict(key='shek89', before=old, after=corrected)],
            claims=[dict(key=claim['id'], before=None, after=claim)])
        folder = ROOT / ('.test-output-' + uuid.uuid4().hex)
        folder.mkdir()
        (folder / 'data').mkdir()
        references = folder / 'data/citations.json'
        claims = folder / 'data/literature_claims.json'
        filename = folder / 'update.json'
        try:
            citations = copy.deepcopy(self.dataset['citation_metadata'])
            citations['etzi00']['citation'] = 'An unrelated edit.'
            references.write_text(json.dumps(citations), encoding='utf-8')
            claims.write_text('[]', encoding='utf-8')
            filename.write_text(json.dumps(bundle), encoding='utf-8')
            with patch('atlas.updates.ROOT', folder):
                applied = apply_update_file(filename)
                self.assertEqual(applied['literature_claims'], [claim])
                self.assertEqual(applied['citation_metadata']['shek89'], corrected)
                self.assertEqual(applied['citation_metadata']['etzi00']['citation'], 'An unrelated edit.')
                unchanged = references.read_bytes()
                claims.write_text(json.dumps([claim]), encoding='utf-8')
                original_claims = claims.read_bytes()
                apply_update_file(filename)
                self.assertEqual(references.read_bytes(), unchanged)
                self.assertEqual(claims.read_bytes(), original_claims)
        finally:
            for path in (references, claims, filename):
                path.unlink(missing_ok=True)
            (folder / 'data').rmdir()
            folder.rmdir()

    def test_patch_rejects_same_record_conflicts_and_malformed_changes(self):
        old = self.dataset['citation_metadata']['shek89']
        new = dict(old, citation='Corrected citation display.')
        edit = dict(key='shek89', before=old, after=new)
        conflict = dict(edit, before=dict(old, citation='Another version.'))
        with self.assertRaisesRegex(ValueError, 'citations.shek89'):
            validate_update_bundle(self.patch_bundle(citations=[conflict]))
        with self.assertRaisesRegex(ValueError, 'duplicate citations'):
            validate_update_bundle(self.patch_bundle(citations=[edit, edit]))
        invalid = dict(key='PAPER-TEST', before=None, after=dict(id='PAPER-OTHER-ID'))
        with self.assertRaisesRegex(ValueError, 'Invalid claims'):
            validate_update_bundle(self.patch_bundle(claims=[invalid]))
        with self.assertRaisesRegex(ValueError, 'original archive fingerprint'):
            validate_update_bundle(self.patch_bundle(citations=[dict(edit, after=None)]))


class PackageTests(unittest.TestCase):
    def test_source_package_is_reproducible_and_contains_the_complete_build_inputs(self):
        first, second = io.BytesIO(), io.BytesIO()
        write_archive(first, source_files(), ROOT)
        write_archive(second, source_files(), ROOT)
        self.assertEqual(first.getvalue(), second.getvalue())
        with ZipFile(first) as archive:
            names = archive.namelist()
            for required in ['README.md', 'NOTICE.md', 'docs/PUBLISHING.md', 'docs/MAINTENANCE.md',
                             'data/sources/index.html', 'data/sources/refs.html',
                             'data/sources/grassl_binary.csv', 'data/sources/grassl_snapshot.json',
                             'atlas/__main__.py', 'atlas/render.py', 'atlas/updates.py',
                             'atlas/grassl.py', 'data/citations.json', 'data/grassl_references.json',
                             'data/literature_claims.json', 'src/editor.js', '.github/workflows/pages.yml']:
                self.assertIn(required, names)
            self.assertFalse(any('__pycache__' in name or name.startswith(('build/', 'dist/', 'release/')) for name in names))
            self.assertNotIn('coding_bounds_seed.json', names)
            self.assertNotIn('coding_bounds.html', names)

    def test_site_package_contains_the_editor_and_no_stale_generated_versions(self):
        output = io.BytesIO()
        write_archive(output, [path for path in (ROOT / 'dist').rglob('*') if path.is_file()], ROOT / 'dist')
        with ZipFile(output) as archive:
            names = archive.namelist()
            self.assertIn('index.html', names)
            self.assertIn('editor.html', names)
            self.assertIn('.nojekyll', names)
            version = json.loads(archive.read('release.json'))['version']
            for name in names:
                if name.startswith('data/') and name != 'data/manifest.json':
                    self.assertIn(version, name)
            for name in ['index.html', 'editor.html']:
                page = archive.read(name).decode('utf-8')
                self.assertNotIn('__EDITOR_CONFIG__', page)
                self.assertNotIn('Example: a newer lower bound', page)


if __name__ == '__main__':
    unittest.main()
