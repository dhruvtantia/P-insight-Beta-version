"""Authentication boundary placeholder.

This keeps auth-dependent service contracts explicit while production auth is
still undecided. Replace the placeholder with Supabase Auth or Clerk token
verification before public launch.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None = None
    is_admin: bool = False


def get_current_user() -> AuthenticatedUser:
    # TODO: Replace with JWT/session verification from Supabase Auth or Clerk.
    return AuthenticatedUser(id="dev-user", email="dev@example.com", is_admin=True)

