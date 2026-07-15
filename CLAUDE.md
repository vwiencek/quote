# CLAUDE.md — contexte du projet quote

Contexte pour Claude Code (et tout humain qui débarque). Résume ce qui a été construit, les décisions prises et les conventions de travail.

## Le projet

**« Donne-moi un gage »** — petite web app statique (un jeu coquin pour deux adultes) : on choisit à qui s'adresse le gage (homme/femme), une intensité (slider 1–10 + GO), et l'app tire un gage au hasard avec un compte à rebours. Repo GitHub : `vwiencek/quote`.

## Architecture

- **Front 100 % statique, sans build** (une Function serverless optionnelle pour la voix, voir « Backend » plus bas) : `index.html` (markup), `styles.css`, `app.js` (logique), `sw.js`, `manifest.json`. Les binaires (mp3 de fin, icônes PNG, police) sont dans `assets/` (police variable Onest **auto-hébergée** : `assets/fonts/onest-latin.woff2`, sous-ensemble latin qui couvre le français — accents, œ, «», …, —, € ; plus aucun appel à Google Fonts). Pas de framework ni de build.
- **Données** : Google Sheet partagée « anyone with link can view », lue en CSV côté client via l'endpoint gviz (`/gviz/tq?tqx=out:csv`). L'ID de la feuille est la constante `SHEET_ID` en haut du script d'`index.html`.
- **Colonnes de la feuille** : texte = tout en-tête contenant « gage » (actuellement `Gage détaillé`), `player` (`homme`/`femme`/`both`), `min`/`max` (bornes de durée en minutes), `keyword` (un ou plusieurs tags de filtre séparés par des virgules), `intensité` (1–10, aussi accepté : `intensite`/`intensity` ; clampée dans 1–10). Lignes incomplètes tolérées : sans `intensité` (ou non numérique) → ignorées ; `player` vide → `both` ; `min`/`max` vides → 1–10 ; `keyword` vide → toujours inclus. Un gage est tiré si **au moins un** de ses tags est sélectionné.
- **Backend optionnel** : dossier `api/` = une **Azure Function** (`api/tts`, modèle classique `function.json`+`index.js`) qui sert de proxy à **Azure Neural TTS** pour la lecture vocale. La clé reste côté serveur : elle se configure dans les **Application settings** du Static Web App (`SPEECH_KEY`, `SPEECH_REGION`, option `SPEECH_VOICE`) — **jamais** dans le code ni dans un secret GitHub (ceux-ci ne sont que build-time). Sans ces réglages, `/api/tts` renvoie 503 et le client bascule sur la voix du navigateur. `staticwebapp.config.json` fixe `apiRuntime node:18`.
- **Déploiement** : chaque push sur `main` déploie sur Azure Static Web Apps (workflow dans `.github/workflows/`, `skip_app_build: true` car site statique ; `api_location: "api"` pour la Function).

## Fonctionnalités (état actuel)

