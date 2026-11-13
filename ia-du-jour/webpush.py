"""Notifications de l'app (Web Push) : chiffrement RFC 8291 (aes128gcm) et signature VAPID (RFC 8292).

Une seule dépendance, reconnue : `cryptography` (pip install cryptography). Les notifications
passent par le service du téléphone (Apple pour l'iPhone, Google pour Android) : aucune appli tierce.

    python3 webpush.py cles     # génère une paire de clés VAPID (une fois) : publique → app.js, privée → .env

Secrets : la clé privée VAPID (VAPID_PRIVEE) et les abonnements (PUSH_ABONNEMENT_*) vivent dans
l'environnement ou le .env, jamais dans un fichier versionné. La clé publique, elle, est publique.
"""
import base64
import hashlib
import hmac
import json
import os
import struct
import sys
import time
from urllib.parse import urlparse

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

TAILLE_ENREGISTREMENT = 4096


def b64(donnees):
    return base64.urlsafe_b64encode(donnees).rstrip(b"=").decode()


def d64(texte):
    return base64.urlsafe_b64decode(texte + "=" * (-len(texte) % 4))


def _hmac(cle, msg):
    return hmac.new(cle, msg, hashlib.sha256).digest()


def _publique_brute(cle_privee):
    return cle_privee.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def cle_privee_depuis(d_b64):
    return ec.derive_private_key(int.from_bytes(d64(d_b64), "big"), ec.SECP256R1())


# ── Chiffrement du message (RFC 8291) ────────────────────────────────────────

def chiffrer(texte, p256dh, auth, cle_ephemere=None, sel=None):
    """Corps chiffré d'une notification pour un abonnement (clés `p256dh` et `auth` en base64url).
    `cle_ephemere` et `sel` ne se fixent que pour les tests (vecteur de la RFC) : sinon, aléatoires."""
    ua_publique = d64(p256dh)
    secret_auth = d64(auth)
    as_privee = cle_ephemere or ec.generate_private_key(ec.SECP256R1())
    as_publique = _publique_brute(as_privee)
    sel = sel or os.urandom(16)
    ecdh = as_privee.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_publique))
    prk_cle = _hmac(secret_auth, ecdh)
    ikm = _hmac(prk_cle, b"WebPush: info\x00" + ua_publique + as_publique + b"\x01")
    prk = _hmac(sel, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    chiffre = AESGCM(cek).encrypt(nonce, texte.encode() + b"\x02", None)
    entete = sel + struct.pack("!IB", TAILLE_ENREGISTREMENT, len(as_publique)) + as_publique
    return entete + chiffre


# ── Signature VAPID (RFC 8292) ───────────────────────────────────────────────

def jeton_vapid(endpoint, cle_privee, contact, maintenant=None):
    """Jeton signé (ES256) qui prouve au service de notification que l'envoi vient de nous."""
    u = urlparse(endpoint)
    exp = int(maintenant or time.time()) + 12 * 3600
    entete = b64(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    corps = b64(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": exp, "sub": contact}, separators=(",", ":")).encode())
    signe = f"{entete}.{corps}".encode()
    r, s = decode_dss_signature(cle_privee.sign(signe, ec.ECDSA(hashes.SHA256())))
    return f"{entete}.{corps}.{b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"


def requete(abonnement, texte, cle_privee, contact, ttl=86400):
    """(url, en-têtes, corps) de l'envoi d'une notification à un abonnement."""
    cles = abonnement["keys"]
    jeton = jeton_vapid(abonnement["endpoint"], cle_privee, contact)
    entetes = {
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(ttl),
        "Urgency": "normal",
        "Authorization": f"vapid t={jeton}, k={b64(_publique_brute(cle_privee))}",
    }
    return abonnement["endpoint"], entetes, chiffrer(texte, cles["p256dh"], cles["auth"])


def nouvelles_cles():
    privee = ec.generate_private_key(ec.SECP256R1())
    return b64(privee.private_numbers().private_value.to_bytes(32, "big")), b64(_publique_brute(privee))


if __name__ == "__main__":
    if sys.argv[1:] != ["cles"]:
        sys.exit(__doc__)
    privee, publique = nouvelles_cles()
    print(f"VAPID_PRIVEE={privee}\nclé publique (app.js) : {publique}")
