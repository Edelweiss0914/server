from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ECLASS_BASE_URL: str = "https://cyber.mjc.ac.kr"
    DB_PATH: str = "/data/eclass.db"
    BROWSER_STATE_PATH: str = "/data/browser-state/state.json"
    TZ: str = "Asia/Seoul"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
