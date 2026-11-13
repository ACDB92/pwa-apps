"""Notification du matin, par les notifications de l'app (Web Push) — aucune appli tierce.

    python3 notifier.py [--attendre 1800]    # attend que l'édition soit en ligne, puis notifie
    python3 notifier.py --essai              # notification d'essai, sans attendre

Les téléphones s'abonnent dans l'app (« Activer les notifications ») ; chaque abonnement est
copié une fois dans l'environnement (PUSH_ABONNEMENT_COME, PUSH_ABONNEMENT_ALIX…), avec la clé
privée VAPID (VAPID_PRIVEE). Rien de tout ça n'est versionné. Dépendance : `cryptography`.

La notification ne part **qu'une fois l'édition du jour visible en ligne** : sinon, un toucher
ouvrirait l'édition de la veille. Si elle n'est pas en ligne au bout de `--attendre` secondes, rien
ne part et le script échoue — un matin sans notification signale une panne.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from collecte import _contexte_ssl
from reglages import ICI, configuration

APP = "https://acdb92.github.io/pwa-apps/ia-du-jour/"


# ── Fonctions pures ──────────────────────────────────────────────────────────

def message(edition, app=APP):
    """La notification : le titre de la une et le nombre d'autres sujets, ou « Rien de notable »."""
    sujets = edition.get("sujets", [])
    if not sujets:
        texte = "Rien de notable aujourd'hui."
    else:
        texte = sujets[0]["titre"] + (f" · +{len(sujets) - 1}" if len(sujets) > 1 else "")
        if edition.get("type") == "semaine":
            texte = "La semaine en 5 · " + texte
    url = f"{app}#{edition['date']}" if edition.get("date") else app
    return {"title": "L'IA du jour", "body": texte, "url": url}


def abonnements(env):
    """Les abonnements des téléphones : variables PUSH_ABONNEMENT_<NOM> (JSON copié depuis l'app)."""
    res = {}
    for cle in sorted(env):
        if cle.startswith("PUSH_ABONNEMENT_") and env[cle].strip():
            a = json.loads(env[cle])
            if not (a.get("endpoint", "").startswith("https://") and a.get("keys", {}).get("p256dh") and a["keys"].get("auth")):
                raise ValueError(f"{cle} : abonnement incomplet — le recopier depuis l'app")
            res[cle.removeprefix("PUSH_ABONNEMENT_").lower()] = a
    return res


def derniere_edition(dossier):
    """L'édition la plus récente du dossier `editions/` (celle que la routine vient de publier)."""
    index = json.loads((dossier / "index.json").read_text(encoding="utf-8"))
    mois = json.loads((dossier / f"{index['derniere'][:7]}.json").read_text(encoding="utf-8"))
    return next(e for e in mois["editions"] if e["date"] == index["derniere"])


# ── Réseau ───────────────────────────────────────────────────────────────────

def _lire(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ia-du-jour", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=20, context=_contexte_ssl()) as r:
        return json.loads(r.read())


def attendre_en_ligne(date, app, delai, pas=30):
    """Vrai dès que l'index publié en ligne annonce `date`, faux au bout de `delai` secondes."""
    fin = time.monotonic() + delai
    while True:
        try:
            if _lire(f"{app}editions/index.json?t={int(time.time())}").get("derniere") == date:
                return True
        except Exception as e:  # page pas encore à jour, réseau lent : on réessaie
            print(f"  (pas encore : {type(e).__name__})")
        if time.monotonic() >= fin:
            return False
        time.sleep(pas)


def pousser(abonnement, notif, cle_privee, contact):
    """Envoie une notification ; renvoie « ok », « expiré » (à réactiver dans l'app) ou l'erreur."""
    import webpush   # `cryptography` n'est chargé que pour envoyer
    url, entetes, corps = webpush.requete(abonnement, json.dumps(notif, ensure_ascii=False), cle_privee, contact)
    req = urllib.request.Request(url, data=corps, headers=entetes, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20, context=_contexte_ssl()):
            return "ok"
    except urllib.error.HTTPError as e:
        return "expiré" if e.code in (404, 410) else f"refusé ({e.code})"
    except urllib.error.URLError as e:
        return f"injoignable ({e.reason})"


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--editions", default=str(ICI / "editions"))
    p.add_argument("--attendre", type=int, default=1800, help="secondes d'attente de la mise en ligne")
    p.add_argument("--essai", action="store_true")
    args = p.parse_args(argv)
    env = configuration()
    app = env.get("APP_URL", APP)
    abos = abonnements(env)
    if not abos or not env.get("VAPID_PRIVEE"):
        sys.exit("Aucun abonnement (PUSH_ABONNEMENT_*) ou pas de VAPID_PRIVEE : aucune notification envoyée.")
    if args.essai:
        notif = {"title": "L'IA du jour", "body": "Notification d'essai : si tu la lis, tout marche.", "url": app}
    else:
        ed = derniere_edition(Path(args.editions))
        print(f"Attente de la mise en ligne de l'édition du {ed['date']}…")
        if not attendre_en_ligne(ed["date"], app, args.attendre):
            sys.exit(f"L'édition du {ed['date']} n'est pas en ligne après {args.attendre} s : pas de notification.")
        notif = message(ed, app)
    import webpush
    cle = webpush.cle_privee_depuis(env["VAPID_PRIVEE"])
    resultats = {nom: pousser(a, notif, cle, app) for nom, a in abos.items()}
    for nom, r in resultats.items():
        print(f"{'✓' if r == 'ok' else '✗'} {nom} : {r}" + (" — réactiver les notifications dans l'app" if r == "expiré" else ""))
    if "ok" not in resultats.values():
        sys.exit("Aucune notification n'est partie.")
    print(f"« {notif['body']} »")


if __name__ == "__main__":
    main()
