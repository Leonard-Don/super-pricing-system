"""Atomic JSON file writes.

`Path.write_text` / `json.dump(open(path,"w"))` truncate the target first and then
stream — a crash, OOM, or kill mid-write leaves a truncated/half-written file that
fails to parse on the next load. Stores that swallow the decode error then silently
reset to `[]`, i.e. **silent total history loss**.

`atomic_write_json` writes to a temp file in the same directory, fsyncs it, then
`os.replace()`s it over the target. `os.replace` is atomic on POSIX/Windows, so a
reader/crash ever sees either the old complete file or the new complete file — never
a torn one. (Mirrors the reference implementation in `CandidateStore._persist`.)
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def atomic_write_json(path: str | Path, data: Any, **dump_kwargs: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    dump_kwargs.setdefault("ensure_ascii", False)
    tmp = tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=target.parent,
        prefix=f".{target.name}.",
        suffix=".tmp",
        delete=False,
    )
    tmp_path = Path(tmp.name)
    try:
        with tmp as fp:
            json.dump(data, fp, default=str, **dump_kwargs)
            fp.flush()
            os.fsync(fp.fileno())
        tmp_path.replace(target)
    except Exception:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to remove temp file %s", tmp_path)
        raise
