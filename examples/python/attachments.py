"""Attachment scanning: send a document alongside the prompt so file-aware
plugins in the policy can evaluate it.

    export TRUSTGUARD_BASE_URL="https://your-deployment.example.com"
    export TRUSTGUARD_API_KEY="your-collector-api-key"
    python attachments.py [path/to/file]
"""

import os
import sys
from pathlib import Path

from trustguard import Attachment, TrustGuard


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__)

    with TrustGuard(os.environ["TRUSTGUARD_BASE_URL"], os.environ["TRUSTGUARD_API_KEY"]) as client:
        response = client.guard(
            {"prompt": "Summarize the attached document."},
            attachments=[
                Attachment(
                    filename=path.name,
                    content_type="application/octet-stream",
                    data=path.read_bytes(),  # raw bytes; the SDK base64-encodes them on the wire
                )
            ],
        )

    print("BLOCKED" if response.is_flagged else "allowed", f"({len(response.findings)} findings)")


if __name__ == "__main__":
    main()
