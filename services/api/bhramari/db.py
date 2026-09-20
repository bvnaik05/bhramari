from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


settings().data_dir.mkdir(parents=True, exist_ok=True)
url = settings().database_url
engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30} if url.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


if url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def sqlite_constraints(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")


def get_db():
    with SessionLocal() as session:
        try:
            if url.startswith("sqlite"):
                # ponytail: serialize local demo transactions; PostgreSQL uses row locks at scale.
                session.execute(text("BEGIN IMMEDIATE"))
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
