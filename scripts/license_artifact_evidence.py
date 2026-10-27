"""Record license-file fingerprints from one locked archive; never approve or extract it."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
import tomllib
import zipfile

from packaging.utils import canonicalize_name, parse_sdist_filename, parse_wheel_filename

from license_inventory import write_report

MAX_ARCHIVE = 128 * 1024 * 1024
MAX_MEMBERS = 100_000
MAX_TEXT = 4 * 1024 * 1024
MAX_TEXT_TOTAL = 32 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024
LICENSE_NAME = re.compile(r"^(licen[cs]e|copying|notice|copyright)(?:[._-].*)?$", re.I)


def safe_name(name):
    parts = PurePosixPath(name).parts
    if (not parts or PurePosixPath(name).is_absolute() or ".." in parts
            or "\\" in name or any(ord(char) < 32 or ord(char) == 127 for char in name)
            or re.match(r"^[A-Za-z]:", name)):
        raise ValueError("Unsafe archive member")
    return str(PurePosixPath(name))


def license_name(name):
    path = PurePosixPath(name)
    return bool(LICENSE_NAME.fullmatch(path.name)) or any(
        part in ("LICENSES", "LICENCES") or (
            part.lower() in ("licenses", "licences") and index > 0
            and path.parts[index - 1].endswith(".dist-info")
        ) for index, part in enumerate(path.parts[:-1])
    )


def license_files(artifact):
    """Read bounded regular license members in memory; no filesystem extraction."""
    rows, unread, seen, total, expanded = [], [], set(), 0, 0

    def skip_link(name, kind):
        name = safe_name(name)
        if license_name(name) or name in seen or len(seen) >= MAX_MEMBERS:
            raise ValueError("Linked license or duplicate archive member")
        seen.add(name)
        unread.append({"path": name, "type": kind})

    def record(name, size, reader):
        nonlocal total, expanded
        name = safe_name(name)
        if name in seen or len(seen) >= MAX_MEMBERS:
            raise ValueError("Duplicate or excessive archive members")
        seen.add(name)
        expanded += size
        if size < 0 or expanded > MAX_EXPANDED:
            raise ValueError("Excessive expanded archive size")
        if not license_name(name):
            return
        if not 0 < size <= MAX_TEXT or total + size > MAX_TEXT_TOTAL:
            raise ValueError("Empty or oversized license member")
        with reader() as stream:
            content = stream.read(MAX_TEXT + 1)
        if len(content) != size:
            raise ValueError("License member size mismatch")
        total += size
        rows.append({"path": name, "bytes": size,
                     "sha256": hashlib.sha256(content).hexdigest()})

    if artifact.name.endswith((".whl", ".zip")):
        with zipfile.ZipFile(artifact) as archive:
            if len(archive.infolist()) > MAX_MEMBERS:
                raise ValueError("Excessive archive members")
            for member in archive.infolist():
                # Unix type bits identify symlinks and special files in ZIPs.
                kind = (member.external_attr >> 16) & 0o170000
                if member.flag_bits & 1:
                    raise ValueError("Encrypted archive member")
                if kind == 0o120000:
                    skip_link(member.filename, "symlink")
                    continue
                if kind not in (0, 0o100000, 0o040000):
                    raise ValueError("Special archive member")
                if member.is_dir():
                    safe_name(member.filename)
                    continue
                record(member.filename, member.file_size, lambda: archive.open(member))
    elif artifact.name.endswith(".tar.gz"):
        with tarfile.open(artifact, "r|gz") as archive:
            for count, member in enumerate(archive, 1):
                if count > MAX_MEMBERS:
                    raise ValueError("Excessive archive members")
                safe_name(member.name)
                if member.isdir():
                    continue
                if member.issym() or member.islnk():
                    skip_link(member.name, "symlink" if member.issym() else "hardlink")
                    continue
                if not member.isfile():
                    raise ValueError("Special archive member")
                record(member.name, member.size, lambda: archive.extractfile(member))
    else:
        raise ValueError("Unsupported archive format")
    return sorted(rows, key=lambda row: row["path"]), sorted(unread, key=lambda row: row["path"])


def artifact_evidence(lock_path, name, version, artifact):
    lock_bytes = lock_path.read_bytes()
    packages = tomllib.loads(lock_bytes.decode())["package"]
    matches = [p for p in packages if (canonicalize_name(p["name"]), p["version"])
               == (canonicalize_name(name), version)]
    if len(matches) != 1:
        raise ValueError("Expected one exact locked identity")
    if artifact.is_symlink() or not artifact.is_file() or artifact.stat().st_size > MAX_ARCHIVE:
        raise ValueError("Artifact must be a bounded regular file")
    parsed = (parse_wheel_filename(artifact.name) if artifact.name.endswith(".whl")
              else parse_sdist_filename(artifact.name))
    if (canonicalize_name(parsed[0]), str(parsed[1])) != (canonicalize_name(name), version):
        raise ValueError("Artifact filename identity differs from lock")
    candidates = [row for row in matches[0]["files"] if row["file"] == artifact.name]
    if len(candidates) != 1:
        raise ValueError("Artifact filename is not uniquely locked")
    with artifact.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if candidates[0]["hash"] != "sha256:" + digest:
        raise ValueError("Artifact fingerprint differs from lock")
    files, unread = license_files(artifact)
    return {
        "schemaVersion": 1, "ecosystem": "python", "reviewStatus": "required",
        "evidenceStatus": "locked-archive-inspected",
        "name": canonicalize_name(name), "version": version,
        "lockedGroups": sorted(matches[0]["groups"]),
        "lockSha256": hashlib.sha256(lock_bytes).hexdigest(),
        "artifact": {"filename": artifact.name, "sha256": digest,
                     "bytes": artifact.stat().st_size,
                     "kind": "wheel" if artifact.name.endswith(".whl") else "source"},
        "licenseDiscovery": "files-found" if files else "no-matching-files",
        "licenseFiles": files,
        "unreadLinks": unread,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", type=Path, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = artifact_evidence(args.lock, args.name, args.version, args.artifact)
        write_report(report, args.output)
        print(json.dumps({key: report[key] for key in ("evidenceStatus", "reviewStatus", "licenseDiscovery")}))
        return 0
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError, zipfile.BadZipFile):
        print("Artifact evidence FAILED; no license approval inferred.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
