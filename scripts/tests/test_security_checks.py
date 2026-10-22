"""Exercise real secret detection and safe failure paths using disposable Git repositories."""

import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "security_checks.py"
SPEC = importlib.util.spec_from_file_location("security_checks", MODULE)
security = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(security)


class SecretChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scanner = Path(os.environ["PINSIGHT_TEST_SCANNER"]).resolve()
        cls.token = "gh" + "p_" + hashlib.sha256(b"not-a-real-credential").hexdigest()[:36]

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pinsight-secret-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "--initial-branch=main")
        self.git("config", "user.email", "synthetic@example.invalid")
        self.git("config", "user.name", "Synthetic Check")
        self.commit("safe.txt", "synthetic public data\n")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True,
                              capture_output=True, timeout=30).stdout.decode().strip()

    def commit(self, name, content):
        (self.repo / name).write_text(content)
        self.git("add", name)
        self.git("commit", "-m", "Synthetic scanner check")

    def scan(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = security.scan(self.scanner, self.repo)
        public = output.getvalue()
        self.assertNotIn(self.token, public)
        self.assertNotIn("sensitive-file", public)
        return status, json.loads(public)

    def test_clean_full_history_passes(self):
        status, report = self.scan()
        self.assertEqual(status, 0)
        self.assertEqual(report["commits"], 1)
        self.assertEqual(report["head"], self.git("rev-parse", "HEAD"))
        self.assertEqual(report["findings"], 0)

    def test_committed_synthetic_key_fails_without_disclosure(self):
        self.commit("sensitive-file.txt", self.token)
        status, report = self.scan()
        self.assertEqual(status, 1)
        self.assertGreater(report["rules"].get("github-pat", 0), 0)

    def test_deleted_key_remains_detected_in_history(self):
        self.commit("sensitive-file.txt", self.token)
        self.git("rm", "sensitive-file.txt")
        self.git("commit", "-m", "Delete synthetic fixture")
        self.assertEqual(self.scan()[0], 1)

    def test_inline_allow_comment_cannot_hide_key(self):
        self.commit("sensitive-file.txt", self.token + " # gitleaks:allow")
        self.assertEqual(self.scan()[0], 1)

    def test_environment_cannot_replace_explicit_rules(self):
        self.commit("sensitive-file.txt", self.token)
        with patch.dict(os.environ, {"GITLEAKS_CONFIG_TOML": 'title = "empty"'}):
            self.assertEqual(self.scan()[0], 1)

    def test_repo_ignore_fingerprints_cannot_hide_key(self):
        self.commit("sensitive-file.txt", self.token)
        commit = self.git("rev-parse", "HEAD")
        self.commit(".gitleaksignore", f"{commit}:sensitive-file.txt:github-pat:1\n")
        with self.assertRaisesRegex(ValueError, "suppression"):
            self.scan()

    def test_changed_or_empty_configuration_is_rejected(self):
        config = self.root / "empty.toml"
        config.write_text('title = "empty"\n')
        with self.assertRaisesRegex(ValueError, "configuration"):
            security.scan(self.scanner, self.repo, config)

    def test_untracked_environment_is_not_read(self):
        (self.repo / ".env").write_text(self.token)
        self.assertEqual(self.scan()[0], 0)

    def test_merge_resolution_only_key_is_detected(self):
        self.git("checkout", "-b", "side")
        self.commit("conflict.txt", "side\n")
        self.git("checkout", "main")
        self.commit("conflict.txt", "main\n")
        result = subprocess.run(["git", "merge", "side"], cwd=self.repo, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.commit("conflict.txt", self.token)
        self.assertEqual(self.scan()[0], 1)

    def test_shallow_clone_is_rejected(self):
        shallow = self.root / "shallow"
        subprocess.run(["git", "clone", "--depth=1", self.repo.as_uri(), str(shallow)],
                       check=True, capture_output=True)
        with self.assertRaisesRegex(ValueError, "shallow"):
            security.scan(self.scanner, shallow)

    def test_missing_scanner_is_rejected(self):
        with self.assertRaises(OSError):
            security.scan(self.root / "missing", self.repo)

    def test_wrong_scanner_version_is_rejected(self):
        with patch.object(security, "checked", return_value=b"0.0.0"):
            with self.assertRaisesRegex(ValueError, "version"):
                security.scan(self.scanner, self.repo)

    def test_wrong_archive_digest_cannot_install_or_execute(self):
        archive = self.root / "tampered.tar.gz"
        archive.write_bytes(b"not the approved archive")
        target = self.root / "tools"
        with self.assertRaisesRegex(ValueError, "integrity"):
            security.install(target, archive)
        self.assertFalse(target.exists())

    def test_install_never_overwrites_existing_directory(self):
        with self.assertRaises(FileExistsError):
            security.install(self.root)

    def test_scanner_timeout_propagates_as_failure(self):
        with patch.object(security, "checked", side_effect=subprocess.TimeoutExpired("scanner", 1)):
            with self.assertRaises(subprocess.TimeoutExpired):
                security.scan(self.scanner, self.repo)

    def test_failed_subprocess_never_echoes_sensitive_output(self):
        with patch.object(security.subprocess, "run", return_value=subprocess.CompletedProcess(
                [], 1, stdout=self.token.encode(), stderr=self.token.encode())):
            with self.assertRaises(ValueError) as caught:
                security.checked(["unused"])
        self.assertNotIn(self.token, str(caught.exception))

    def test_invalid_inconsistent_or_error_reports_cannot_pass(self):
        cases = [(0, {}), (0, [{"RuleID": "github-pat"}]), (42, []),
                 (2, []), (-9, []), (42, [{}]), (0, "not json")]
        for code, report in cases:
            with self.subTest(code=code, report=report):
                def fake_run(command, **kwargs):
                    destination = Path(command[command.index("--report-path") + 1])
                    destination.write_text(report if isinstance(report, str) else json.dumps(report))
                    self.assertIn("--redact=100", command)
                    self.assertIn("--ignore-gitleaks-allow", command)
                    self.assertFalse(any(key.startswith("GITLEAKS_") for key in kwargs["env"]))
                    return subprocess.CompletedProcess(command, code, stdout=b"", stderr=b"")

                with patch.object(security, "checked", side_effect=[b"8.30.1", b"false", b"a" * 40, b"1"]):
                    with patch.object(security.subprocess, "run", side_effect=fake_run):
                        with self.assertRaises(ValueError):
                            security.scan(self.scanner, self.repo)


if __name__ == "__main__":
    unittest.main()
