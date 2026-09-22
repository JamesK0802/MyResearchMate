"""Pure barcode calculation tests without starting the API/database."""
import ast
from pathlib import Path
import re
import unittest
from typing import Optional


class TestHttpError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class BarcodePartsTest(unittest.TestCase):
    def test_variable_length_pieces(self):
        source = Path(__file__).parents[1] / 'routers' / 'lab_archive.py'
        tree = ast.parse(source.read_text())
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name == '_storage_part']
        namespace = {'re': re}
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), namespace)
        evaluate = namespace['_storage_part']
        for barcode, cabinet in [('AD12', '1'), ('ad432', '43')]:
            self.assertEqual(evaluate(barcode, {'type':'characters', 'start':1, 'end':2,
                'mappings':[{'from':'AD','to':'Admin room'}]}), 'Admin room')
            self.assertEqual(evaluate(barcode, {'type':'digits_after', 'value':'AD',
                'trimEnd':1, 'prefix':'Cabinet '}), 'Cabinet ' + cabinet)
            self.assertEqual(evaluate(barcode, {'type':'characters_from_end',
                'start':1, 'end':1, 'prefix':'Layer '}), 'Layer 2')
        self.assertEqual(evaluate('AD', {'type':'digits_after','value':'AD','prefix':'Cabinet '}), '')

    def test_overlapping_rules_must_return_the_same_location(self):
        source = Path(__file__).parents[1] / 'routers' / 'lab_archive.py'
        tree = ast.parse(source.read_text())
        wanted = {'_rule_matches', '_storage_part', 'calculate_storage_location'}
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in wanted]
        namespace = {'re': re, 'Optional': Optional, 'HTTPException': TestHttpError}
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), namespace)
        calculate = namespace['calculate_storage_location']
        make_rule = lambda name, mode, match, value: {
            'id': name, 'name': name, 'enabled': True,
            'match': {'type': mode, 'value': match},
            'parts': [{'type': 'text', 'value': value}],
        }
        self.assertEqual(calculate('ADS572', [
            make_rule('AD rule', 'starts_with', 'AD', 'Admin Room'),
            make_rule('S rule', 'contains', 'S', 'Admin Room'),
        ]), 'Admin Room')
        with self.assertRaisesRegex(TestHttpError, 'Conflicting location rules'):
            calculate('ADS572', [
                make_rule('AD rule', 'starts_with', 'AD', 'Admin Room'),
                make_rule('S rule', 'contains', 'S', 'South Room'),
            ])


if __name__ == '__main__':
    unittest.main()
