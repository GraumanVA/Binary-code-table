import copy
import unittest
from unittest.mock import patch

from build_coding_bounds import build_dataset
from coding_bounds_claims import validate_literature_claims, validate_literature_consistency
from coding_bounds_attribution import bibliography_metadata


class MaintenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = build_dataset()

    def claim(self, **changes):
        row = dict(id='PAPER-MIL2026-17-3', n=17, d=3, lower='6144',
                   references=['milshtein2026'], source_locator='arXiv:2610.23626')
        row.update(changes)
        return row

    def test_new_bound_uses_existing_citation_without_editing_the_archive(self):
        data = copy.deepcopy(self.dataset)
        data['literature_claims'] = [self.claim()]
        validate_literature_claims(data['literature_claims'], data['citation_metadata'])
        validate_literature_consistency(data)
        self.assertEqual(len(data['litsyn']), 1014)

    def test_invalid_inputs_and_unknown_references_are_rejected(self):
        for changes in [dict(lower=6144), dict(lower='-1'), dict(n=513), dict(n=True),
                        dict(references=['missing']), dict(id='not-a-paper'), dict(lower='999999')]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_literature_claims([self.claim(**changes)], self.dataset['citation_metadata'])
        with self.assertRaises(ValueError):
            validate_literature_claims([self.claim(), self.claim()], self.dataset['citation_metadata'])

    def test_contradictions_are_caught_before_publishing(self):
        for row in [self.claim(lower=None, upper='6000'), self.claim(n=35, d=21, lower='6')]:
            data = dict(self.dataset, literature_claims=[row])
            with self.assertRaises(ValueError):
                validate_literature_consistency(data)

    def test_disabled_historical_claim_can_be_retained_without_affecting_results(self):
        data = dict(self.dataset, literature_claims=[self.claim(lower='999999', active=False)])
        validate_literature_claims(data['literature_claims'], data['citation_metadata'])
        validate_literature_consistency(data)

    def test_citation_text_can_be_corrected_without_editing_the_raw_archive(self):
        reviewed = copy.deepcopy(self.dataset['citation_metadata'])
        reviewed['shek89']['citation'] += ' Editorial clarification.'
        with patch('coding_bounds_attribution.json.loads', return_value=reviewed):
            metadata = bibliography_metadata(self.dataset['bibliography'])
            self.assertTrue(metadata['shek89']['citation'].endswith('Editorial clarification.'))
            changed_archive = dict(self.dataset['bibliography'])
            changed_archive['shek89'] += ' Unexpected archive change.'
            with self.assertRaises(ValueError):
                bibliography_metadata(changed_archive)


if __name__ == '__main__':
    unittest.main()
