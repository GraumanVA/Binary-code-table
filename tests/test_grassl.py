import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from atlas.grassl import METADATA_FILE, SOURCE_FILE, import_snapshot, load_source, select_witnesses


class GrasslSourceTests(unittest.TestCase):
    def test_selection_uses_constructions_and_the_even_distance_partner(self):
        cells = {(6, 3): (3, 4, True), (6, 4): (3, 3, False), (7, 5): (4, 5, True)}
        matches = {(row['n'], row['d']): row for row in select_witnesses(cells)}
        self.assertEqual(matches[(6, 3)], dict(n=6, d=3, code_n=7, k=5, code_d=4))
        self.assertEqual(matches[(7, 3)], dict(n=7, d=3, code_n=7, k=5, code_d=4))

    def test_import_preserves_all_cells_and_verifies_capture(self):
        directory = Path(__file__).resolve().parents[1] / f'.test-output-{uuid.uuid4().hex}'
        directory.mkdir()
        html = directory / 'capture.html'
        html.write_text('''<table>
          <tr><td><a href="BKLC.php?q=2&amp;n=1&amp;k=1">1</a></td></tr>
          <tr><td bgcolor="#FFA0A0"><a href="BKLC.php?k=1&amp;n=2&amp;q=2">1-2</a></td>
              <td><a href="BKLC.php?q=2&amp;n=2&amp;k=2">1</a></td></tr>
        </table>''', encoding='utf-8')
        try:
            with patch('atlas.grassl.MAX_LENGTH', 2):
                self.assertEqual(import_snapshot(html, directory, '2026-11-27'), 3)
                metadata = json.loads((directory / METADATA_FILE).read_bytes())
                self.assertEqual(metadata['snapshot_kind'], 'complete')
                self.assertEqual(metadata['date'], '2026-11-27')
                data = dict(metadata={'grassl': {}}, litsyn=[], brouwer=[], editorial_exclusions=[])
                self.assertEqual(load_source(directory, data), [])
                self.assertEqual(data['metadata']['grassl']['source_cells'], 3)
                csv_file = directory / SOURCE_FILE
                self.assertIn(b'2,1,1,2,0\n', csv_file.read_bytes())
                csv_file.write_bytes(csv_file.read_bytes() + b'\n')
                with self.assertRaisesRegex(ValueError, 'SHA-256'):
                    load_source(directory, data)
        finally:
            for path in (html, directory / METADATA_FILE, directory / SOURCE_FILE):
                path.unlink(missing_ok=True)
            directory.rmdir()
