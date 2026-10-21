"""Generate or verify pip installation files from the one Poetry lock."""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
EXPORTS = {
    "requirements-lock.txt": "main",
    "requirements-dev-lock.txt": "main,dev",
    "requirements-bootstrap.txt": "build",
    "requirements-tools-lock.txt": "lock",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Reject stale exports without writing")
    args = parser.parse_args()
    poetry = [sys.executable, "-m", "poetry", "--directory", str(BACKEND)]
    subprocess.run([*poetry, "check", "--lock", "--strict"], check=True)
    mismatches = []
    with tempfile.TemporaryDirectory(prefix="pinsight-dependency-export-") as temporary:
        for filename, groups in EXPORTS.items():
            target = Path(temporary) / filename if args.check else BACKEND / filename
            subprocess.run([
                *poetry, "export", "--only", groups, "--format", "requirements.txt",
                "--output", str(target),
            ], check=True)
            checked_in = BACKEND / filename
            if args.check and (not checked_in.exists() or target.read_bytes() != checked_in.read_bytes()):
                mismatches.append(filename)
    if mismatches:
        parser.exit(1, f"Stale dependency exports: {', '.join(mismatches)}\n")
    print("Dependency exports match poetry.lock" if args.check else "Dependency exports generated")


if __name__ == "__main__":
    main()
