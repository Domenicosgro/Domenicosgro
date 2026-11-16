"""Referenz für den SSO-Vertrag Dashboard -> Büro-Audio (SSO-BUERO-AUDIO.md, §1).

Nur Standardbibliothek. Dashboard (Flask) kann `erzeuge_token` direkt übernehmen,
Audio `pruefe_token`. Ist Audio nicht in Python geschrieben, gilt der Testvektor
unten: Mit demselben Geheimnis und Payload muss dieselbe Signatur herauskommen.

    python sso_referenz.py      -> führt die Selbstprüfung aus
"""
import base64, hashlib, hmac, json, secrets, time

AUD = "buero-audio"
GUELTIG_S = 60
TOLERANZ_S = 30


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def normalisiere(anmeldename: str) -> str:
    """'GEHBAUER\\DS' / 'ds@gehbauer.local' / 'DS' -> 'ds'"""
    n = anmeldename.strip()
    n = n.split("\\")[-1]
    n = n.split("@")[0]
    return n.lower()


def _signiere(geheimnis: str, payload_b64: str) -> str:
    return _b64(hmac.new(geheimnis.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest())


def erzeuge_token(geheimnis: str, anmeldename: str, anzeigename: str = "", jetzt: int | None = None,
                  nonce: str | None = None) -> str:
    iat = int(time.time()) if jetzt is None else jetzt
    payload = {
        "aud": AUD,
        "sub": normalisiere(anmeldename),
        "name": anzeigename,
        "iat": iat,
        "exp": iat + GUELTIG_S,
        "nonce": nonce or secrets.token_urlsafe(16),
    }
    p = _b64(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    return f"{p}.{_signiere(geheimnis, p)}"


class TokenFehler(Exception):
    """Grund nur fürs Log – dem Menschen immer dieselbe neutrale Seite zeigen."""


def pruefe_token(geheimnis: str, token: str, benutzte_nonces: dict, jetzt: int | None = None) -> dict:
    """Gibt den Payload zurück oder wirft TokenFehler.
    benutzte_nonces: dict nonce -> exp (wird hier gepflegt und aufgeräumt)."""
    now = int(time.time()) if jetzt is None else jetzt
    teile = token.split(".")
    if len(teile) != 2 or not all(teile):
        raise TokenFehler("format")
    p, sig = teile
    if not hmac.compare_digest(sig, _signiere(geheimnis, p)):
        raise TokenFehler("signatur")
    try:
        daten = json.loads(_unb64(p))
    except ValueError:
        raise TokenFehler("format")
    if daten.get("aud") != AUD:
        raise TokenFehler("aud")
    if not isinstance(daten.get("exp"), int) or now > daten["exp"] + TOLERANZ_S:
        raise TokenFehler("abgelaufen")
    for n, e in list(benutzte_nonces.items()):
        if now > e + TOLERANZ_S:
            del benutzte_nonces[n]
    nonce = daten.get("nonce")
    if not nonce or nonce in benutzte_nonces:
        raise TokenFehler("nonce")
    benutzte_nonces[nonce] = daten["exp"]
    if not daten.get("sub"):
        raise TokenFehler("benutzer")
    return daten


# ── Testvektor (fest; beide Seiten müssen exakt dasselbe Token erzeugen/akzeptieren) ──
TEST_GEHEIMNIS = "nur-zum-testen-niemals-produktiv-0123456789abcdef"
TEST_JETZT = 1763300000
TEST_NONCE = "AAAAAAAAAAAAAAAAAAAAAA"


def _selbstpruefung():
    t = erzeuge_token(TEST_GEHEIMNIS, "GEHBAUER\\DS", "Domenico S.", TEST_JETZT, TEST_NONCE)
    print("Testvektor-Token:", t)
    n = {}
    d = pruefe_token(TEST_GEHEIMNIS, t, n, TEST_JETZT + 5)
    assert d["sub"] == "ds" and d["exp"] == TEST_JETZT + 60
    for name, fall in [
        ("zweimal", lambda: pruefe_token(TEST_GEHEIMNIS, t, n, TEST_JETZT + 6)),
        ("signatur", lambda: pruefe_token("falsch", t, {}, TEST_JETZT)),
        ("abgelaufen", lambda: pruefe_token(TEST_GEHEIMNIS, t, {}, TEST_JETZT + 91)),
        ("format", lambda: pruefe_token(TEST_GEHEIMNIS, "kaputt", {}, TEST_JETZT)),
        ("aud", lambda: pruefe_token(TEST_GEHEIMNIS, _fremdes_aud(), {}, TEST_JETZT)),
    ]:
        try:
            fall()
        except TokenFehler as e:
            print(f"  abgewiesen ({name}): {e}")
        else:
            raise AssertionError(f"{name} wurde akzeptiert")
    print("Selbstprüfung bestanden.")


def _fremdes_aud():
    p = _b64(json.dumps({"aud": "anderes", "sub": "ds", "exp": TEST_JETZT + 60, "nonce": "x"}).encode())
    return f"{p}.{_signiere(TEST_GEHEIMNIS, p)}"


if __name__ == "__main__":
    _selbstpruefung()
