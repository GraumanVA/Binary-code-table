"""Import the supplied archive using only Python's standard library."""
import re
from html.parser import HTMLParser
from coding_bounds_attribution import clean_citation, strip_latex_comments


class ArchiveParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.table_count = 0
        self.in_table = False
        self.in_cell = False
        self.cells = []
        self.cell = []
        self.rows = []

    def finish_cell(self):
        if self.in_cell:
            self.cells.append(' '.join(''.join(self.cell).split()))
        self.in_cell = False
        self.cell = []

    def finish_row(self):
        self.finish_cell()
        if self.in_table and self.cells:
            self.rows.append(self.cells)
        self.cells = []

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.finish_row()
            self.table_count += 1
            self.in_table = self.table_count <= 14
        elif self.in_table and tag == 'tr':
            self.finish_row()
        elif self.in_table and tag == 'td':
            self.finish_cell()
            self.in_cell = True

    def handle_endtag(self, tag):
        if tag == 'td':
            self.finish_cell()
        elif tag == 'tr':
            self.finish_row()
        elif tag == 'table':
            self.finish_row()
            self.in_table = False

    def handle_data(self, text):
        if self.in_cell:
            self.cell.append(text)


class BibliographyParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_pre = False
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag == 'pre':
            self.in_pre = True

    def handle_endtag(self, tag):
        if tag == 'pre':
            self.in_pre = False

    def handle_data(self, text):
        if self.in_pre:
            self.text.append(text)


def parse_archive(html):
    parser = ArchiveParser()
    parser.feed(html)
    parser.finish_row()
    records = []
    for cells in parser.rows:
        if len(cells) != 6:
            raise ValueError(f'Malformed archive row: {cells}')
        n, d, k, coefficient, construction, citations = cells
        if not all(re.fullmatch(r'\d+', value) for value in [n, d, k, coefficient]):
            raise ValueError(f'Noninteger archive row: {cells}')
        records.append(dict(
            id=f'LIT-{n}-{d}', n=int(n), d=int(d), k=int(k), N=coefficient,
            lower=str(int(coefficient) * 2 ** int(k)), type=construction,
            refs=[key.strip() for key in citations.strip('[]').split(',')
                  if key.strip() and key.strip() != '-'], raw_refs=citations,
        ))
    return records


def parse_bibliography(html):
    parser = BibliographyParser()
    parser.feed(html)
    # Remove comments before flattening: otherwise the next commented entry
    # becomes part of the preceding citation and contaminates its date.
    text = strip_latex_comments(''.join(parser.text))
    chunks = re.split(r'(?m)^\s*\\bibitem\{([^}]+)\}\s*', text)
    return {chunks[i]: clean_citation(chunks[i + 1]) for i in range(1, len(chunks), 2)}
