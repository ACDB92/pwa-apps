"""Réglages lus dans l'environnement, ou dans un fichier `.env` de ce dossier (ignoré par git).

    MOTS_INTERDITS   mots qui ne doivent jamais paraître dans l'app publique (noms de famille,
                     employeurs), séparés par des virgules. Jamais écrits dans un fichier versionné :
                     la liste elle-même dirait ce qu'elle cache.
"""
import os
from pathlib import Path

ICI = Path(__file__).resolve().parent


def lire_env(texte):
    """Contenu d'un fichier .env → dict (lignes CLE=valeur, # pour commenter)."""
    valeurs = {}
    for ligne in texte.splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("#") or "=" not in ligne:
            continue
        cle, _, val = ligne.partition("=")
        valeurs[cle.strip()] = val.strip().strip('"').strip("'")
    return valeurs


def configuration():
    env = dict(os.environ)
    fichier = ICI / ".env"
    if fichier.exists():
        env = {**lire_env(fichier.read_text(encoding="utf-8")), **env}
    return env


def mots_interdits(env):
    return [m.strip() for m in env.get("MOTS_INTERDITS", "").split(",") if m.strip()]
