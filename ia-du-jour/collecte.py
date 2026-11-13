"""Collecte des articles du matin — Python stdlib uniquement.

    python3 collecte.py candidats [--heures 24] [--editions editions] [--sortie candidats.json]
    python3 collecte.py page <lien> [--candidats candidats.json]
    python3 collecte.py tester
    python3 collecte.py domaines

Le calcul (lecture d'un flux, nettoyage, filtrage) est en fonctions pures, testées
sans réseau ; seul `telecharger` touche au réseau.
"""
import argparse
import html
import json
import re
import ssl
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

ICI = Path(__file__).resolve().parent
TEXTE_MAX = 1200        # texte gardé par article dans candidats.json
PAGE_MAX = 8000         # texte gardé d'une page d'article lue en entier
AVANCE_TOLEREE = timedelta(hours=1)   # au-delà : article daté dans le futur (événement), écarté

ATOM = "{http://www.w3.org/2005/Atom}"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}encoded"
DC_DATE = "{http://purl.org/dc/elements/1.1/}date"


# ── Fonctions pures ──────────────────────────────────────────────────────────

def lire_date(txt):
    """Date RFC 822 (RSS) ou ISO 8601 (Atom) → datetime UTC, ou None."""
    if not txt:
        return None
    txt = txt.strip()
    try:
        d = parsedate_to_datetime(txt)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(txt.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def nettoyer(fragment):
    """HTML → texte brut sur une ligne."""
    if not fragment:
        return ""
    sans_blocs = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", fragment)
    sans_balises = re.sub(r"<[^>]+>", " ", sans_blocs)
    return re.sub(r"\s+", " ", html.unescape(sans_balises)).strip()


def paragraphes(page_html):
    """Page d'article → texte de ses paragraphes seulement : les menus et les pieds de page
    ne sont pas dans des <p>, et mangeraient la limite PAGE_MAX."""
    blocs = [nettoyer(p) for p in re.findall(r"(?is)<p[\s>].*?</p>", page_html)]
    gardes = [b for b in blocs if len(b) >= 40]
    return " ".join(gardes) if gardes else nettoyer(page_html)


def lire_flux(contenu, source):
    """Contenu XML d'un flux RSS ou Atom → liste d'articles (dict)."""
    racine = ET.fromstring(contenu)
    articles = []
    for it in racine.iter("item"):
        lien = (it.findtext("link") or "").strip()
        texte = nettoyer(it.findtext(CONTENT) or "") or nettoyer(it.findtext("description") or "")
        titre = nettoyer(it.findtext("title") or "")
        journal = nettoyer(it.findtext("source") or "")   # agrégateurs (Google Actualités) : le vrai journal
        if journal and titre.endswith(" - " + journal):
            titre = titre[: -len(" - " + journal)]
        articles.append({
            "titre": titre,
            "lien": lien,
            "date": lire_date(it.findtext("pubDate") or it.findtext(DC_DATE)),
            "texte": texte,
            "journal": journal,
        })
    for e in racine.iter(ATOM + "entry"):
        lien = ""
        for l in e.findall(ATOM + "link"):
            if l.get("rel", "alternate") == "alternate":
                lien = l.get("href", "")
                break
        texte = nettoyer(e.findtext(ATOM + "content") or "") or nettoyer(e.findtext(ATOM + "summary") or "")
        articles.append({
            "titre": nettoyer(e.findtext(ATOM + "title") or ""),
            "lien": lien.strip(),
            "date": lire_date(e.findtext(ATOM + "published") or e.findtext(ATOM + "updated")),
            "texte": texte,
        })
    for a in articles:
        a["source"] = a.pop("journal", "") or source["nom"]
        a["rubrique"] = source["rubrique"]
    return articles


def filtrer(articles, maintenant, heures, deja_envoyes):
    """Garde les articles publiés dans les `heures` dernières heures, jamais envoyés,
    sans doublon de lien. Un article sans date ou daté dans le futur est écarté."""
    debut = maintenant - timedelta(hours=heures)
    vus = set(deja_envoyes)
    gardes = []
    for a in articles:
        if not a["lien"] or a["lien"] in vus or a["date"] is None:
            continue
        if not (debut <= a["date"] <= maintenant + AVANCE_TOLEREE):
            continue
        vus.add(a["lien"])
        gardes.append({**a, "texte": a["texte"][:TEXTE_MAX]})
    gardes.sort(key=lambda a: a["date"], reverse=True)
    return gardes


def liens_publies(editions_par_mois):
    """Liens de tous les sujets et autres titres déjà publiés : la mémoire de ce qui est déjà paru."""
    return {s["lien"] for mois in editions_par_mois for e in mois.get("editions", [])
            for s in e.get("sujets", []) + e.get("autres", [])}


def domaines(config):
    """Domaines à autoriser dans l'environnement cloud (réseau Custom)."""
    hotes = {urlparse(s["url"]).hostname for s in config["sources"]}
    return sorted(hotes | set(config.get("domaines_en_plus", [])))


# ── Réseau ───────────────────────────────────────────────────────────────────

def _contexte_ssl():
    # Le Python de python.org sur macOS n'a pas de certificats tant que
    # « Install Certificates.command » n'a pas tourné : certifi s'il est là.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def telecharger(url, delai=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (newsletter-ia du foyer)"})
    with urllib.request.urlopen(req, timeout=delai, context=_contexte_ssl()) as r:
        return r.read()


def _lire_source(source):
    try:
        return source, lire_flux(telecharger(source["url"]), source), None
    except Exception as e:  # un flux en panne ne doit pas bloquer les autres
        return source, [], f"{type(e).__name__}: {e}"


def collecter(config):
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(_lire_source, config["sources"]))


