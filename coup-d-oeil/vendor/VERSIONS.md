# Bibliothèques embarquées

Copiées telles quelles depuis npm, sans build ni modification. Pour en changer : retélécharger les
mêmes fichiers à la nouvelle version, relancer les tests, puis changer `CACHE` dans `sw.js` — les
fichiers de `vendor/` sont servis cache d'abord.

| Bibliothèque | Version | Licence | Source | Fichiers ici |
|---|---|---|---|---|
| Stockfish.js — Stockfish 18, variante *lite single-thread* | `stockfish@18.0.8` | GPL-3.0 | `https://unpkg.com/stockfish@18.0.8/bin/` (jsDelivr refuse ce paquet) | `stockfish/stockfish-18-lite-single.js`, `stockfish/stockfish-18-lite-single.wasm` |
| Fairy-Stockfish (commit b2e693ef, Emscripten 2.0.26) — l'adversaire sous 1320 | `fairy-stockfish-nnue.wasm@1.1.12` | GPL-3.0 | `npm pack fairy-stockfish-nnue.wasm@1.1.12` | `fairy-stockfish/stockfish.js`, `fairy-stockfish/stockfish.wasm`, `fairy-stockfish/stockfish.worker.js` |
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

Fairy-Stockfish, téléchargé le 2026-09-15 :

```
9080a62e3133e50da0c47b88b186d9c29ed37cc5129401bdeed8bffb5b9a4ca9  fairy-stockfish/stockfish.js
7cea742b8ca1a324fbc500f89112f168134cf68eb49475df23be6c42336255c6  fairy-stockfish/stockfish.wasm
067be484ac62f728b0dad28496997e5862f3c61f9091f59bb35d9d1b1ed14573  fairy-stockfish/stockfish.worker.js
```

Le `.wasm` est cherché à côté du `.js`, sous le même nom : ne pas renommer l'un sans l'autre.
Fairy-Stockfish est multi-fil : `stockfish.wasm` et `stockfish.worker.js` restent à côté de
`stockfish.js`, et il ne démarre que dans une page isolée (COOP/COEP, posés par `sw.js`). Le `uci.js`
du paquet, pour Node, n'est pas copié : les tests passent par `tests/fairy-uci.cjs`.
Licences complètes dans `LICENCES/`, texte GPL et auteurs de Fairy-Stockfish compris.
