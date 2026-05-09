import asyncio
from auth.user_manager import create_user

async def main():
    try:
        user = create_user(
            supabase_auth_id="11111111-1111-1111-1111-111111111111",
            email="u1234567@anu.edu.au",
            name="Test User",
            bio="Test Bio"
        )
        print("SUCCESS:", user)
    except Exception as e:
        print("ERROR:", str(e))

if __name__ == "__main__":
    asyncio.run(main())
