# linkedin-agent

Rédige un post avec Claude à partir de `prompt.md` et le publie chaque jour sur ton compte LinkedIn (GitHub Actions, `.github/workflows/linkedin-agent.yml`).

## Mise en place

1. **Consignes** : écris tes thèmes, cibles, ton et langue dans `prompt.md`.
2. **App LinkedIn** : sur https://www.linkedin.com/developers/apps, crée une app et ajoute les produits
   *Share on LinkedIn* (`w_member_social`) et *Sign In with LinkedIn using OpenID Connect* (`openid profile`).
3. **Token** : génère un token d'accès membre avec les scopes `openid profile w_member_social`
   (OAuth Token Tools de LinkedIn). Il expire au bout de 60 jours : à renouveler.
4. **Secrets GitHub** (Settings → Secrets and variables → Actions) :
   - `ANTHROPIC_API_KEY`
   - `LINKEDIN_ACCESS_TOKEN`
   - `LINKEDIN_AUTHOR_URN` (facultatif, ex. `urn:li:person:abc123`)

Le déclenchement planifié ne tourne que sur la branche par défaut du dépôt.

## Utilisation

- Test sans publier : Actions → *LinkedIn agent* → *Run workflow* avec *dry_run* coché,
  ou en local : `npm ci && ANTHROPIC_API_KEY=... npm run dry-run`.
- Les posts publiés sont ajoutés à `history.json` ; les 30 derniers sont envoyés à Claude pour éviter les répétitions.
- `LINKEDIN_VERSION` (format `AAAAMM`) fixe la version de l'API LinkedIn ; mets-la à jour si LinkedIn la retire.
