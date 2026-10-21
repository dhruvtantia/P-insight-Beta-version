import sys
from pathlib import Path

import pytest

from scripts import export_dependencies


@pytest.mark.parametrize("stale", [False, True])
def test_export_check_detects_drift_without_repairing_files(tmp_path, monkeypatch, stale):
    for filename in export_dependencies.EXPORTS:
        (tmp_path / filename).write_bytes(b"reviewed export\n")
    changed = tmp_path / "requirements-lock.txt"
    if stale:
        changed.write_bytes(b"unreviewed change\n")
    before = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    commands = []

    def fake_poetry(command, *, check):
        assert check is True
        commands.append(command)
        if "export" in command:
            Path(command[command.index("--output") + 1]).write_bytes(b"reviewed export\n")

    monkeypatch.setattr(export_dependencies, "BACKEND", tmp_path)
    monkeypatch.setattr(export_dependencies.subprocess, "run", fake_poetry)
    monkeypatch.setattr(sys, "argv", ["export_dependencies.py", "--check"])
    if stale:
        with pytest.raises(SystemExit, match="1"):
            export_dependencies.main()
    else:
        export_dependencies.main()
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir()} == before
    assert commands[0][-3:] == ["check", "--lock", "--strict"]
    assert len(commands) == 1 + len(export_dependencies.EXPORTS)
