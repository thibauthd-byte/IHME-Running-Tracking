#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.request

url = os.environ.get("DEPLOY_URL", "").strip()
token = os.environ.get("DEPLOY_TOKEN", "").strip()
digest = os.environ.get("DIGEST", "").strip()

payload = json.dumps({"digest": digest}).encode("utf-8")

req = urllib.request.Request(
    url,
    data=payload,
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=440) as response:
        data = json.loads(response.read().decode("utf-8"))
        print(f"Déploiement réussi : {data}")
except urllib.error.HTTPError as e:
    print(f"Erreur HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"Erreur: {e}", file=sys.stderr)
    sys.exit(1)