# ── Commandes ────────────────────────────────────────────────────────────────

def _charger(chemin, defaut):
    p = Path(chemin)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else defaut


def cmd_candidats(args, config):
    maintenant = datetime.now(timezone.utc)
    dossier = Path(args.editions)
    mois = [json.loads(p.read_text(encoding="utf-8")) for p in dossier.glob("????-??.json")] if dossier.exists() else []
    deja = liens_publies(mois)
    tous, pannes = [], []
    for source, articles, erreur in collecter(config):
        if erreur:
            pannes.append({"source": source["nom"], "erreur": erreur})
        tous += articles
    gardes = filtrer(tous, maintenant, args.heures, deja)
    sortie = {
        "collecte": maintenant.isoformat(timespec="minutes"),
        "fenetre_heures": args.heures,
        "pannes": pannes,
        "articles": [{**a, "date": a["date"].isoformat(timespec="minutes")} for a in gardes],
    }
    Path(args.sortie).write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(gardes)} articles retenus sur {len(tous)} lus, {len(pannes)} flux en panne → {args.sortie}")
    for p in pannes:
        print(f"  ✗ {p['source']} : {p['erreur']}")


def cmd_page(args, config):
    """Lit la page d'un article retenu et ajoute son texte à candidats.json :
    c'est sur ce texte, en plus de celui du flux, que les chiffres sont vérifiés."""
    cand = _charger(args.candidats, None)
    if cand is None:
        sys.exit(f"{args.candidats} introuvable : lancer d'abord `candidats`")
    article = next((a for a in cand["articles"] if a["lien"] == args.lien), None)
    if article is None:
        sys.exit("Ce lien n'est pas dans les candidats : on ne lit que des articles collectés.")
    article["texte_page"] = paragraphes(telecharger(args.lien).decode("utf-8", "replace"))[:PAGE_MAX]
    Path(args.candidats).write_text(json.dumps(cand, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(article['texte_page'])} caractères ajoutés pour « {article['titre'][:60]} »")


def cmd_tester(args, config):
    maintenant = datetime.now(timezone.utc)
    for source, articles, erreur in collecter(config):
        if erreur:
            print(f"✗ {source['nom']:<34} {erreur}")
            continue
        semaine = filtrer(articles, maintenant, 24 * 7, [])
        dates = [a["date"] for a in articles if a["date"]]
        dernier = max(dates).strftime("%Y-%m-%d") if dates else "?"
        print(f"✓ {source['nom']:<34} {len(semaine):>3} sur 7 jours · dernier {dernier}")


def cmd_domaines(args, config):
    print("\n".join(domaines(config)))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sources", default=str(ICI / "sources.json"))
    sous = p.add_subparsers(dest="cmd", required=True)
    c = sous.add_parser("candidats")
    c.add_argument("--heures", type=int, default=24)
    c.add_argument("--editions", default=str(ICI / "editions"))
    c.add_argument("--sortie", default="candidats.json")
    pg = sous.add_parser("page")
    pg.add_argument("lien")
    pg.add_argument("--candidats", default="candidats.json")
    sous.add_parser("tester")
    sous.add_parser("domaines")
    args = p.parse_args(argv)
    config = json.loads(Path(args.sources).read_text(encoding="utf-8"))
    {"candidats": cmd_candidats, "page": cmd_page, "tester": cmd_tester, "domaines": cmd_domaines}[args.cmd](args, config)


if __name__ == "__main__":
    main()
