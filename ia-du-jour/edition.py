"""Contrôle et publication d'une édition — Python stdlib uniquement.

    python3 edition.py verifier edition.json [--candidats candidats.json]
    python3 edition.py publier  edition.json [--candidats candidats.json] [--editions editions]

`verifier` refuse l'édition (code de sortie 1) au premier manquement aux règles : c'est le
garde-fou contre un chiffre inventé ou un mot interdit, pas une suggestion.
`publier` revérifie, puis écrit l'édition dans `editions/AAAA-MM.json` et met `editions/index.json`
à jour : c'est ce que lit l'app. Il refuse de publier sans liste de mots interdits (MOTS_INTERDITS).
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from reglages import ICI, configuration, mots_interdits

MAX_SUJETS = 5
POUR = ("Côme", "Alix", "Vous deux")
USAGES = ("data-bi", "entretien", "outil", "general", "quotidien", "banque")
ORIGINES = ("article", "illustration")
MARQUE_ILLUSTRATION = "Par exemple"
CHAMPS = ("titre", "pour", "usage", "fait", "concretement", "origine_exemple", "lien")
AFFICHES = ("titre", "fait", "concretement")   # le texte que l'app montre

_NOMBRE = re.compile(r"\d+(?:[.,   ]\d+)*")


# ── Contrôle ─────────────────────────────────────────────────────────────────

def nombres(texte):
    """Les nombres d'un texte, normalisés : « 3 000 », « 3,000 » et « 3000 » → « 3000 » ;
    « 1,5 » et « 1.5 » → « 1.5 ». Un séparateur suivi de 3 chiffres est un séparateur de milliers."""
    vus = set()
    for brut in _NOMBRE.findall(texte or ""):
        morceaux = re.split(r"[.,   ]", brut)
        entier, reste = morceaux[0], morceaux[1:]
        decimale = ""
        for m in reste:
            if len(m) == 3 and not decimale:
                entier += m
            else:
                decimale = m
                break
        vus.add(entier + ("." + decimale if decimale else ""))
    return vus


def mots_trouves(texte, interdits):
    """Mots interdits présents dans un texte (mot entier, sans tenir compte de la casse)."""
    return [m for m in interdits if re.search(r"(?<!\w)" + re.escape(m) + r"(?!\w)", texte, re.IGNORECASE)]


def verifier(edition, candidats, interdits=()):
    """Liste des manquements (vide = édition conforme)."""
    pb = []
    sujets = edition.get("sujets", [])
    par_lien = {a["lien"]: a for a in candidats.get("articles", [])}
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(edition.get("date", ""))):
        pb.append("date absente ou mal écrite (AAAA-MM-JJ)")
    if not sujets and not edition.get("rien_de_notable"):
        pb.append("aucun sujet : mettre rien_de_notable à true")
    if sujets and edition.get("rien_de_notable"):
        pb.append("rien_de_notable à true alors qu'il y a des sujets")
    if len(sujets) > MAX_SUJETS:
        pb.append(f"{len(sujets)} sujets : {MAX_SUJETS} au plus")
    liens = [s.get("lien") for s in sujets]
    if len(set(liens)) != len(liens):
        pb.append("deux sujets ont le même lien")
    for i, s in enumerate(sujets, 1):
        nom = f"sujet {i} « {s.get('titre', '')[:40]} »"
        for champ in CHAMPS:
            if not s.get(champ):
                pb.append(f"{nom} : champ « {champ} » manquant")
        if s.get("pour") and s["pour"] not in POUR:
            pb.append(f"{nom} : pour = {s['pour']!r}, attendu l'un de {POUR}")
        if s.get("usage") and s["usage"] not in USAGES:
            pb.append(f"{nom} : usage = {s['usage']!r}, attendu l'un de {USAGES}")
        article = par_lien.get(s.get("lien"))
        # Le texte affiché seulement (le lien n'est pas affiché) : on peut parler d'une entreprise
        # interdite, sans la nommer.
        affiche = [s.get(c, "") for c in AFFICHES] + [(article or {}).get("source", "")]
        trouves = mots_trouves(" ".join(map(str, affiche)), interdits)
        if trouves:
            # on ne recopie pas le mot : la sortie de la routine est lisible dans son historique
            pb.append(f"{nom} : {len(trouves)} mot(s) interdit(s) dans le texte — en parler sans le nommer"
                      " (« un grand cabinet de conseil »), ou retirer le sujet")
        if article is None:
            pb.append(f"{nom} : le lien n'est pas un article collecté ce matin")
            continue
        source = " ".join([article.get("titre", ""), article.get("texte", ""), article.get("texte_page", "")])
        connus = nombres(source)
        a_verifier = s.get("titre", "") + " " + s.get("fait", "")
        origine = s.get("origine_exemple")
        if origine == "article":
            a_verifier += " " + s.get("concretement", "")
        elif origine == "illustration":
            ex = s.get("concretement", "")
            if not ex.startswith(MARQUE_ILLUSTRATION):
                pb.append(f"{nom} : un exemple illustratif commence par « {MARQUE_ILLUSTRATION} »")
            if re.search(r"\d", ex):
                pb.append(f"{nom} : un exemple illustratif ne contient aucun chiffre")
        elif origine:
            pb.append(f"{nom} : origine_exemple = {origine!r}, attendu l'un de {ORIGINES}")
        inconnus = sorted(nombres(a_verifier) - connus)
        if inconnus:
            pb.append(f"{nom} : chiffre(s) absent(s) de la source : {', '.join(inconnus)}")
    return pb


# ── Publication ──────────────────────────────────────────────────────────────

def a_publier(edition, candidats, maintenant):
    """L'édition telle que l'app la lit : champs connus seulement, source de chaque sujet ajoutée."""
    sources = {a["lien"]: a.get("source", "") for a in candidats.get("articles", [])}
    return {
        "date": edition["date"],
        "rien_de_notable": not edition.get("sujets"),
        "publie_le": maintenant.isoformat(timespec="minutes"),
        "sujets": [{**{c: s[c] for c in CHAMPS}, "source": sources.get(s["lien"], "")}
                   for s in edition.get("sujets", [])],
    }


def ranger(mois_existant, index_existant, publiee):
    """Range une édition dans son mois (la remplace si la date existe déjà) et met l'index à jour.
    Renvoie (mois, index)."""
    editions = [e for e in mois_existant.get("editions", []) if e["date"] != publiee["date"]]
    editions.append(publiee)
    editions.sort(key=lambda e: e["date"], reverse=True)
    mois = publiee["date"][:7]
    tous = sorted(set(index_existant.get("mois", [])) | {mois}, reverse=True)
    derniere = max(index_existant.get("derniere", ""), publiee["date"])
    return {"editions": editions}, {"mois": tous, "derniere": derniere}


def _lire(chemin, defaut):
    return json.loads(chemin.read_text(encoding="utf-8")) if chemin.exists() else defaut


def _ecrire(chemin, contenu):
    chemin.write_text(json.dumps(contenu, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def publier(edition, candidats, dossier, maintenant):
    dossier.mkdir(exist_ok=True)
    publiee = a_publier(edition, candidats, maintenant)
    chemin_mois = dossier / f"{publiee['date'][:7]}.json"
    mois, index = ranger(_lire(chemin_mois, {}), _lire(dossier / "index.json", {}), publiee)
    _ecrire(chemin_mois, mois)
    _ecrire(dossier / "index.json", index)
    return chemin_mois


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sous = p.add_subparsers(dest="cmd", required=True)
    for nom in ("verifier", "publier"):
        c = sous.add_parser(nom)
        c.add_argument("edition")
        c.add_argument("--candidats", default="candidats.json")
        if nom == "publier":
            c.add_argument("--editions", default=str(ICI / "editions"))
    args = p.parse_args(argv)
    interdits = mots_interdits(configuration())
    edition = json.loads(Path(args.edition).read_text(encoding="utf-8"))
    candidats = _lire(Path(args.candidats), {"articles": []})
    if not interdits:
        msg = "MOTS_INTERDITS absent (environnement ou .env) : les noms de famille et d'employeurs ne sont pas contrôlés"
        if args.cmd == "publier":
            sys.exit(msg + " — rien n'est publié.")
        print("⚠️ " + msg)
    pb = verifier(edition, candidats, interdits)
    for x in pb:
        print("✗", x)
    if pb:
        sys.exit(f"{len(pb)} manquement(s) : corriger ou retirer le sujet" + (" — rien n'est publié." if args.cmd == "publier" else ""))
    print("✓ édition conforme")
    if args.cmd == "publier":
        chemin = publier(edition, candidats, Path(args.editions), datetime.now(timezone.utc))
        print(f"✓ publiée dans {chemin.name} — {len(edition.get('sujets', []))} sujet(s)")


if __name__ == "__main__":
    main()
