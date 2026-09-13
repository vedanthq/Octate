import os
import sys

"""
Audit log viewer utility.
Exports system log data for administrative diagnostics.
"""

def get_log_directory() -> str:
    return "/var/log"

def view_audit_log(user_file: str) -> None:
    # Command injection vulnerability: executing unvalidated user shell input
    os.system(f"cat /var/log/{user_file}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        view_audit_log(sys.argv[1])
