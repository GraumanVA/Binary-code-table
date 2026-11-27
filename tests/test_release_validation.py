import unittest
from fractions import Fraction
from math import floor

from atlas.claims import existing_bounds
from atlas.math import elementary_upper, hamming_upper, johnson_trace, johnson_upper
from atlas.validation import validate_dataset


def release_fixture(**sources):
    return dict({'litsyn': [], 'brouwer': [], 'grassl': [], 'literature_claims': [],
                 'editorial_exclusions': [], 'citation_metadata': {}}, **sources)


class ReleaseValidationTests(unittest.TestCase):
    def test_snapshot_refresh_accepts_new_lengths_and_distances(self):
        dataset = release_fixture(brouwer=[dict(n=100, d=30, lower='32', upper='512')])
        report = validate_dataset(dataset)
        self.assertIn('Parameter pairs with source records: 1', report)
        self.assertIn('Conflicting bounds: 0', report)

    def test_detects_conflict_created_by_padding_at_high_distance(self):
        dataset = release_fixture(
            grassl=[dict(n=100, d=31, code_n=100, k=10, code_d=31)],
            brouwer=[dict(n=102, d=32, lower='2', upper='512')],
        )
        with self.assertRaisesRegex(ValueError, r'A\(101,31\): 1024 > 512'):
            validate_dataset(dataset)

    def test_reports_duplicate_parameters_with_the_source(self):
        row = dict(n=102, d=32, lower='2', upper='512')
        with self.assertRaisesRegex(ValueError, r'Duplicate Brouwer entry at A\(102,32\)'):
            validate_dataset(release_fixture(brouwer=[row, row]))


class HistoricalBoundsTests(unittest.TestCase):
    def test_historical_archive_cases_use_a_fixed_fixture(self):
        archive = [
            dict(id='LIT-17-3', n=17, d=3, k=6, N='83', lower='5312', refs=[]),
            dict(id='LIT-32-19', n=32, d=19, k=1, N='4', lower='8', refs=[]),
            dict(id='LIT-35-21', n=35, d=21, k=1, N='4', lower='8', refs=[]),
        ]
        dataset = release_fixture(litsyn=archive, brouwer=[dict(n=18, d=4, lower='6144', upper='6551')],
                                  editorial_exclusions=[dict(claim_id=row['id'], reason='Erroneous lower bound')
                                                        for row in archive[1:]])
        validate_dataset(dataset)
        lookup = existing_bounds(dataset)
        self.assertEqual(lookup(17, 3), (6144, 6551))
        for n, d in [(32, 19), (33, 20), (35, 21), (36, 22)]:
            self.assertEqual(lookup(n, d), (2, 5))

    def test_johnson_formula_uses_an_exact_rational_denominator(self):
        self.assertEqual(hamming_upper(13, 5), 89)
        self.assertEqual(hamming_upper(12, 5), 51)
        for n, d, expected in [(13, 5, 77), (12, 5, 47), (29, 5, 1230101), (30, 6, 1230101),
                               (7, 3, 16), (15, 3, 2048), (23, 7, 4096), (24, 8, 4096)]:
            with self.subTest(n=n, d=d):
                trace = johnson_trace(n, d)
                denominator = trace['volume'] + Fraction(trace['delta'], trace['q'])
                self.assertEqual(johnson_upper(n, d), floor(Fraction(2**trace['N']) / denominator))
                self.assertEqual(johnson_upper(n, d), expected)
        self.assertEqual(elementary_upper(1, 2), 1)
        self.assertEqual(elementary_upper(512, 1), 2**512)


if __name__ == '__main__':
    unittest.main()
