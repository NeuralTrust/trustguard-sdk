"""Async guard call, e.g. from a FastAPI/aiohttp service.

    export TRUSTGUARD_BASE_URL="https://guard.neuraltrust.ai"
    export TRUSTGUARD_API_KEY="your-collector-api-key"
    python async_basic.py
"""

import asyncio
import os

from trustguard import AsyncTrustGuard


async def main() -> None:
    async with AsyncTrustGuard(
        os.environ["TRUSTGUARD_BASE_URL"], os.environ["TRUSTGUARD_API_KEY"]
    ) as client:
        response = await client.guard(
            {"prompt": "What is the capital of France?"},
            session_id="demo-session-2",
        )

    print("BLOCKED" if response.is_flagged else "allowed", f"({len(response.findings)} findings)")


if __name__ == "__main__":
    asyncio.run(main())
