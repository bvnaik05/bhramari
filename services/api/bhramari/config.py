from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BHRAMARI_", env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./data/bhramari.db"
    demo: bool = False
    jwt_secret: str = ""
    oidc_issuer: str = ""
    oidc_audience: str = "bhramari-api"
    oidc_jwks_url: str = ""
    relayer_token: str = ""
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    data_dir: Path = Path("data")
    evidence_key: str = ""
    passport_private_key: str = ""
    public_url: str = "http://localhost:3000"


@lru_cache
def settings():
    return Settings()
