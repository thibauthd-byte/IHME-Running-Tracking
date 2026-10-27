#!/usr/bin/env python3
"""Client CI avec journalisation des erreurs pour le débogage."""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


def request_deployment(url, token, digest, registry_token=""):
    print(f"Debug: URL = '{url}'")
    print(f"Debug: Longueur token = {len(token)}")
    print(f"Debug: Digest = '{digest}'")

    address = urllib.parse.urlsplit(url)
    if (
        address.scheme != "https"
        or not address.hostname
        or address.username
        or address.password
        or address.query
        or address.fragment
        or not re.fullmatch(r"/__deploy/(suivi|p[0-9]{2})", address.path)
    ):
        raise ValueError(f"URL HTTPS de déploiement invalide: '{url}'")
    if not token or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise ValueError(f"Jeton privé ou digest invalide (token présent: {bool(token)}, digest: '{digest}')")
    
    body = {"digest": digest}
    if registry_token:
        body["registry_token"] = registry_token
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
        },
    )

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None

    with urllib.request.build_opener(NoRedirect()).open(
        request, timeout=440
    ) as response:
        data = json.load(response)
        if response.status != 200 or data.get("status") != "healthy":
            raise ValueError(f"Version non saine: {data}")
        return data


if __name__ == "__main__":
    try:
        result = request_deployment(
            os.environ.get("DEPLOY_URL", "").strip(),
            os.environ.get("DEPLOY_TOKEN", "").strip(),
            os.environ.get("DIGEST", "").strip(),
            os.environ.get("REGISTRY_TOKEN", "").strip(),
        )
        print("Déploiement vérifié : " + result["project"] + " @ " + result["digest"])
    except urllib.error.HTTPError as err:
        print(f"Erreur HTTP {err.code}: {err.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
        sys.exit(1)
    except Exception as err:
        print(f"Erreur d'exécution: {err}", file=sys.stderr)
        sys.exit(1)
