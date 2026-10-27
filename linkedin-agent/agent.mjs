// Agent LinkedIn : rédige un post avec Claude à partir de prompt.md, puis le publie sur le compte LinkedIn.
//
// Variables d'environnement :
//   ANTHROPIC_API_KEY      clé API Anthropic
//   LINKEDIN_ACCESS_TOKEN  token OAuth membre (scopes : openid profile w_member_social)
//   LINKEDIN_AUTHOR_URN    optionnel, ex. urn:li:person:abc123 (sinon récupéré via /v2/userinfo)
//   LINKEDIN_VERSION       optionnel, version de l'API REST LinkedIn au format AAAAMM
//   DRY_RUN=1              rédige le post et l'affiche sans le publier

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(here, "prompt.md");
const HISTORY_PATH = path.join(here, "history.json");
const HISTORY_CONTEXT = 30;

const DRY_RUN = process.env.DRY_RUN === "1";
const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION ?? "202609";

const SYSTEM = `Tu rédiges des posts LinkedIn publiés tels quels sur le compte personnel de l'auteur.

Règles :
- Respecte les thèmes, cibles, ton et langue définis par l'auteur.
- Un seul post, prêt à publier : pas de titre, pas de guillemets autour, pas de commentaire avant ou après.
- Texte brut uniquement (LinkedIn n'affiche pas le Markdown) : pas de **gras**, pas de # titres.
- Moins de 2 500 caractères. Phrases courtes, lignes aérées, une accroche forte en première ligne.
- 3 à 5 hashtags maximum, à la fin.
- N'invente ni chiffres, ni citations, ni anecdotes personnelles présentées comme vraies.
- Ne répète pas un sujet ou un angle déjà traité dans les posts précédents.`;

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function draftPost(authorPrompt, history) {
  const client = new Anthropic();

  const previous = history
    .slice(-HISTORY_CONTEXT)
    .map((h) => `--- ${h.date}\n${h.text}`)
    .join("\n\n");

  const today = new Date().toISOString().slice(0, 10);
  const userContent = [
    `Consignes de l'auteur (thèmes et cibles) :\n\n${authorPrompt}`,
    previous ? `Posts déjà publiés (à ne pas répéter) :\n\n${previous}` : null,
    `Date du jour : ${today}. Rédige le post du jour.`,
  ]
    .filter(Boolean)
    .join("\n\n====\n\n");

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high" },
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Rédaction refusée par le modèle : ${response.stop_details?.explanation ?? "sans détail"}`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Réponse tronquée (max_tokens atteint).");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Réponse vide.");
  return text;
}

// Le champ `commentary` de l'API Posts utilise le format "little text" :
// les caractères réservés doivent être échappés, sinon le post est tronqué.
const RESERVED = /[\\|{}@\[\]()<>#*_~]/g;
const escapeLittleText = (s) => s.replace(RESERVED, (c) => `\\${c}`);

function toCommentary(text) {
  const hashtag = /#([\p{L}\p{N}]+)/gu;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(hashtag)) {
    out += escapeLittleText(text.slice(last, m.index));
    out += `{hashtag|\\#|${m[1]}}`;
    last = m.index + m[0].length;
  }
  return out + escapeLittleText(text.slice(last));
}

async function linkedinFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn ${res.status} sur ${url} : ${await res.text()}`);
  }
  return res;
}

async function authorUrn() {
  if (process.env.LINKEDIN_AUTHOR_URN) return process.env.LINKEDIN_AUTHOR_URN;
  const res = await linkedinFetch("https://api.linkedin.com/v2/userinfo");
  const { sub } = await res.json();
  return `urn:li:person:${sub}`;
}

async function publish(text) {
  const res = await linkedinFetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: await authorUrn(),
      commentary: toCommentary(text),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  return res.headers.get("x-restli-id");
}

async function main() {
  const authorPrompt = fs.readFileSync(PROMPT_PATH, "utf8").trim();
  const history = readHistory();

  const text = await draftPost(authorPrompt, history);
  console.log(`----- Post rédigé -----\n${text}\n-----------------------`);

  if (DRY_RUN) {
    console.log("DRY_RUN=1 : rien n'a été publié.");
    return;
  }

  const postUrn = await publish(text);
  console.log(`Publié : ${postUrn}`);

  history.push({ date: new Date().toISOString(), urn: postUrn, text });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
