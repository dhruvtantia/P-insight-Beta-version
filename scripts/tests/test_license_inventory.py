"""Synthetic coverage, metadata and output tests; no real account or application data."""

import contextlib
from email.message import Message
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "license_inventory.py"
SPEC = importlib.util.spec_from_file_location("license_inventory", MODULE)
inventory = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(inventory)


class Distribution:
    def __init__(self, name="example", version="1.0", fields=()):
        self.metadata = Message()
        self.metadata["Name"] = name
        self.metadata["Version"] = version
        self.version = version
        for key, value in fields:
            self.metadata[key] = value

    def read_text(self, name):
        assert name == "METADATA"
        return self.metadata.as_string()


def requirement(text):
    return text + " \\\n    --hash=sha256:" + "a" * 64 + "\n"


class LicenseInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pinsight-license-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / ".python-version").write_text(inventory.platform.python_version() + "\n")
        self.backend = self.root / "backend"
        self.backend.mkdir()
        self.lock = ('[[package]]\nname="example"\nversion="1.0"\ngroups=["main"]\n'
                     '[[package]]\nname="pip"\nversion="26.2.2"\ngroups=["build"]\n'
                     '[[package]]\nname="windows-only"\nversion="2.0"\ngroups=["main"]\n')
        (self.backend / "poetry.lock").write_text(self.lock)
        (self.backend / "requirements-bootstrap.txt").write_text(requirement("pip==26.2.2"))
        content = requirement("example==1.0") + requirement('windows-only==2.0; sys_platform == "never"')
        (self.backend / "requirements-lock.txt").write_text(content)
        self.distributions = [Distribution(fields=[("License-Expression", "mit")]),
                              Distribution("pip", "26.2.2", [("License", "MIT")])]

    def collect(self, distributions=None):
        return inventory.python_inventory(self.root, "runtime",
                                          self.distributions if distributions is None else distributions)

    def test_clean_inventory_retains_every_locked_identity_and_review_requirement(self):
        report = self.collect()
        self.assertEqual(report["summary"]["lockedIdentities"], 3)
        self.assertEqual(report["summary"]["installedIdentities"], 2)
        self.assertEqual(report["summary"]["outsideSelectedEnvironment"], 1)
        self.assertEqual(report["licenseReviewStatus"], "required")
        self.assertTrue(all(row["reviewStatus"] == "required" for row in report["records"]))
        self.assertNotIn(str(self.root), json.dumps(report))

    def test_output_is_deterministic_without_environment_paths_or_timestamps(self):
        self.assertEqual(self.collect(), self.collect(list(reversed(self.distributions))))

    def test_environment_drift_missing_wrong_version_extra_and_duplicate_fail(self):
        cases = [self.distributions[:1], [Distribution(version="2.0"), self.distributions[1]],
                 self.distributions + [Distribution("unexpected")], self.distributions * 2]
        for distributions in cases:
            with self.subTest(distributions=distributions):
                with self.assertRaises(ValueError):
                    self.collect(distributions)

    def test_export_identity_missing_from_lock_fails(self):
        (self.backend / "requirements-lock.txt").write_text(requirement("extra==1.0"))
        with self.assertRaises(ValueError):
            self.collect()

    def test_wrong_python_target_and_empty_selected_export_fail(self):
        (self.root / ".python-version").write_text("0.0.0\n")
        with self.assertRaises(ValueError):
            self.collect()
        (self.root / ".python-version").write_text(inventory.platform.python_version())
        (self.backend / "requirements-lock.txt").write_text("# empty\n")
        with self.assertRaises(ValueError):
            self.collect()

    def test_empty_or_duplicate_lock_fails(self):
        for content in ('package=[]\n', self.lock + '[[package]]\nname="example"\nversion="1.0"\ngroups=[]\n'):
            with self.subTest(content=content):
                (self.backend / "poetry.lock").write_text(content)
                with self.assertRaises(ValueError):
                    self.collect()

    def test_export_markers_use_selected_environment(self):
        export = requirement('Windows_Only==2.0; sys_platform == "win32"')
        self.assertEqual(inventory.export_identities(export, {"sys_platform": "win32"}),
                         {("windows-only", "2.0")})
        self.assertEqual(inventory.export_identities(export, {"sys_platform": "linux"}), set())

    def test_unpinned_wildcard_url_and_unhashed_or_bad_hash_exports_fail(self):
        cases = [requirement("example>=1.0"), requirement("example==1.*"),
                 requirement("example @ https://example.invalid/example.whl"), "example==1.0\n",
                 "--hash=sha256:" + "a" * 64, requirement("example==1.0").replace("a" * 64, "bad")]
        for export in cases:
            with self.subTest(export=export):
                with self.assertRaises(ValueError):
                    inventory.export_identities(export)

    def test_spdx_parser_preserves_boolean_expression_without_approval(self):
        metadata = inventory.license_metadata(Distribution(fields=[
            ("License-Expression", "mit and (apache-2.0 or bsd-2-clause)"),
        ]))
        self.assertEqual(metadata["expression"], "MIT AND (Apache-2.0 OR BSD-2-Clause)")
        self.assertEqual(metadata["reviewStatus"], "required")

    def test_legacy_classifiers_missing_invalid_and_conflicts_remain_distinct(self):
        cases = [([], "missing"), ([("Classifier", "License :: OSI Approved :: MIT License")], "classifiers-only"),
                 ([("License", "MIT")], "legacy-spdx-shaped"), ([("License", "long license prose")], "legacy-text"),
                 ([("License-Expression", "not-a-license")], "invalid-expression"),
                 ([("License-Expression", "MIT"), ("License", "BSD-3-Clause")], "conflicting-fields")]
        for fields, expected in cases:
            with self.subTest(expected=expected):
                row = inventory.license_metadata(Distribution(fields=fields))
                self.assertEqual(row["metadataStatus"], expected)
                self.assertEqual(row["reviewStatus"], "required")
                self.assertNotIn("long license prose", json.dumps(row))

    def test_metadata_is_hashed_not_copied_and_declarations_are_not_file_verification(self):
        distribution = Distribution(fields=[("License", "private-looking prose"),
                                              ("License-File", "/do/not/read/anything")])
        row = inventory.license_metadata(distribution)
        self.assertEqual(row["licenseFileDeclarations"], 1)
        self.assertNotIn("private-looking", json.dumps(row))
        self.assertNotIn("/do/not/read", json.dumps(row))
        self.assertEqual(row["metadataSha256"], inventory.digest(distribution.read_text("METADATA").encode()))

    def test_missing_metadata_fails(self):
        with patch.object(self.distributions[0], "read_text", return_value=None):
            with self.assertRaises(ValueError):
                self.collect()

    def test_report_is_exclusive_and_never_replaces_existing_file(self):
        output = self.root / "report.json"
        inventory.write_report(self.collect(), output)
        before = output.read_bytes()
        with self.assertRaises(FileExistsError):
            inventory.write_report({}, output)
        self.assertEqual(before, output.read_bytes())

    def test_cli_errors_are_failure_without_leaking_diagnostic_values(self):
        with patch("sys.argv", ["inventory", "--environment", "runtime", "--output", "unused"]):
            with patch.object(inventory, "python_inventory", side_effect=ValueError("private-looking diagnostic")):
                error = io.StringIO()
                with contextlib.redirect_stderr(error):
                    self.assertEqual(inventory.main(), 1)
                self.assertNotIn("private-looking", error.getvalue())


if __name__ == "__main__":
    unittest.main()
