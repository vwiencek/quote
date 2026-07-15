# CLAUDE.md — contexte du projet quote

Contexte pour Claude Code (et tout humain qui débarque). Résume ce qui a été construit, les décisions prises et les conventions de travail.

## Le projet

**« Donne-moi un gage »** — petite web app statique (un jeu coquin pour deux adultes) : on choisit à qui s'adresse le gage (homme/femme), un niveau (soft/hard/surprise), et l'app tire un gage au hasard avec un compte à rebours. Repo GitHub : `vwiencek/quote`.

## Architecture

- **Site 100 % statique, sans build** : `index.html` (markup), `styles.css`, `app.js` (logique), `sw.js`, `manifest.json`. Les binaires (mp3 de fin, icônes PNG) sont dans `assets/`. Pas de framework, pas de dépendance.
- **Données** : Google Sheet partagée « anyone with link can view », lue en CSV côté client via l'endpoint gviz (`/gviz/tq?tqx=out:csv`). L'ID de la feuille est la constante `SHEET_ID` en haut du script d'`index.html`.
- **Colonnes de la feuille** : `gage` (texte), `player` (`homme`/`femme`/`both`), `min`/`max` (bornes de durée en minutes), `keyword` (un ou plusieurs tags de filtre séparés par des virgules, ex. `soft, romantic`), `level` (`soft`/`hard` ; l'ancien en-tête `type` est accepté). Lignes incomplètes tolérées : sans `level` → ignorées ; `player` vide → `both` ; `min`/`max` vides → 1–10 ; `keyword` vide → toujours inclus. Un gage est tiré si **au moins un** de ses tags est sélectionné.
- **Déploiement** : chaque push sur `main` déploie sur Azure Static Web Apps (workflow dans `.github/workflows/`, `skip_app_build: true` car site statique — Oryx échouait sinon).

## Fonctionnalités (état actuel)

- **Verrou PIN** : au chargement, un écran de code (pavé numérique) masque tout le contenu tant que le bon code à 4 chiffres n'est pas saisi. Code = `1310` (constante `ACCESS_PIN` en haut d'`app.js`). Déverrouillage valable pour la session (`sessionStorage`) ; se referme à la fermeture de l'onglet. `body.locked` cache la carte dès le premier rendu (pas de flash).
- Toggle « Donne un gage à ... un homme / une femme » (persisté en localStorage) + « 🔁 chacun son tour » (alternance auto du joueur à chaque tirage).
- Chips de keywords (uniques, générées depuis la feuille), multi-sélection, état sélectionné = rempli bleu + ✓.
- Boutons Soft / **Surprise** (niveau aléatoire) / Hard.
- Tirage : filtre par player + keywords, anti-répétition (gages tirés mémorisés en localStorage, nouvelle tournée automatique quand le pool est épuisé), durée entière tirée entre `min` et `max`.
- Compte à rebours dans un **anneau de progression** (bleu soft, rose hard, vert fini) + boutons ⏸ (pause/reprise), « + 1 min », et **Terminé ✔** (arrêt anticipé, même célébration que la fin du temps).
- Fin de timer : extrait de `SF-cum.mp3` (bornes `END_SOUND_START`/`END_SOUND_END` en secondes, audio déverrouillé au clic à cause de l'autoplay policy), vibration mobile, wake lock relâché.
- **Wake lock** : écran maintenu allumé pendant le timer (silencieusement ignoré si refusé — la preview Claude le refuse, un vrai mobile non).
- **Cache stale-while-revalidate** : dernier CSV en localStorage (clé liée à `SHEET_ID`), affichage instantané puis re-fetch en arrière-plan ; note « données mises à jour » si changement (sélection de keywords préservée), note « injoignable — cache » si hors ligne.
- **PWA** : installable (manifest, icônes 🎲 générées par canvas), `sw.js` network-first avec repli cache pour le shell (`gage-v2`).
- Protection anti-fausse-manip : remplacer un gage en cours = 2 clics en 3 s.
- Options persistées : 🔥 intensité (Surprise penche vers hard au fil des tirages, 20 %→85 %), 🙈 temps caché (compte à rebours et anneau masqués), 🔊/🔇 son.
- Score de session par joueur (« Lui / Elle », 1 point max par gage terminé, ↺ pour reset), colonne `weight` optionnelle (pondération des tirages), tap sur le gage = affichage plein écran.
- Couleurs : soft orange, hard rouge sang (`--soft`/`--hard`) ; logos ♂ bleu / ♀ rose (`--man`/`--woman`, SVG inline — pas de glyphes Unicode, Firefox les rendait en emoji).

## Scripts

- `./serve.sh [port]` — serveur local (défaut 8001). Config `quote-site` aussi dans `.claude/launch.json` (du projet et de `~/dev/life`).
- `./test.sh` — smoke test : page + assets PWA + mp3 servis, feuille joignable et validée ligne par ligne (avertissements pour les lignes incomplètes tolérées, échec seulement si soft/hard introuvables).

## Conventions de travail (important)

- **Ne pas commiter/pusher automatiquement** : Vincent gère git lui-même. Modifier les fichiers, vérifier en local, s'arrêter là — sauf demande explicite (« push »).
- **Tenir le README à jour** à chaque évolution fonctionnelle (demande permanente).
- Vérifier chaque changement dans le navigateur (preview) avant de conclure.
- L'UI est en français ; le README en anglais.
- Ne pas travailler dans `~/dev/life` (autre projet) — tout se passe dans `~/dev/quote`.

## Historique (session du 2026-07-14)

1. Page picker soft/hard initiale créée dans `~/dev/life`, puis poussée vers le repo `quote` (avec une page de citations, remplacée depuis).
2. Fix déploiement Azure (`skip_app_build: true`).
3. Timer compte à rebours ajouté, données déplacées de la page vers `quotes.json`, puis vers une Google Sheet (3 feuilles successives — l'ID a changé plusieurs fois, d'où la clé de cache liée à l'ID).
4. Feuille enrichie : `player`, `min`/`max`, `keyword`, `type`→`level` ; UI enrichie en conséquence (toggle joueur, chips, durées par gage).
5. UX : « + 1 min », pause, anti-répétition, wake lock, vibration, son mp3 (remplace un sifflement Web Audio), cache stale-while-revalidate, PWA, anneau de progression, Surprise, chacun son tour, anti-fausse-manip, bouton Terminé, styles extraits dans `styles.css`, favicon/titre/lang fr, tailles tactiles + aria.
6. `test.sh` durci (validation par ligne, avertissements) — a révélé ~70 lignes de la feuille sans `level`, donc invisibles dans l'app tant que non complétées.

## Pièges connus

- La feuille doit rester partagée « anyone with the link can view », sinon l'app bascule sur le cache (ou affiche une erreur au premier chargement).
- Google bloque la lecture de cette feuille par les outils Drive IA (« ineligible for generative AI ») — passer par l'endpoint CSV public pour l'inspecter.
- Après un déploiement, les PWA installées récupèrent la mise à jour au rechargement suivant (network-first) ; penser à bumper `CACHE` dans `sw.js` si la liste d'assets change.
- `file://` ne marche pas (fetch + service worker) — toujours passer par `serve.sh`.
