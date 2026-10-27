"""Small synthetic archives only; never fetch, install or execute package code."""

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import tomllib
import unittest
from unittest.mock import patch
import warnings
import zipfile

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("license_artifact_evidence", SCRIPTS / "license_artifact_evidence.py")
evidence = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evidence)


class ArtifactEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pinsight-license-archive-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.artifact = self.root / "example-1.0-py3-none-any.whl"
        self.lock = self.root / "poetry.lock"

    def archive(self, members=None):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.artifact, "w") as archive:
                for name, content in (members or [("example-1.0.dist-info/licenses/LICENSE", b"Example license")]):
                    archive.writestr(name, content)
        self.lock_artifact()

    def lock_artifact(self):
        digest = hashlib.sha256(self.artifact.read_bytes()).hexdigest()
        self.lock.write_text('[[package]]\nname="example"\nversion="1.0"\ngroups=["main"]\n'
                             f'files=[{{file="{self.artifact.name}",hash="sha256:{digest}"}}]\n')

    def collect(self):
        return evidence.artifact_evidence(self.lock, "example", "1.0", self.artifact)

    def test_exact_locked_wheel_records_bytes_not_license_prose_or_host_paths(self):
        self.archive()
        row = self.collect()
        self.assertEqual(row["reviewStatus"], "required")
        self.assertEqual(row["artifact"]["kind"], "wheel")
        self.assertEqual(row["licenseFiles"][0]["sha256"], hashlib.sha256(b"Example license").hexdigest())
        self.assertNotIn(str(self.root), json.dumps(row))
        self.assertNotIn("Example license", json.dumps(row))
        self.assertEqual(row, self.collect())

    def test_source_tar_is_read_without_extracting_or_executing(self):
        self.artifact = self.root / "example-1.0.tar.gz"
        with tarfile.open(self.artifact, "w:gz") as archive:
            for name, content in [("example-1.0/LICENSE", b"Source license"),
                                  ("example-1.0/setup.py", b"raise RuntimeError('must never run')")]:
                info = tarfile.TarInfo(name)
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
        self.lock_artifact()
        self.assertEqual(self.collect()["artifact"]["kind"], "source")
        self.assertFalse((self.root / "example-1.0").exists())

    def test_source_zip_and_named_license_directories_are_supported(self):
        self.artifact = self.root / "example-1.0.zip"
        self.archive([("example-1.0/LICENSES/BSD-3-Clause.txt", b"Text")])
        self.assertEqual(len(self.collect()["licenseFiles"]), 1)

    def test_license_parser_modules_are_not_mistaken_for_license_documents(self):
        self.archive([("package/licenses/__init__.py", b"pass"),
                      ("package/licenses/_spdx.py", b"pass"), ("LICENSE", b"Terms")])
        self.assertEqual([f["path"] for f in self.collect()["licenseFiles"]], ["LICENSE"])

    def test_mismatched_archive_hash_fails_before_parsing(self):
        self.archive()
        self.artifact.write_bytes(b"changed")
        with patch.object(evidence, "license_files") as reader:
            with self.assertRaises(ValueError):
                self.collect()
            reader.assert_not_called()

    def test_unlocked_filename_and_identity_or_duplicate_identity_fail(self):
        self.archive()
        original = self.lock.read_text()
        for text in (original.replace(self.artifact.name, "other.whl"),
                     original.replace('name="example"', 'name="other"'), original + original):
            with self.subTest(text=text):
                self.lock.write_text(text)
                with self.assertRaises(ValueError):
                    self.collect()

    def test_filename_identity_cannot_borrow_another_packages_hash(self):
        self.archive()
        self.artifact = self.artifact.rename(self.root / "other-1.0-py3-none-any.whl")
        self.lock_artifact()
        with self.assertRaises(ValueError):
            self.collect()

    def test_unsafe_names_and_duplicate_normalized_paths_fail(self):
        for name in ("../LICENSE", "/LICENSE", "C:/LICENSE", "dir\\LICENSE", "x/../LICENSE", "LICENSE\n"):
            with self.subTest(name=name):
                self.archive([(name, b"text")])
                with self.assertRaises(ValueError):
                    self.collect()
        self.archive([("LICENSE", b"one"), ("./LICENSE", b"two")])
        with self.assertRaises(ValueError):
            self.collect()

    def test_zip_links_and_special_members_fail(self):
        for mode in (0o120777, 0o020600):
            with self.subTest(mode=mode):
                with zipfile.ZipFile(self.artifact, "w") as archive:
                    member = zipfile.ZipInfo("LICENSE")
                    member.create_system = 3
                    member.external_attr = mode << 16
                    archive.writestr(member, b"/do/not/read")
                self.lock_artifact()
                with self.assertRaises(ValueError):
                    self.collect()

    def test_tar_links_and_traversal_fail(self):
        self.artifact = self.root / "example-1.0.tar.gz"
        for name, kind in (("LICENSE", tarfile.SYMTYPE), ("../LICENSE", tarfile.REGTYPE)):
            with self.subTest(name=name, kind=kind):
                with tarfile.open(self.artifact, "w:gz") as archive:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    member.linkname = "/do/not/read"
                    archive.addfile(member)
                self.lock_artifact()
                with self.assertRaises(ValueError):
                    self.collect()

    def test_nonlicense_links_are_reported_without_following_or_claiming_coverage(self):
        with zipfile.ZipFile(self.artifact, "w") as archive:
            member = zipfile.ZipInfo("NEWS.txt")
            member.create_system = 3
            member.external_attr = 0o120777 << 16
            archive.writestr(member, b"/do/not/read")
            archive.writestr("LICENSE", b"Text")
        self.lock_artifact()
        self.assertEqual(self.collect()["unreadLinks"], [{"path": "NEWS.txt", "type": "symlink"}])
        self.artifact = self.root / "example-1.0.tar.gz"
        with tarfile.open(self.artifact, "w:gz") as archive:
            member = tarfile.TarInfo("NEWS.txt")
            member.type = tarfile.SYMTYPE
            member.linkname = "/do/not/read"
            archive.addfile(member)
        self.lock_artifact()
        self.assertEqual(self.collect()["unreadLinks"], [{"path": "NEWS.txt", "type": "symlink"}])

    def test_archive_member_text_and_expansion_limits_fail_closed(self):
        self.archive()
        for limit in ("MAX_ARCHIVE", "MAX_MEMBERS", "MAX_TEXT", "MAX_TEXT_TOTAL", "MAX_EXPANDED"):
            with self.subTest(limit=limit), patch.object(evidence, limit, 0):
                with self.assertRaises(ValueError):
                    self.collect()

    def test_empty_license_fails_but_no_matching_files_is_explicit_not_approval(self):
        self.archive([("LICENSE", b"")])
        with self.assertRaises(ValueError):
            self.collect()
        self.archive([("module.py", b"pass")])
        row = self.collect()
        self.assertEqual(row["licenseDiscovery"], "no-matching-files")
        self.assertEqual(row["reviewStatus"], "required")

    def test_corrupt_archive_and_input_symlink_fail(self):
        self.artifact.write_bytes(b"not an archive")
        self.lock_artifact()
        with self.assertRaises(zipfile.BadZipFile):
            self.collect()
        self.artifact.unlink()
        self.artifact.symlink_to(self.lock)
        with self.assertRaises(ValueError):
            self.collect()

    def test_cli_never_overwrites_existing_evidence_and_hides_error_values(self):
        self.archive()
        output = self.root / "evidence.json"
        args = ["evidence", "--lock", str(self.lock), "--name", "example", "--version", "1.0",
                "--artifact", str(self.artifact), "--output", str(output)]
        with patch("sys.argv", args), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(evidence.main(), 0)
            before = output.read_bytes()
            self.assertEqual(evidence.main(), 1)
            self.assertEqual(output.read_bytes(), before)
        with patch("sys.argv", args), patch.object(evidence, "artifact_evidence", side_effect=ValueError("secret-looking")):
            text = io.StringIO()
            with contextlib.redirect_stdout(text):
                self.assertEqual(evidence.main(), 1)
            self.assertNotIn("secret-looking", text.getvalue())


