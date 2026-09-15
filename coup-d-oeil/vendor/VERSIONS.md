# Bibliothèques embarquées

Copiées telles quelles depuis npm, sans build ni modification. Pour en changer : retélécharger les
mêmes fichiers à la nouvelle version, relancer les tests, puis changer `CACHE` dans `sw.js` — les
fichiers de `vendor/` sont servis cache d'abord.

| Bibliothèque | Version | Licence | Source | Fichiers ici |
|---|---|---|---|---|
| Stockfish.js — Stockfish 18, variante *lite single-thread* | `stockfish@18.0.8` | GPL-3.0 | `https://unpkg.com/stockfish@18.0.8/bin/` (jsDelivr refuse ce paquet) | `stockfish/stockfish-18-lite-single.js`, `stockfish/stockfish-18-lite-single.wasm` |
| chess.js | `chess.js@1.4.0` | BSD-2-Clause | `https://cdn.jsdelivr.net/npm/chess.js@1.4.0/dist/esm/chess.js` | `chess.js` |
| cm-chessboard, extensions Arrows, Markers, PromotionDialog | `cm-chessboard@8.14.0` | MIT — pièces `standard.svg` (plus utilisées) : Wikimedia, CC BY-SA 3.0 | `https://cdn.jsdelivr.net/npm/cm-chessboard@8.14.0/` | `cm-chessboard/src/…`, `cm-chessboard/assets/…` |
| Pièces Staunty, le jeu affiché | `cm-chessboard@8.14.0` | CC BY-NC-SA 4.0 — usage non commercial | `https://cdn.jsdelivr.net/npm/cm-chessboard@8.14.0/assets/pieces/staunty.svg` | `cm-chessboard/assets/pieces/staunty.svg` |

Téléchargées le 2026-09-13. Empreintes SHA-256 :

```
5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391  stockfish/stockfish-18-lite-single.js
a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1  stockfish/stockfish-18-lite-single.wasm
76c7c34f0e2e9ab076521a5d6fe786a9cce537bb1b6f29d32a9c9970b5b232d2  chess.js
4f3943492cf99fdb1cc07434f1ec3963d55f8909cf5222032396c162f5541be4  cm-chessboard/assets/pieces/staunty.svg
```

Le `.wasm` est cherché à côté du `.js`, sous le même nom : ne pas renommer l'un sans l'autre.
Licences complètes dans `LICENCES/`.
