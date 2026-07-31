import asyncio
import base64
import json
import os

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import UserTable
from app.security import hash_password


USERS = [
    ("voiden_alice", "Alice", "Alice123456!"),
    ("voiden_bob", "Bob", "Bob123456!"),
    ("voiden_charlie", "Charlie", "Charlie123456!"),
    ("voiden_diana", "Diana", "Diana123456!"),
    ("voiden_admin", "Admin", "Admin123456!"),
    ("voiden_test", "Test", "Test123456!"),
]


def make_envelope(username):
    envelope = {
        "version": 2,
        "kdf": {
            "name": "PBKDF2",
            "hash": "SHA-256",
            "iterations": 600000,
            "salt": base64.b64encode(os.urandom(16)).decode(),
        },
        "cipher": {
            "name": "AES-GCM",
            "iv": base64.b64encode(os.urandom(12)).decode(),
            "ciphertext": base64.b64encode(os.urandom(64)).decode(),
        },
    }

    encrypted = "voiden:key-envelope:v2:" + json.dumps(
        envelope, separators=(",", ":"), sort_keys=True
    )

    return encrypted, "v2"


async def main():
    async with AsyncSessionLocal() as db:
        for username, name, password in USERS:
            result = await db.execute(
                select(UserTable).where(UserTable.username == username)
            )

            user = result.scalar_one_or_none()

            encrypted_private_key, private_key_iv = make_envelope(username)

            if user:
                user.password_hash = hash_password(password)
                user.is_verified = True
                user.is_active = True
                print(f"UPDATED {username}")

            else:
                db.add(
                    UserTable(
                        username=username,
                        email=f"{username}@example.com",
                        display_name=name,
                        bio="VØIDEN DEV TEST",
                        public_key={"type": "dev", "user": username},
                        encrypted_private_key=encrypted_private_key,
                        private_key_iv=private_key_iv,
                        password_hash=hash_password(password),
                        is_verified=True,
                        is_active=True,
                    )
                )

                print(f"CREATED {username}")

        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