class RecordedArtifactEvidenceTests(unittest.TestCase):
    def test_recorded_artifacts_are_exactly_locked_and_never_marked_approved(self):
        root = SCRIPTS.parent
        lock = root / "backend/poetry.lock"
        packages = {(p["name"], p["version"]): p for p in tomllib.loads(lock.read_text())["package"]}
        report = json.loads((root / "docs/license-evidence/python-artifacts-2026-10-27.json").read_text())
        self.assertEqual(report["reviewStatus"], "required")
        self.assertEqual(len(report["artifacts"]), 33)
        seen = set()
        for row in report["artifacts"]:
            identity = (row["name"], row["version"])
            key = (*identity, row["artifact"]["filename"])
            self.assertNotIn(key, seen)
            seen.add(key)
            self.assertEqual(row["reviewStatus"], "required")
            self.assertEqual(row["evidenceStatus"], "locked-archive-inspected")
            self.assertEqual(row["lockSha256"], hashlib.sha256(lock.read_bytes()).hexdigest())
            package = packages[identity]
            self.assertEqual(row["lockedGroups"], sorted(package["groups"]))
            self.assertIn({"file": row["artifact"]["filename"], "hash": "sha256:" + row["artifact"]["sha256"]},
                          package["files"])
            self.assertTrue(row["licenseFiles"])
            paths = [file["path"] for file in row["licenseFiles"]]
            self.assertEqual(len(paths), len(set(paths)))
            for file in row["licenseFiles"]:
                self.assertEqual(evidence.safe_name(file["path"]), file["path"])
                self.assertEqual(set(file), {"path", "bytes", "sha256"})
                self.assertGreater(file["bytes"], 0)
                self.assertRegex(file["sha256"], r"^[0-9a-f]{64}$")
        encoded = json.dumps(report)
        for private in ("/Users/", "/private/", "site-packages", "legacyLicenseText", "approvalGranted"):
            self.assertNotIn(private, encoded)

    def test_recorded_coverage_distinguishes_sources_samples_and_absent_platforms(self):
        root = SCRIPTS.parent
        report = json.loads((root / "docs/license-evidence/python-artifacts-2026-10-27.json").read_text())
        sources = [r for r in report["artifacts"] if r["selection"] == "ambiguous-metadata-source"]
        wheels = [r for r in report["artifacts"] if r["artifact"]["kind"] == "wheel"]
        self.assertEqual(len({(r["name"], r["version"]) for r in sources}), 26)
        self.assertEqual(len(wheels), 7)
        self.assertEqual(sum(r["selection"] == "linux-x86_64-review-sample" for r in wheels), 6)
        self.assertEqual(report["coverage"]["lockedIdentities"], 126)
        self.assertEqual(report["coverage"]["installedAllGroupsMacIdentities"], 121)
        self.assertEqual({r["name"] for r in report["coverage"]["outsideMacEnvironment"]},
                         {"colorama", "greenlet", "jeepney", "pywin32-ctypes", "secretstorage"})


if __name__ == "__main__":
    unittest.main()
