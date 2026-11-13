"""Contrôle et publication d'une édition — Python stdlib uniquement.

    python3 edition.py verifier edition.json [--candidats candidats.json] [--editions editions]
    python3 edition.py publier  edition.json [--candidats candidats.json] [--editions editions]

`verifier` refuse l'édition (code de sortie 1) au premier manquement aux règles : c'est le
garde-fou contre un chiffre inventé, un mot interdit, du jargon non expliqué, un nom inventé…
pas une suggestion. `publier` revérifie, puis écrit l'édition dans `editions/AAAA-MM.json` et met
`editions/index.json` à jour : c'est ce que lit l'app. Il refuse de publier sans MOTS_INTERDITS.

Deux sortes d'édition :
- **du jour** : jusqu'à 5 sujets tirés des articles collectés ce matin ;
- **« la semaine en 5 »** (`"type": "semaine"`, le dimanche) : 5 sujets repris **tels quels** des
  éditions des 6 jours précédents, chacun avec `repris_du`.
Chacune porte un **lexique** de 5 termes, un par thème au moins.
"""
import argparse
import json
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from reglages import ICI, configuration, mots_interdits

MAX_SUJETS = 5
POUR = ("Côme", "Alix", "Vous deux")
USAGES = ("data-bi", "entretien", "outil", "general", "quotidien", "banque")
ORIGINES = ("article", "illustration")
MARQUE_ILLUSTRATION = "Par exemple"
CHAMPS = ("titre", "pour", "usage", "fait", "concretement", "origine_exemple", "lien")
AFFICHES = ("titre", "fait", "concretement")   # le texte que l'app montre
MAX_TITRE = 90
MAX_SUJET = 800                                # fait + exemple, en caractères

# Jargon : toléré seulement s'il est expliqué juste après (« c'est-à-dire », parenthèse…) ou s'il
# figure dans le lexique du jour (l'app le rend alors touchable).
JARGON = ("LLM", "token", "tokens", "benchmark", "benchmarks", "fine-tuning", "API", "API", "open source",
          "open-source", "GPU", "GPUs", "inférence", "prompt", "prompts", "RAG", "embedding", "embeddings",
          "machine learning", "deep learning", "SaaS", "modèle de langage", "modèles de langage",
          "modèle de fondation", "neocloud", "hyperscaler", "hyperscalers", "datacenter", "data center")
EXPLICATIONS = ("c'est-à-dire", "c’est-à-dire", "(", "autrement dit", "soit ", "qui permet", "qui sert",
                " : ", "—", "dit autrement")
FENETRE_EXPLICATION = 90
TUTOIEMENT = re.compile(r"(?<![\w'’])(tu|toi|ton|ta|tes)(?![\w'’])|(?<![\w'’])t['’](?=\w)", re.IGNORECASE)
NOMS_PERMIS = {"IA", "Côme", "Alix", "Par"}

MAX_AUTRES = 10                # « les autres titres du jour » : panorama, sans explication

LEXIQUE_TAILLE = 5
THEMES = ("ia", "data-bi", "banque", "quotidien")
MAX_DEFINITION, MAX_EXEMPLE = 320, 260
LEXIQUE_SANS_REPETITION = 60   # jours

_NOMBRE = re.compile(r"\d+(?:[.,   ]\d+)*")


# ── Outils ───────────────────────────────────────────────────────────────────

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
    """Mots présents dans un texte (mot entier, sans tenir compte de la casse)."""
    return [m for m in interdits if re.search(r"(?<!\w)" + re.escape(m) + r"(?!\w)", texte, re.IGNORECASE)]


def cle_terme(terme):
    """« Couche sémantique » et « couche semantique » sont le même terme."""
    t = unicodedata.normalize("NFD", terme).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def jargon_non_explique(texte, autorises=()):
    """Termes de jargon employés sans explication juste après (et absents du lexique du jour)."""
    autorises = {cle_terme(a) for a in autorises}
    fautes = []
    for terme in dict.fromkeys(JARGON):
        if cle_terme(terme) in autorises:
            continue
        for m in re.finditer(r"(?<![\w-])" + re.escape(terme) + r"(?![\w-])", texte, re.IGNORECASE):
            suite = texte[m.end():m.end() + FENETRE_EXPLICATION]
            if not any(e in suite for e in EXPLICATIONS):
                fautes.append(m.group(0))
                break
    return fautes


