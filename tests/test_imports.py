import json
import unittest
from pathlib import Path

from build_coding_bounds import build_dataset
from coding_bounds_attribution import strip_latex_comments
from coding_bounds_import import parse_bibliography
from coding_bounds_math import elementary_upper
from render_coding_bounds import embedded_json, prepare_payload

ROOT = Path(__file__).resolve().parents[1]


class ImportTests(unittest.TestCase):
    def test_reimport_matches_claims_and_keeps_comments_out_of_citations(self):
        data = build_dataset()
        saved = json.loads((ROOT / 'coding_bounds_seed.json').read_text(encoding='utf-8'))
        self.assertEqual(data['litsyn'], saved['litsyn'])
        self.assertEqual(data['brouwer'], saved['brouwer'])
        self.assertEqual(len(data['bibliography']), 108)
        self.assertNotIn('lits97', data['bibliography'])
        self.assertNotIn('%', data['bibliography']['shek89'])
        self.assertEqual(data['citation_metadata']['shek89']['year'], '1989')

    def test_comment_parsing_preserves_escaped_percent_and_following_entries(self):
        source = '<pre>\\bibitem{a}\nA. Author. Paper. 1989.\n%\\bibitem{bad}\n% B. Author. 1997.\n\\bibitem{b}\nB. Author. Paper. 2000.</pre>'
        refs = parse_bibliography(source)
        self.assertEqual(set(refs), {'a', 'b'})
        self.assertNotIn('1997', refs['a'])
        self.assertEqual(strip_latex_comments(r'50\% preserved % removed'), r'50\% preserved ')

    def test_json_embedding_does_not_change_citations_or_allow_end_tags(self):
        value = {'citation': 'Example </script> and <em> title'}
        encoded = embedded_json(value)
        self.assertNotIn('</script>', encoded)
        self.assertEqual(json.loads(encoded), value)

    def test_release_has_a_stable_snapshot_identifier_and_correct_entry_point(self):
        first, second = prepare_payload(), prepare_payload()
        self.assertEqual(first['metadata']['version'], second['metadata']['version'])
        release = json.loads((ROOT / 'dist/release.json').read_text())
        self.assertEqual(release['version'], first['metadata']['version'])
        page = (ROOT / 'dist/index.html').read_text(encoding='utf-8')
        self.assertIn('A(n,d) table', page)
        self.assertNotIn('id="seed"', page)
        self.assertNotIn('N. Shekhunova', page)
        self.assertLess(len(page), 15000)
        self.assertIn('id="seed"', (ROOT / 'coding_bounds.html').read_text(encoding='utf-8'))
        manifest = json.loads((ROOT / 'dist/data/manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['version'], release['version'])
        for filename in manifest['files'].values():
            document = json.loads((ROOT / 'dist/data' / filename).read_text(encoding='utf-8'))
            self.assertEqual(document['version'], release['version'])
        self.assertIn('bundle-playback.js', (ROOT / 'index.html').read_text(encoding='utf-8'))

    def test_parity_partners_share_the_tightest_available_upper_bound(self):
        for n, d in [(32, 19), (35, 21)]:
            self.assertEqual(elementary_upper(n, d), 5)
            self.assertEqual(elementary_upper(n, d), elementary_upper(n + 1, d + 1))
        self.assertEqual(elementary_upper(512, 1), 2**512)
        self.assertEqual(elementary_upper(1, 2), 1)


if __name__ == '__main__':
    unittest.main()
