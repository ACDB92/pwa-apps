#!/bin/sh
# Les éditions publiées vivent sur la branche claude/ia-du-jour du dépôt, jamais sur main
# (main porte les autres apps ; le déploiement Pages va chercher les éditions sur cette branche).
#
#   ./branche.sh recuperer   avant la collecte : editions/ = celles de la branche (la mémoire)
#   ./branche.sh pousser     après `edition.py publier` : commite editions/ seul sur la branche, pousse
#
# Le code de la routine (collecte, contrôle, consigne) reste celui de main ; seules les données
# passent par la branche. Rien d'autre n'est jamais commité.
set -eu
BRANCHE=claude/ia-du-jour
cd "$(dirname "$0")"
RACINE="$(git rev-parse --show-toplevel)"
DOSSIER="$(git rev-parse --show-prefix)editions"     # ex. ia-du-jour/editions

case "${1:-}" in
  recuperer)
    if git fetch -q origin "$BRANCHE" 2>/dev/null; then
      git -C "$RACINE" checkout FETCH_HEAD -- "$DOSSIER"
      git -C "$RACINE" reset -q -- "$DOSSIER"
      echo "éditions récupérées depuis $BRANCHE"
    else
      echo "pas encore de branche $BRANCHE : on part des éditions de main"
    fi
    ;;
  pousser)
    ARBRE="$(mktemp -d)"
    if git fetch -q origin "$BRANCHE" 2>/dev/null; then BASE=FETCH_HEAD; else BASE=HEAD; fi
    git worktree add -q --detach "$ARBRE" "$BASE"
    mkdir -p "$ARBRE/$DOSSIER"
    cp editions/*.json "$ARBRE/$DOSSIER/"
    (
      cd "$ARBRE"
      git add -- "$DOSSIER"
      if git diff --cached --quiet; then
        echo "rien de nouveau à pousser"
      else
        DATE="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['derniere'])" "$DOSSIER/index.json")"
        git commit -q -m "IA du jour — $DATE" -- "$DOSSIER"
        git push -q origin "HEAD:refs/heads/$BRANCHE"
        echo "poussé sur $BRANCHE ($DATE)"
      fi
    )
    git worktree remove --force "$ARBRE"
    ;;
  *)
    echo "usage : $0 recuperer|pousser" >&2
    exit 2
    ;;
esac
