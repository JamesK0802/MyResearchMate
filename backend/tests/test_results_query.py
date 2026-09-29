import unittest

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from routers.results import shared_results_query


class SharedResultsQueryTests(unittest.TestCase):
    def test_uses_exists_instead_of_distinct_over_json(self):
        statement = shared_results_query(Session(), user_id=7, lab_ids=[]).statement
        sql = str(statement.compile(dialect=postgresql.dialect())).upper()

        self.assertIn("EXISTS", sql)
        self.assertNotIn("SELECT DISTINCT", sql)


if __name__ == "__main__":
    unittest.main()
