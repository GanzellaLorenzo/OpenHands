#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class DeletedTest:
    file: str
    language: str
    declaration: str
    name: str
    kind: str
    present_in_current_file: bool


def _run_git_diff(revision_range: str) -> str:
    return subprocess.check_output(
        [
            'git',
            '--no-pager',
            'diff',
            '--unified=0',
            revision_range,
            '--',
            '*.py',
            '*.js',
            '*.jsx',
            '*.ts',
            '*.tsx',
        ],
        text=True,
    )


def _parse_name(declaration: str) -> tuple[str, str] | None:
    js_match = re.match(r'^(it|test|describe)\("([^"]+)"', declaration)
    if js_match:
        return js_match.group(1), js_match.group(2)

    py_match = re.match(r'^def (test_[^(]+)', declaration)
    if py_match:
        return 'def', py_match.group(1)

    return None


def extract_deleted_tests(diff_text: str) -> list[DeletedTest]:
    current_file: str | None = None
    deleted_tests: list[DeletedTest] = []

    for line in diff_text.splitlines():
        if line.startswith('diff --git '):
            match = re.match(r'diff --git a/(.*?) b/(.*?)$', line)
            current_file = match.group(2) if match else None
            continue

        if current_file is None or not line.startswith('-') or line.startswith('--- '):
            continue

        declaration = line[1:].strip()
        if not (
            re.match(r'^(it|test|describe)\("', declaration)
            or re.match(r'^def test_', declaration)
        ):
            continue

        parsed = _parse_name(declaration)
        if not parsed:
            continue

        kind, name = parsed
        path = Path(current_file)
        present_in_current_file = path.exists() and name in path.read_text()
        language = 'python' if declaration.startswith('def test_') else 'javascript'
        deleted_tests.append(
            DeletedTest(
                file=current_file,
                language=language,
                declaration=declaration,
                name=name,
                kind=kind,
                present_in_current_file=present_in_current_file,
            )
        )

    return deleted_tests


def main() -> None:
    parser = argparse.ArgumentParser(
        description='List deleted Python/JavaScript tests from a git diff.'
    )
    parser.add_argument(
        'revision_range',
        nargs='?',
        default='origin/main...HEAD',
        help='Git revision range to inspect (default: origin/main...HEAD)',
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Emit machine-readable JSON instead of text output.',
    )
    args = parser.parse_args()

    deleted_tests = extract_deleted_tests(_run_git_diff(args.revision_range))

    if args.json:
        print(json.dumps([asdict(item) for item in deleted_tests], indent=2))
        return

    for item in deleted_tests:
        print(
            '\t'.join(
                [
                    item.file,
                    item.language,
                    item.kind,
                    item.name,
                    str(item.present_in_current_file),
                ]
            )
        )


if __name__ == '__main__':
    main()