def noms_inventes(exemple, reference):
    """Mots à majuscule d'un exemple illustratif (hors début de phrase et hors sigles) absents de
    `reference` : un prénom, une entreprise ou un lieu inventés, que l'exemple ne doit pas contenir."""
    res = []
    for phrase in re.split(r"(?<=[.!?:«])\s+|«\s*", exemple):
        mots = re.findall(r"[A-ZÀ-ÖØ-Þ][\w’'-]*", phrase)
        debut = re.match(r"\W*([\w’'-]+)", phrase)
        for i, mot in enumerate(mots):
            if debut and i == 0 and phrase.lstrip(" «\"(").startswith(mot):
                continue
            mot = mot.rstrip("’'")
            if mot in NOMS_PERMIS or len(mot) < 2 or mot.isupper():   # sigles (IBAN, PDF…) : pas des noms
                continue
            if mot not in reference:
                res.append(mot)
    return sorted(set(res))


# ── Contrôle ─────────────────────────────────────────────────────────────────

def _controle_redaction(s, nom, lexique_du_jour, reference, pb):
    """Ce qu'un lecteur non technicien remarquerait : jargon, tutoiement mal placé, longueur, nom inventé."""
    texte = " ".join(str(s.get(c, "")) for c in AFFICHES)
    termes = [t.get("terme", "") for t in lexique_du_jour]
    fautes = jargon_non_explique(texte, termes)
    if fautes:
        pb.append(f"{nom} : jargon non expliqué ({', '.join(fautes)}) — l'expliquer juste après, ou l'éviter")
    if s.get("pour") == "Vous deux" and TUTOIEMENT.search(texte):
        pb.append(f"{nom} : « tu » dans un sujet pour vous deux — écrire « vous »")
    if len(s.get("titre", "")) > MAX_TITRE:
        pb.append(f"{nom} : titre de {len(s['titre'])} caractères ({MAX_TITRE} au plus)")
    longueur = len(s.get("fait", "")) + len(s.get("concretement", ""))
    if longueur > MAX_SUJET:
        pb.append(f"{nom} : {longueur} caractères pour le fait et l'exemple ({MAX_SUJET} au plus)")
    if s.get("origine_exemple") == "illustration":
        inventes = noms_inventes(s.get("concretement", ""), reference)
        if inventes:
            pb.append(f"{nom} : nom propre absent de l'article dans l'exemple ({', '.join(inventes)}) —"
                      " un exemple illustratif ne nomme ni personne ni entreprise")


def _controle_lexique(lexique, termes_recents, interdits, pb):
    if len(lexique) != LEXIQUE_TAILLE:
        pb.append(f"lexique : {len(lexique)} terme(s), il en faut {LEXIQUE_TAILLE}")
    vus = set()
    for t in lexique:
        nom = f"lexique « {t.get('terme', '')} »"
        for champ in ("terme", "theme", "definition", "exemple"):
            if not t.get(champ):
                pb.append(f"{nom} : champ « {champ} » manquant")
        if t.get("theme") and t["theme"] not in THEMES:
            pb.append(f"{nom} : theme = {t['theme']!r}, attendu l'un de {THEMES}")
        cle = cle_terme(t.get("terme", ""))
        if cle in vus:
            pb.append(f"{nom} : en double")
        vus.add(cle)
        if cle in termes_recents:
            pb.append(f"{nom} : déjà paru il y a moins de {LEXIQUE_SANS_REPETITION} jours — en choisir un autre")
        if re.search(r"\d", t.get("definition", "") + t.get("exemple", "")):
            pb.append(f"{nom} : aucun chiffre dans le lexique (rien ne permet de les vérifier)")
        if len(t.get("definition", "")) > MAX_DEFINITION or len(t.get("exemple", "")) > MAX_EXEMPLE:
            pb.append(f"{nom} : trop long (définition {MAX_DEFINITION}, exemple {MAX_EXEMPLE} caractères au plus)")
        if mots_trouves(" ".join(str(v) for v in t.values()), interdits):
            pb.append(f"{nom} : mot interdit — en parler sans le nommer")
    manquants = [th for th in THEMES if th not in {t.get("theme") for t in lexique}]
    if manquants and len(lexique) == LEXIQUE_TAILLE:
        pb.append(f"lexique : thème(s) absent(s) : {', '.join(manquants)} — au moins un terme par thème")


