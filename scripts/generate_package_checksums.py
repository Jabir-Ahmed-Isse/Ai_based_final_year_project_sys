from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    args = parser.parse_args()
    package = args.package.resolve()
    output = package / "07-reproducibility" / "SHA256SUMS.txt"
    files = sorted(
        path
        for path in package.rglob("*")
        if path.is_file()
        and path != output
        and path.suffix.lower() != ".zip"
        and not path.name.endswith(".inspect.ndjson")
    )
    lines = [f"{sha256(path)}  {path.relative_to(package).as_posix()}" for path in files]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(files)} files hashed -> {output}")


if __name__ == "__main__":
    main()
