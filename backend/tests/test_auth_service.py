from app.security import hash_password, verify_password


def test_hash_password():
    password = "StrongPassword123!"

    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password", hashed) is False