def termes_recents(publiees, jour):
    """Termes du lexique parus dans les LEXIQUE_SANS_REPETITION jours avant `jour`."""
    debut = (date.fromisoformat(jour) - timedelta(days=LEXIQUE_SANS_REPETITION)).isoformat()
    return {cle_terme(t["terme"]) for e in publiees if debut <= e["date"] < jour for t in e.get("lexique", [])}


def verifier(edition, candidats, interdits=(), publiees=()):
    """Liste des manquements (vide = édition conforme). `publiees` : les éditions déjà parues
    (pour la semaine en 5 et le lexique)."""
    pb = []
    sujets = edition.get("sujets", [])
    jour = str(edition.get("date", ""))
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", jour):
        return ["date absente ou mal écrite (AAAA-MM-JJ)"]
    semaine = edition.get("type") == "semaine"
    if edition.get("type") not in (None, "jour", "semaine"):
        pb.append(f"type = {edition['type']!r}, attendu « jour » ou « semaine »")
    if semaine and date.fromisoformat(jour).weekday() != 6:
        pb.append("« la semaine en 5 » ne paraît que le dimanche")
    if not sujets and not edition.get("rien_de_notable"):
        pb.append("aucun sujet : mettre rien_de_notable à true")
    if sujets and edition.get("rien_de_notable"):
        pb.append("rien_de_notable à true alors qu'il y a des sujets")
    if len(sujets) > MAX_SUJETS:
        pb.append(f"{len(sujets)} sujets : {MAX_SUJETS} au plus")
    liens = [s.get("lien") for s in sujets]
    if len(set(liens)) != len(liens):
        pb.append("deux sujets ont le même lien")
    lexique = edition.get("lexique", [])
    _controle_lexique(lexique, termes_recents(publiees, jour), interdits, pb)
    autres = edition.get("autres", [])
    if semaine:
        if autres:
            pb.append("pas d'« autres titres » le dimanche (la semaine en 5 suffit)")
        _controle_reprises(sujets, jour, publiees, pb)
        return pb
    par_lien = {a["lien"]: a for a in candidats.get("articles", [])}
    _controle_autres(autres, par_lien, set(liens), lexique, interdits, pb)
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
        if mots_trouves(" ".join(map(str, affiche)), interdits):
            # on ne recopie pas le mot : la sortie de la routine est lisible dans son historique
            pb.append(f"{nom} : mot(s) interdit(s) dans le texte — en parler sans le nommer"
                      " (« un grand cabinet de conseil »), ou retirer le sujet")
        if article is None:
            pb.append(f"{nom} : le lien n'est pas un article collecté ce matin")
            continue
        source = " ".join([article.get("titre", ""), article.get("texte", ""), article.get("texte_page", "")])
        _controle_redaction(s, nom, lexique, source + " " + s.get("titre", "") + " " + s.get("fait", ""), pb)
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


def _controle_autres(autres, par_lien, liens_sujets, lexique, interdits, pb):
    """Les autres titres du jour : une ligne chacun, tirée d'un article collecté ce matin."""
    if len(autres) > MAX_AUTRES:
        pb.append(f"autres titres : {len(autres)}, {MAX_AUTRES} au plus")
    vus = set()
    for i, a in enumerate(autres, 1):
        nom = f"autre titre {i} « {a.get('titre', '')[:40]} »"
        article = par_lien.get(a.get("lien"))
        if not a.get("titre"):
            pb.append(f"{nom} : titre manquant")
        if article is None:
            pb.append(f"{nom} : le lien n'est pas un article collecté ce matin")
            continue
        if a["lien"] in liens_sujets or a["lien"] in vus:
            pb.append(f"{nom} : déjà dans l'édition")
        vus.add(a["lien"])
        titre = a.get("titre", "")
        if len(titre) > MAX_TITRE:
            pb.append(f"{nom} : {len(titre)} caractères ({MAX_TITRE} au plus)")
        if mots_trouves(titre + " " + article.get("source", ""), interdits):
            pb.append(f"{nom} : mot(s) interdit(s) — en parler sans le nommer, ou le retirer")
        fautes = jargon_non_explique(titre, [t.get("terme", "") for t in lexique])
        if fautes:
            pb.append(f"{nom} : jargon ({', '.join(fautes)}) — le dire en mots simples")
        source = " ".join([article.get("titre", ""), article.get("texte", ""), article.get("texte_page", "")])
        inconnus = sorted(nombres(titre) - nombres(source))
        if inconnus:
            pb.append(f"{nom} : chiffre(s) absent(s) de la source : {', '.join(inconnus)}")


