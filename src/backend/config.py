from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = Field(..., alias="ANTHROPIC_API_KEY")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_key: str = Field(default="", alias="SUPABASE_KEY")
    environment: str = Field(default="development", alias="ENVIRONMENT")
    field_encryption_key: str = Field(default="", alias="FIELD_ENCRYPTION_KEY")

    triage_thinking_budget: int = Field(default=800, alias="TRIAGE_THINKING_BUDGET")
    max_retries: int = Field(default=3, alias="MAX_RETRIES")

    @field_validator("anthropic_api_key")
    @classmethod
    def anthropic_key_must_exist(cls, v: str) -> str:
        if not v or v == "your-key":
            raise ValueError("ANTHROPIC_API_KEY must be set to a real key")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "populate_by_name": True}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
