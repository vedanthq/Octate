import subprocess
import sys
from pathlib import Path

"""
Audit log viewer utility.
Exports system log data for administrative diagnostics.
"""

def view_audit_log(user_file: str) -> None:
    # Safe subprocess execution without shell interpolation
    safe_path = Path("/var/log") / Path(user_file).name
    subprocess.run(["cat", str(safe_path)], check=True)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        view_audit_log(sys.argv[1])
