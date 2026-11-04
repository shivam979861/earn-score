"""Trusted, interactive CLI for provisioning lender and admin users."""
import argparse
import getpass
from sqlalchemy import select
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.entities import User
import app.models  # noqa: F401


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-user")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--role", choices=["lender", "admin"], required=True)
    args = parser.parse_args()
    if args.command == "create-user":
        password = getpass.getpass("Password (at least 10 characters): ")
        if len(password) < 10:
            parser.error("Password must be at least 10 characters")
        if engine.dialect.name == "sqlite":
            Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            if db.scalar(select(User).where(User.email == args.email.lower())):
                parser.error("User already exists")
            db.add(User(email=args.email.lower(), full_name=args.name,
                        role=args.role, password_hash=hash_password(password)))
            db.commit()
        print(f"Created {args.role} user: {args.email.lower()}")


if __name__ == "__main__":
    main()
