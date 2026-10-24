# Cycle

Web app de suivi du cycle menstruel, pensée pour iPhone et installée depuis Safari. Elle montre la phase du jour, prévient de la fenêtre SPM et donne des conseils concrets pour chaque phase.

## Installer sur l'iPhone

1. Ouvrir l'adresse de l'appli dans **Safari**.
2. Bouton **Partager**, puis **Sur l'écran d'accueil**.
3. Ouvrir l'appli depuis l'icône (pas depuis Safari) : elle s'affiche en plein écran et fonctionne hors ligne.

## Ce que fait la V1

- Phase du jour sur un anneau, jour du cycle, compte à rebours avant les règles
- Bandeau SPM les derniers jours avant les règles (5, 7 ou 10 jours)
- Calendrier coloré par phase ; toucher un jour passé ajoute ou retire un jour de règles
- Fiches conseils par phase, prévention du SPM, rubrique « Quand consulter »
- Bouton **Retours** pour noter idées, contenus manquants et bugs
- Notifications le matin : début de la fenêtre SPM et veille des règles prévues
- Export et import des données en JSON

Les données du cycle restent dans le téléphone. Seuls les rappels de notification (date et texte) sont envoyés au serveur.

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | L'appli |
| `content.js` | Textes des conseils et numéro de version |
| `sw.js` | Hors ligne, mises à jour, réception des notifications |
| `push-server.json` | Adresse du serveur, écrite automatiquement au déploiement |
| `worker/` | Serveur de notifications Cloudflare (Worker + KV + tâche quotidienne) |

## Notifications : mise en route

Le serveur se déploie automatiquement via GitHub Actions à chaque modification de `worker/`. Il faut trois secrets dans **Settings › Secrets and variables › Actions** du repo :

- `CLOUDFLARE_API_TOKEN` : jeton créé sur dash.cloudflare.com › My Profile › API Tokens, modèle **Edit Cloudflare Workers**
- `CLOUDFLARE_ACCOUNT_ID` : facultatif si le jeton ne donne accès qu'à un compte
- `VAPID_PRIVATE_JWK` : clé privée des notifications (déjà configurée)

Avant le premier déploiement, ouvrir une fois **Workers & Pages** dans le tableau de bord Cloudflare pour choisir un sous-domaine `workers.dev`.

## Mettre à jour l'appli

1. Modifier le code, ajouter une entrée dans `CHANGELOG` et changer `APP_VERSION` (`content.js`).
2. Changer `CACHE` dans `sw.js` (ex. `cycle-v1.1.0`) pour que l'iPhone récupère la nouvelle version.
3. Pousser sur `main` : l'appli affiche « Nouvelle version disponible ».

Pour relever les retours, utiliser **Retours › Tout partager** dans l'appli, ou configurer `FEEDBACK_ENDPOINT` dans `app.js` avec un formulaire Formspree.

---

Repères généraux, ne remplacent pas un avis médical. L'appli n'est pas un moyen de contraception.
