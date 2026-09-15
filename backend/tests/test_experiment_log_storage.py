"""Test the storage update without requiring a running database or auth service."""
import ast
import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest


class ExperimentLogStorageTest(unittest.TestCase):
    def test_run_memo_survives_disk_round_trip_without_changing_snapshot(self):
        source = Path(__file__).parents[1] / 'routers' / 'lab_notebook.py'
        node = next(n for n in ast.parse(source.read_text()).body
                    if isinstance(n, ast.AsyncFunctionDef) and n.name == 'update_experiment')
        node.decorator_list = []
        node.args.defaults = []
        for arg in node.args.args:
            arg.annotation = None
        with TemporaryDirectory() as folder:
            target = Path(folder) / 'run.json'
            snapshot = [{'id':'step', 'title':'Original protocol', 'instructions':['Original instruction']}]
            target.write_text(json.dumps({'id':'run', 'steps':snapshot}))
            fields = dict.fromkeys(['title','description','samples','tags','steps','protocol_tree_id',
                'protocol_title','protocol_root_id','protocol_root_name','protocol_snapshot_updated_at','run_notes'])
            fields['run_memos'] = [{'id':'memo','text':'Observed change','created_at':'2026-09-15'}]
            scope = {'json':json, 'EXP_ACTIVE_DIR':folder, 'now_iso':lambda:'2026-09-15',
                'get_experiment_file_and_owner':lambda *args:(target,'owner')}
            exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),'exec'),scope)
            asyncio.run(scope['update_experiment']('run',SimpleNamespace(**fields),None,{'id':'owner'}))
            saved = json.loads(target.read_text())
            self.assertEqual(saved['run_memos'],fields['run_memos'])
            self.assertEqual(saved['steps'],snapshot)


if __name__ == '__main__':
    unittest.main()