def _controle_reprises(sujets, jour, publiees, pb):
    """La semaine en 5 : chaque sujet est repris **tel quel** d'une édition des 6 jours précédents
    (déjà contrôlée à sa parution), avec la date d'origine dans `repris_du`."""
    debut = (date.fromisoformat(jour) - timedelta(days=6)).isoformat()
    parus = {(e["date"], s["lien"]): s for e in publiees if debut <= e["date"] < jour
             and e.get("type") != "semaine" for s in e.get("sujets", [])}
    for i, s in enumerate(sujets, 1):
        nom = f"sujet {i} « {s.get('titre', '')[:40]} »"
        origine = parus.get((s.get("repris_du"), s.get("lien")))
        if origine is None:
            pb.append(f"{nom} : pas trouvé dans les éditions des 6 jours précédents (vérifier lien et repris_du)")
        elif any(s.get(c) != origine.get(c) for c in CHAMPS):
            pb.append(f"{nom} : un sujet repris se recopie tel quel, sans retouche")


# ── Publication ──────────────────────────────────────────────────────────────

def a_publier(edition, candidats, maintenant):
    """L'édition telle que l'app la lit : champs connus seulement, source de chaque sujet ajoutée."""
    sources = {a["lien"]: a.get("source", "") for a in candidats.get("articles", [])}
    semaine = edition.get("type") == "semaine"
    sujets = []
    for s in edition.get("sujets", []):
        p = {c: s[c] for c in CHAMPS}
        p["source"] = s.get("source", "") if semaine else sources.get(s["lien"], "")
        if semaine:
            p["repris_du"] = s["repris_du"]
        sujets.append(p)
    publiee = {
        "date": edition["date"],
        "type": "semaine" if semaine else "jour",
        "rien_de_notable": not sujets,
        "publie_le": maintenant.isoformat(timespec="minutes"),
        "sujets": sujets,
    }
    if edition.get("autres") and not semaine:
        publiee["autres"] = [{"titre": a["titre"], "lien": a["lien"], "source": sources.get(a["lien"], "")}
                             for a in edition["autres"]]
    if edition.get("lexique"):
        publiee["lexique"] = [{c: t[c] for c in ("terme", "theme", "definition", "exemple")} for t in edition["lexique"]]
    return publiee


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


def editions_publiees(dossier):
    return [e for p in sorted(Path(dossier).glob("????-??.json")) for e in _lire(p, {}).get("editions", [])]


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
        c.add_argument("--editions", default=str(ICI / "editions"))
    args = p.parse_args(argv)
    interdits = mots_interdits(configuration())
    edition = json.loads(Path(args.edition).read_text(encoding="utf-8"))
    candidats = _lire(Path(args.candidats), {"articles": []})
    publiees = [e for e in editions_publiees(args.editions) if e["date"] != edition.get("date")]
    if not interdits:
        msg = "MOTS_INTERDITS absent (environnement ou .env) : les noms de famille et d'employeurs ne sont pas contrôlés"
        if args.cmd == "publier":
            sys.exit(msg + " — rien n'est publié.")
        print("⚠️ " + msg)
    pb = verifier(edition, candidats, interdits, publiees)
    for x in pb:
        print("✗", x)
    if pb:
        sys.exit(f"{len(pb)} manquement(s) : corriger ou retirer le sujet" + (" — rien n'est publié." if args.cmd == "publier" else ""))
    print("✓ édition conforme")
    if args.cmd == "publier":
        chemin = publier(edition, candidats, Path(args.editions), datetime.now(timezone.utc))
        print(f"✓ publiée dans {chemin.name} — {len(edition.get('sujets', []))} sujet(s), {len(edition.get('lexique', []))} terme(s)")


if __name__ == "__main__":
    main()
