from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from uuid import uuid4

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / 'migrations'
    / 'versions'
    / '104_add_mcp_config_to_org_member.py'
)


spec = spec_from_file_location(
    'migration_104_add_mcp_config_to_org_member', MIGRATION_PATH
)
assert spec is not None and spec.loader is not None
migration = module_from_spec(spec)
spec.loader.exec_module(migration)


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _FakeConnection:
    def __init__(self, rows):
        self.rows = rows
        self.select_statements: list[object] = []
        self.calls: list[tuple[object, dict]] = []

    def execute(self, statement, params=None):
        if params is None:
            self.select_statements.append(statement)
            return _FakeResult(self.rows)
        self.calls.append((statement, params))
        return None


def test_upgrade_preserves_uuid_type_for_org_member_backfill(monkeypatch):
    org_id = uuid4()
    conn = _FakeConnection([(org_id, {'server': 'http://example.com'})])

    monkeypatch.setattr(migration.op, 'add_column', lambda *args, **kwargs: None)
    monkeypatch.setattr(migration.op, 'get_bind', lambda: conn)

    migration.upgrade()

    assert len(conn.select_statements) == 1
    assert "agent_settings -> 'mcp_config'" in str(conn.select_statements[0])
    assert len(conn.calls) == 1
    statement, params = conn.calls[0]
    assert (
        str(statement)
        == 'UPDATE org_member SET mcp_config = :config WHERE org_id = :org_id'
    )
    assert params == {'config': {'server': 'http://example.com'}, 'org_id': org_id}
