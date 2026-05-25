"""Load Brevo / SMTP credentials from gitignored local file."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger("wizflow.brevo")


def _secret_paths() -> list[Path]:
    paths: list[Path] = [
        Path("/config/secrets/brevo.local.txt"),
    ]
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        paths.append(parent / "config" / "secrets" / "brevo.local.txt")
        paths.append(parent / "secrets" / "brevo.local.txt")
    seen: set[str] = set()
    unique: list[Path] = []
    for p in paths:
        key = str(p)
        if key not in seen:
            seen.add(key)
            unique.append(p)
    return unique


def _parse_secrets_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        out[key.strip().upper()] = val.strip().strip('"').strip("'")
    return out


_cached: dict[str, str] | None = None


def _normalize_secrets(merged: dict[str, str]) -> dict[str, str]:
    """Fix common mix-ups: SMTP key pasted into BREVO_API_KEY (or vice versa)."""
    api = merged.get("BREVO_API_KEY", "")
    smtp_pass = merged.get("SMTP_PASS", "")
    if api.startswith("xsmtpsib-"):
        logger.info("Brevo: using BREVO_API_KEY value as SMTP_PASS (xsmtpsib key detected)")
        merged["SMTP_PASS"] = api
        merged["BREVO_API_KEY"] = smtp_pass if smtp_pass.startswith("xkeysib-") else ""
    elif smtp_pass.startswith("xkeysib-"):
        logger.info("Brevo: using SMTP_PASS value as BREVO_API_KEY (xkeysib key detected)")
        merged["BREVO_API_KEY"] = smtp_pass
        merged["SMTP_PASS"] = api if api.startswith("xsmtpsib-") else smtp_pass
    return merged


def load_brevo_secrets(*, reload: bool = False) -> dict[str, str]:
    global _cached
    if reload:
        _cached = None
    if _cached is not None:
        return _cached
    merged: dict[str, str] = {}
    for p in _secret_paths():
        merged.update(_parse_secrets_file(p))
        if merged:
            logger.info("Loaded email config from %s", p)
            break
    merged = _normalize_secrets(merged)
    _cached = merged
    return merged
