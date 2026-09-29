import unittest

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from database.models import PcrPreset, PcrPresetLabShare, PlotProject, PlotProjectShare, ProtocolTree, ProtocolTreeShare
from routers.results import shared_results_query
from routers.shared_access import shared_entities_query


class SharedResultsQueryTests(unittest.TestCase):
    def test_uses_exists_instead_of_distinct_over_json(self):
        statement = shared_results_query(Session(), user_id=7, lab_ids=[]).statement
        sql = str(statement.compile(dialect=postgresql.dialect())).upper()

        self.assertIn("EXISTS", sql)
        self.assertNotIn("SELECT DISTINCT", sql)

    def test_all_shared_document_queries_avoid_distinct_over_json(self):
        cases = (
            (ProtocolTree, ProtocolTreeShare, ProtocolTreeShare.protocol_tree_id),
            (PlotProject, PlotProjectShare, PlotProjectShare.plot_project_id),
            (PcrPreset, PcrPresetLabShare, PcrPresetLabShare.preset_id),
        )
        for entity, share, foreign_key in cases:
            with self.subTest(entity=entity.__name__):
                statement = shared_entities_query(
                    Session(), entity, share, foreign_key, user_id=7, lab_ids=[]
                ).statement
                sql = str(statement.compile(dialect=postgresql.dialect())).upper()
                self.assertIn("EXISTS", sql)
                self.assertNotIn("SELECT DISTINCT", sql)


if __name__ == "__main__":
    unittest.main()
