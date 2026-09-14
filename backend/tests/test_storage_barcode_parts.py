"""Pure barcode calculation tests without starting the API/database."""
import ast
from pathlib import Path
import re
import unittest


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


if __name__ == '__main__':
    unittest.main()
