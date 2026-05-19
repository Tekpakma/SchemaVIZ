#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "package.json"
VERSION_PATTERN = re.compile(
    r'^(?P<prefix>\s*"version"\s*:\s*")(?P<version>\d+\.\d+\.\d+)(?P<suffix>".*)$',
    re.MULTILINE,
)
FRONTEND_TAG_PATTERN = re.compile(r"^frontend-v(?P<version>\d+\.\d+\.\d+)$")


def run(cmd: list[str], *, dry_run: bool = False) -> None:
    printable = " ".join(cmd)
    if dry_run:
        print(f"[dry-run] {printable}")
        return

    subprocess.run(cmd, cwd=ROOT, check=True)


def output(cmd: list[str]) -> str:
    completed = subprocess.run(
        cmd,
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def read_version() -> str:
    text = VERSION_FILE.read_text()
    match = VERSION_PATTERN.search(text)
    if not match:
        raise SystemExit(f'Could not find top-level "version" in {VERSION_FILE}')
    return match.group("version")


def version_key(version: str) -> tuple[int, int, int]:
    major, minor, patch = (int(piece) for piece in version.split("."))
    return major, minor, patch


def latest_frontend_tag_version() -> str | None:
    versions: list[str] = []
    for tag_name in output(["git", "tag", "--list", "frontend-v*"]).splitlines():
        match = FRONTEND_TAG_PATTERN.match(tag_name.strip())
        if match:
            versions.append(match.group("version"))

    return max(versions, key=version_key) if versions else None


def write_version(new_version: str, *, dry_run: bool = False) -> None:
    text = VERSION_FILE.read_text()
    updated, count = VERSION_PATTERN.subn(
        rf"\g<prefix>{new_version}\g<suffix>",
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit(f'Could not update top-level "version" in {VERSION_FILE}')

    if dry_run:
        print(f"[dry-run] update {VERSION_FILE.relative_to(ROOT)} -> {new_version}")
        return

    VERSION_FILE.write_text(updated)


def bump_version(version: str, part: str) -> str:
    major, minor, patch = (int(piece) for piece in version.split("."))

    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    if part == "patch":
        return f"{major}.{minor}.{patch + 1}"

    raise ValueError(f"Unsupported version part: {part}")


def ensure_clean_tree(*, allow_dirty: bool) -> None:
    if allow_dirty:
        return

    status = output(["git", "status", "--short"])
    if status:
        raise SystemExit(
            "Working tree is not clean. Commit or stash existing changes before running a release target."
        )


def ensure_branch(expected_branch: str) -> None:
    branch = output(["git", "branch", "--show-current"])
    if branch != expected_branch:
        raise SystemExit(
            f"Current branch is '{branch or 'detached HEAD'}'. Switch to '{expected_branch}' before releasing."
        )


def ensure_tag_missing(tag_name: str) -> None:
    existing = output(["git", "tag", "--list", tag_name])
    if existing:
        raise SystemExit(f"Tag '{tag_name}' already exists.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bump the frontend version, commit it, and create the matching frontend tag."
    )
    parser.add_argument("part", choices=["patch", "minor", "major"])
    parser.add_argument("--branch", default="main")
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--push", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-dirty", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    current_version = read_version()
    latest_tag_version = latest_frontend_tag_version()
    base_version = max(
        [version for version in [current_version, latest_tag_version] if version is not None],
        key=version_key,
    )
    next_version = bump_version(base_version, args.part)
    tag_name = f"frontend-v{next_version}"

    ensure_clean_tree(allow_dirty=args.allow_dirty or args.dry_run)
    ensure_branch(args.branch)
    ensure_tag_missing(tag_name)

    print(f"Current version: {current_version}")
    if latest_tag_version and version_key(latest_tag_version) > version_key(current_version):
        print(f"Latest frontend tag version: {latest_tag_version}")
        print(f"Base version: {base_version}")
    print(f"Next version: {next_version}")
    print(f"Tag: {tag_name}")

    write_version(next_version, dry_run=args.dry_run)
    run(["git", "add", str(VERSION_FILE.relative_to(ROOT))], dry_run=args.dry_run)
    run(
        ["git", "commit", "-m", f"Release frontend {next_version}"],
        dry_run=args.dry_run,
    )
    run(
        ["git", "tag", "-a", tag_name, "-m", f"Release frontend {next_version}"],
        dry_run=args.dry_run,
    )

    if args.push:
        run(["git", "push", args.remote, args.branch], dry_run=args.dry_run)
        run(["git", "push", args.remote, tag_name], dry_run=args.dry_run)
    else:
        print(f"Push later with: git push {args.remote} {args.branch}")
        print(f"Push later with: git push {args.remote} {tag_name}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
