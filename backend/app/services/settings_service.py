"""Service for managing application settings at runtime."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Optional

import yaml

from ..config import settings

logger = logging.getLogger(__name__)

# Resolve .env file path relative to project root
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILE = _PROJECT_ROOT / ".env"


class SettingsService:
    """Read and write application settings (`.env` and `machines.yml`)."""

    # ------------------------------------------------------------------
    # .env helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _read_env() -> dict[str, str]:
        """Parse the .env file into a dict."""
        env: dict[str, str] = {}
        if not _ENV_FILE.exists():
            return env
        for line in _ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
        return env

    @staticmethod
    def _write_env(data: dict[str, str]) -> None:
        """Write settings back to .env, preserving comments."""
        lines: list[str] = []
        written_keys: set[str] = set()

        if _ENV_FILE.exists():
            for line in _ENV_FILE.read_text().splitlines():
                stripped = line.strip()
                if stripped and not stripped.startswith("#") and "=" in stripped:
                    key = stripped.split("=", 1)[0].strip()
                    if key in data:
                        lines.append(f"{key}={data[key]}")
                        written_keys.add(key)
                        continue
                lines.append(line)

        # Append any new keys that weren't in the file
        for key, value in data.items():
            if key not in written_keys:
                lines.append(f"{key}={value}")

        _ENV_FILE.write_text("\n".join(lines) + "\n")

    # ------------------------------------------------------------------
    # machines.yml helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _read_machines_config() -> dict:
        try:
            with open(settings.ssh_config_path, "r") as f:
                return yaml.safe_load(f) or {}
        except FileNotFoundError:
            return {}

    @staticmethod
    def _write_machines_config(cfg: dict) -> None:
        with open(settings.ssh_config_path, "w") as f:
            yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)

    # ------------------------------------------------------------------
    # Public API – getters
    # ------------------------------------------------------------------

    def get_network_settings(self) -> dict:
        env = self._read_env()
        return {
            "network_subnet": env.get("NETWORK_SUBNET", settings.network_subnet),
            "host_ip": env.get("HOST_IP", settings.host_ip),
            "scan_interval": int(env.get("SCAN_INTERVAL", settings.scan_interval)),
        }

    def get_ssh_settings(self) -> dict:
        env = self._read_env()
        cfg = self._read_machines_config()
        defaults = cfg.get("defaults", {})
        return {
            "ssh_key_path": env.get("SSH_KEY_PATH", settings.ssh_key_path),
            "ssh_config_path": env.get("SSH_CONFIG_PATH", settings.ssh_config_path),
            "default_ssh_user": defaults.get("ssh_user", "fabrik"),
            "default_ssh_port": defaults.get("ssh_port", 22),
        }

    def get_github_settings(self) -> dict:
        env = self._read_env()
        return {
            "github_token": env.get("GITHUB_TOKEN", settings.github_token),
            "github_owner": env.get("GITHUB_OWNER", settings.github_owner),
            "github_repo": env.get("GITHUB_REPO", settings.github_repo),
        }

    def get_machines(self) -> list[dict]:
        cfg = self._read_machines_config()
        return cfg.get("machines", [])

    def get_all_settings(self) -> dict:
        return {
            "network": self.get_network_settings(),
            "ssh": self.get_ssh_settings(),
            "github": self.get_github_settings(),
            "machines": self.get_machines(),
        }

    # ------------------------------------------------------------------
    # Public API – setters
    # ------------------------------------------------------------------

    def update_network_settings(self, data: dict) -> dict:
        env = self._read_env()
        if "network_subnet" in data:
            env["NETWORK_SUBNET"] = data["network_subnet"]
        if "host_ip" in data:
            env["HOST_IP"] = data["host_ip"]
        if "scan_interval" in data:
            env["SCAN_INTERVAL"] = str(data["scan_interval"])
        self._write_env(env)
        return self.get_network_settings()

    def update_ssh_settings(self, data: dict) -> dict:
        env = self._read_env()
        if "ssh_key_path" in data:
            env["SSH_KEY_PATH"] = data["ssh_key_path"]
        if "ssh_config_path" in data:
            env["SSH_CONFIG_PATH"] = data["ssh_config_path"]
        self._write_env(env)

        # Update defaults in machines.yml
        if "default_ssh_user" in data or "default_ssh_port" in data:
            cfg = self._read_machines_config()
            defaults = cfg.setdefault("defaults", {})
            if "default_ssh_user" in data:
                defaults["ssh_user"] = data["default_ssh_user"]
            if "default_ssh_port" in data:
                defaults["ssh_port"] = int(data["default_ssh_port"])
            self._write_machines_config(cfg)

        return self.get_ssh_settings()

    def update_github_settings(self, data: dict) -> dict:
        env = self._read_env()
        if "github_token" in data:
            env["GITHUB_TOKEN"] = data["github_token"]
        if "github_owner" in data:
            env["GITHUB_OWNER"] = data["github_owner"]
        if "github_repo" in data:
            env["GITHUB_REPO"] = data["github_repo"]
        self._write_env(env)
        return self.get_github_settings()

    def update_machine(self, ip: str, data: dict) -> list[dict]:
        cfg = self._read_machines_config()
        machines = cfg.get("machines", [])

        found = False
        for m in machines:
            if m.get("ip") == ip:
                m.update(data)
                found = True
                break

        if not found:
            data["ip"] = ip
            machines.append(data)

        cfg["machines"] = machines
        self._write_machines_config(cfg)
        return machines

    def remove_machine(self, ip: str) -> list[dict]:
        cfg = self._read_machines_config()
        machines = [m for m in cfg.get("machines", []) if m.get("ip") != ip]
        cfg["machines"] = machines
        self._write_machines_config(cfg)
        return machines

    def save_ssh_key(self, key_content: str, filename: str = "id_rsa") -> str:
        """Save an SSH private key to disk."""
        key_dir = Path(settings.ssh_key_path).parent
        key_dir.mkdir(parents=True, exist_ok=True)
        key_path = key_dir / filename
        key_path.write_text(key_content)
        key_path.chmod(0o600)
        logger.info("SSH key saved to %s", key_path)
        return str(key_path)