- **Verrou PIN** : au chargement, un écran de code (pavé numérique) masque tout le contenu tant que le bon code à 4 chiffres n'est pas saisi. Code = `1310` (constante `ACCESS_PIN` en haut d'`app.js`). Déverrouillage valable pour la session (`sessionStorage`) ; se referme à la fermeture de l'onglet. `body.locked` cache la carte dès le premier rendu (pas de flash).
- Toggle « Donne un gage à ... un homme / une femme » (persisté en localStorage) + « 🔁 chacun son tour » (alternance auto du joueur à chaque tirage).
- Chips de keywords (uniques, générées depuis la feuille), multi-sélection, état sélectionné = **contour cyan** (pas de ✓ ni de fond) ; chip **« Tout / Rien »** en tête pour tout (dé)sélectionner d'un coup.
- **Slider d'intensité 1–10 + bouton GO** (persisté, `intensityLevel`) : la valeur est une **intensité max** — le tirage prend les gages du niveau exact, sinon descend au niveau en dessous, etc. (jamais au-dessus ; erreur claire s'il n'y a rien à ce niveau ou moins). Le GO est teinté à la couleur de l'intensité (dégradé vert→or→rouge, `intensityColor()`), et le statut affiche l'intensité réelle du gage si elle diffère du slider.
- Tirage : filtre par player + keywords, anti-répétition (gages tirés mémorisés en localStorage, nouvelle tournée automatique quand le pool est épuisé), durée entière tirée entre `min` et `max`.
- Compte à rebours dans un **anneau de progression** coloré selon l'intensité du gage tiré (variable CSS `--ring-color` posée par le JS ; vert quand fini). **Le minuteur ne démarre pas tout seul** : au tirage il s'affiche à l'arrêt (état `.ready`, anneau qui pulse, statut « Appuie sur le minuteur pour démarrer »), et **un tap sur l'anneau le démarre / met en pause / reprend** (même logique que le bouton ⏸/▶). Boutons ⏸ (pause/reprise), « + 1 min » (ajoute sans démarrer si à l'arrêt ; relance un gage terminé), **🔀 Passer** (retire avec les mêmes réglages, sans passer par la protection anti-fausse-manip ni alterner le joueur) et **Terminé ✔** (arrêt anticipé, même célébration que la fin du temps).
- **Minuteur basé sur l'horloge murale** : `remaining` est recalculé depuis une échéance `endAt` (timestamp) à chaque tick, pas décrémenté — reste exact même quand l'onglet est en arrière-plan (les `setInterval` y sont throttlés) ; resynchronisé immédiatement au retour au premier plan (`visibilitychange`).
- Fin de timer : extrait de `SF-cum.mp3` (bornes `END_SOUND_START`/`END_SOUND_END` en secondes, audio déverrouillé au clic à cause de l'autoplay policy), vibration mobile, wake lock relâché.
- **Wake lock** : écran maintenu allumé pendant le timer (silencieusement ignoré si refusé — la preview Claude le refuse, un vrai mobile non).
- **Cache stale-while-revalidate** : dernier CSV en localStorage (clé liée à `SHEET_ID`), affichage instantané puis re-fetch en arrière-plan ; note « données mises à jour » si changement (sélection de keywords préservée), note « injoignable — cache » si hors ligne.
- **PWA** : installable (manifest, icônes 🎲 générées par canvas), `sw.js` network-first avec repli cache pour le shell (`gage-v2`).
- Protection anti-fausse-manip : remplacer un gage en cours = 2 clics en 3 s.
- Options persistées : 🙈 temps caché (compte à rebours et anneau masqués), 🔊/🔇 son.
- Score **de session** par joueur (« Lui / Elle », 1 point max par gage terminé, ↺ pour reset) — stocké en `sessionStorage`, donc remis à zéro à la fermeture de l'onglet. Colonne `weight` optionnelle (pondération des tirages), tap **ou clavier (Entrée/Espace, Échap pour fermer)** sur le gage = affichage plein écran.
- **Lecture vocale** : bouton **🔈 Lire le gage** (sous le texte). Deux niveaux :
  1. **Voix neuronale (Azure)** via le proxy `/api/tts` (Azure Function, voir plus bas) — voix `fr-FR-DeniseNeural` par défaut, très naturelle. Utilisée en priorité si l'API est configurée et joignable.
  2. **Repli navigateur** (`speechSynthesis`) si l'API est indisponible (hors-ligne ou non configurée) : `pickFrenchVoice()` choisit la voix locale la plus naturelle (enhanced/neural/Siri/Google > compacte).
  Re-clic = ⏹ stop ; coupé au tirage d'un nouveau gage. Un clip WAV silencieux (`SILENT_WAV`) est joué dans le geste du clic pour **déverrouiller l'audio sur iOS** (sinon le MP3 récupéré en async est bloqué).
- **Accessibilité** : gage plein écran pilotable au clavier (focus géré), régions `aria-live` (gage tiré, statut, note), `role="alert"` sur les erreurs (dont code PIN), focus visible (`:focus-visible`).
- **Design (refonte 2026-07-15)** : palette sombre bleu-nuit (`--bg #0a0e18`, carte `--card #111726`, fond en dégradé radial), police **Onest** auto-hébergée. Accent principal **rose** `--rose #ef5a78` (joueur actif, bouton Terminé, chiffres du score). Toggles d'options = **icônes seules** (🔁/🙈/🔊, libellé via `aria-label`/`title`), rondes 3.4rem, contour rose quand actives ; chips de catégories = contour **cyan** `--cat` quand sélectionnées. Intensité : slider à piste dégradée vert→or→rouge (`--soft`/`--surprise`/`--hard`) + GO teinté à la couleur de la valeur. Anneau : couleur d'intensité du gage tiré / vert (fini). Joueur affiché en texte « ♂ Lui / ♀ Elle » (glyphes forcés en présentation texte via `&#65038;` — évite le rendu emoji de Firefox). Le badge est masqué (l'anneau porte l'info). Pas de libellé de tour (le sélecteur Lui/Elle suffit).

## Scripts

- `./serve.sh [port]` — serveur local (défaut 8001). Config `quote-site` aussi dans `.claude/launch.json` (du projet et de `~/dev/life`).
- `./test.sh` — smoke test : page + assets PWA + mp3 servis, feuille joignable et validée ligne par ligne (`intensité` 1–10, player, min/max, weight ; avertissements pour les lignes incomplètes tolérées, échec seulement si aucune ligne utilisable).

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

## Historique (session du 2026-07-15)

Verrou PIN, assets déplacés dans `assets/`, keywords multiples par cellule, refonte visuelle (rose/cyan, Onest), fix son au clic, gros lot fiabilité/a11y/UX (timer horloge murale, garde cache corrompu, timeout fetch, clavier/aria/focus, Tout/Rien, Passer, score de session, police auto-hébergée), démarrage du minuteur au tap, lecture vocale (navigateur puis **TTS neuronal Azure** via `api/tts`), total de gages affiché, et **migration du modèle soft/hard vers `intensité` 1–10** (slider + GO ; la feuille a changé de colonnes — `Gage détaillé` + `intensité`).

## Pièges connus

- La feuille doit rester partagée « anyone with the link can view », sinon l'app bascule sur le cache (ou affiche une erreur au premier chargement).
- Google bloque la lecture de cette feuille par les outils Drive IA (« ineligible for generative AI ») — passer par l'endpoint CSV public pour l'inspecter.
- Après un déploiement, les PWA installées récupèrent la mise à jour au rechargement suivant (network-first) ; penser à bumper `CACHE` dans `sw.js` si la liste d'assets change.
- `file://` ne marche pas (fetch + service worker) — toujours passer par `serve.sh`.
