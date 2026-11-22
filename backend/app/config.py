from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TTK_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://timetable:timetable@localhost:5432/timetableking"
    cors_origins: list[str] = ["http://localhost:5173"]
    solver_workers: int = 8
    solver_default_seconds: int = 30


settings = Settings()
