"""Application configuration loaded from environment and config files."""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # GitHub
    github_token: str = Field(default="", description="GitHub Personal Access Token")
    github_owner: str = Field(default="", description="GitHub repository owner")
    github_repo: str = Field(default="Archyveon_Core", description="GitHub repository name")

    # Network
    network_subnet: str = Field(default="192.168.44.0/24", description="Network subnet to scan")
    host_ip: str = Field(default="192.168.44.1", description="Host machine IP")
    scan_interval: int = Field(default=60, description="Network scan interval in seconds")

    # SSH
    ssh_key_path: str = Field(default="/app/config/ssh_keys/id_rsa", description="Default SSH key path")
    ssh_config_path: str = Field(default="/app/config/machines.yml", description="Machines config file path")

    # Server
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    debug: bool = Field(default=False)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
