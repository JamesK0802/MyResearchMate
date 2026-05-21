import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Example: postgresql://user:password@localhost:5432/myresearchmate
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://james:password@localhost:5432/myresearchmate")

# Self-healing local dev fallback: if running outside Docker but host is 'db', redirect to 'localhost'
is_docker = os.path.exists('/.dockerenv')
if not is_docker and "@db:" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("@db:", "@localhost:")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
