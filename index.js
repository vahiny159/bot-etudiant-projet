const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Telegraf, Scenes, session, Markup } = require("telegraf");
const axios = require("axios");
require("dotenv").config();

// --- 1. CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
// URL pour que le bot parle à son propre serveur API
const URL_API_INTERNE = `http://localhost:${PORT}/api/students`;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- 2. PARTIE API (Simulation Base de Données) ---
// On ajoute les nouveaux champs dans notre simulation
let students = [
  {
    id: 1,
    dateAjout: "19/01/2026",
    nomComplet: "Jean Dupont",
    telephone: "0340000000",
    dateNaissance: "12/05/2000",
    adresse: "Analakely, Tana",
    eglise: "FJKM",
    profession: "Etudiant",
    option: "Journalier",
  },
];
let nextId = 2;

// Route d'accueil
app.get("/", (req, res) => res.send("Serveur et Bot actifs !"));

// API: Recherche
app.get("/api/students", (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : null;
  if (query) {
    return res.json(
      students.filter((s) => s.nomComplet.toLowerCase().includes(query)),
    );
  }
  res.json(students);
});

// API: Ajout
app.post("/api/students", (req, res) => {
  const newStudent = req.body;
  newStudent.id = nextId++;
  newStudent.dateAjout = new Date().toLocaleDateString("fr-FR"); // Date auto
  students.push(newStudent);
  console.log(`[API] Nouvel ajout : ${newStudent.nomComplet}`);
  res.json(newStudent);
});

// --- 3. PARTIE BOT TELEGRAM ---

if (!BOT_TOKEN) {
  console.error("❌ ERREUR : Token manquant dans le .env ou sur Render");
} else {
  const bot = new Telegraf(BOT_TOKEN);

  // -- Service interne (Appels API) --
  const apiService = {
    add: async (data) => {
      try {
        return (await axios.post(URL_API_INTERNE, data)).data;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    search: async (nom) => {
      try {
        return (await axios.get(`${URL_API_INTERNE}?q=${nom}`)).data;
      } catch (e) {
        return [];
      }
    },
  };

  // -- CLAVIER PRINCIPAL (MENU) --
  // Ce clavier reste affiché en bas
  const mainMenu = Markup.keyboard([
    ["➕ Ajouter un élève", "🔍 Rechercher"],
    ["✏️ Modifier", "❓ Aide"],
  ]).resize(); // resize rend les boutons plus jolis

  // -- SCÈNE D'AJOUT (Le formulaire étape par étape) --
  const addWizard = new Scenes.WizardScene(
    "ADD_STUDENT_SCENE",

    // Étape 1 : Nom complet
    (ctx) => {
      ctx.reply(
        "📝 **Nouveau dossier**\n\nVeuillez entrer le **Nom Complet** :",
        Markup.removeKeyboard(),
      );
      ctx.wizard.state.data = {}; // Init stockage
      return ctx.wizard.next();
    },

    // Étape 2 : Téléphone
    (ctx) => {
      ctx.wizard.state.data.nomComplet = ctx.message.text;
      ctx.reply("Entrez le **Numéro de téléphone** :");
      return ctx.wizard.next();
    },

    // Étape 3 : Date de naissance
    (ctx) => {
      ctx.wizard.state.data.telephone = ctx.message.text;
      ctx.reply("Entrez la **Date de naissance** (ex: 01/01/2000) :");
      return ctx.wizard.next();
    },

    // Étape 4 : Adresse
    (ctx) => {
      ctx.wizard.state.data.dateNaissance = ctx.message.text;
      ctx.reply("Entrez l'**Adresse** :");
      return ctx.wizard.next();
    },

    // Étape 5 : Eglise
    (ctx) => {
      ctx.wizard.state.data.adresse = ctx.message.text;
      ctx.reply("Nom de l'**Église** :");
      return ctx.wizard.next();
    },

    // Étape 6 : Profession
    (ctx) => {
      ctx.wizard.state.data.eglise = ctx.message.text;
      ctx.reply("Quelle est sa **Profession** ?");
      return ctx.wizard.next();
    },

    // Étape 7 : Option (Avec boutons spéciaux)
    (ctx) => {
      ctx.wizard.state.data.profession = ctx.message.text;
      ctx.reply(
        "Choisissez l'**Option d'apprentissage** :",
        Markup.keyboard([["Journalier", "Weekend"]])
          .oneTime()
          .resize(),
      );
      return ctx.wizard.next();
    },

    // Étape 8 : Confirmation et Sauvegarde
    async (ctx) => {
      // Vérification si l'utilisateur a cliqué ou écrit
      if (ctx.message.text !== "Journalier" && ctx.message.text !== "Weekend") {
        ctx.reply(
          "⚠️ Veuillez utiliser les boutons ci-dessous.",
          Markup.keyboard([["Journalier", "Weekend"]])
            .oneTime()
            .resize(),
        );
        return; // On reste sur cette étape
      }

      ctx.wizard.state.data.option = ctx.message.text;

      ctx.reply("⏳ Enregistrement en cours...");

      const saved = await apiService.add(ctx.wizard.state.data);

      if (saved) {
        const recap =
          `✅ **Élève Ajouté !**\n\n` +
          `🆔 ID : ${saved.id}\n` +
          `📅 Ajouté le : ${saved.dateAjout}\n` +
          `👤 Nom : ${saved.nomComplet}\n` +
          `📞 Tel : ${saved.telephone}\n` +
          `🎂 Né(e) le : ${saved.dateNaissance}\n` +
          `🏠 Adresse : ${saved.adresse}\n` +
          `⛪ Église : ${saved.eglise}\n` +
          `💼 Job : ${saved.profession}\n` +
          `📚 Option : ${saved.option}`;
        await ctx.replyWithMarkdown(recap);
      } else {
        ctx.reply("❌ Erreur lors de la sauvegarde.");
      }

      // Retour au menu principal
      await ctx.reply("Que voulez-vous faire maintenant ?", mainMenu);
      return ctx.scene.leave();
    },
  );

  const stage = new Scenes.Stage([addWizard]);
  bot.use(session());
  bot.use(stage.middleware());

  // -- GESTION DES COMMANDES ET TEXTES --

  // Démarrage
  bot.start((ctx) => {
    const welcomeMsg =
      `👋 **Bienvenue sur le Bot de Gestion !**\n\n` +
      `Je suis prêt à vous aider à gérer les élèves.\n` +
      `Utilisez le menu ci-dessous pour commencer.`;
    ctx.replyWithMarkdown(welcomeMsg, mainMenu);
  });

  // Clic sur le bouton "Ajouter"
  bot.hears("➕ Ajouter un élève", (ctx) =>
    ctx.scene.enter("ADD_STUDENT_SCENE"),
  );
  bot.command("add", (ctx) => ctx.scene.enter("ADD_STUDENT_SCENE"));

  // Clic sur le bouton "Rechercher"
  bot.hears("🔍 Rechercher", (ctx) =>
    ctx.reply("Entrez le nom de l'élève à chercher (ex: /search Jean) :"),
  );

  // Logique de recherche
  bot.command("search", async (ctx) => {
    const query = ctx.message.text.split(" ").slice(1).join(" ");
    if (!query)
      return ctx.reply("❌ Veuillez indiquer un nom. Ex: /search Dupont");

    const results = await apiService.search(query);
    if (results.length === 0) return ctx.reply("Aucun résultat trouvé 😕");

    for (const s of results) {
      const fiche =
        `🎓 **${s.nomComplet}** (Option: ${s.option})\n` +
        `📞 ${s.telephone} | 🏠 ${s.adresse}\n` +
        `📅 Inscrit le : ${s.dateAjout}`;
      // Ajout d'un bouton Modifier (Factice pour l'instant)
      await ctx.replyWithMarkdown(
        fiche,
        Markup.inlineKeyboard([
          Markup.button.callback("✏️ Modifier", `edit_${s.id}`),
          Markup.button.callback("🗑️ Supprimer", `del_${s.id}`),
        ]),
      );
    }
  });

  // Actions pour les boutons "Modifier/Supprimer" (Placeholder)
  bot.action(/edit_(\d+)/, (ctx) =>
    ctx.answerCbQuery("La modification arrive bientôt !"),
  );
  bot.action(/del_(\d+)/, (ctx) =>
    ctx.answerCbQuery("La suppression arrive bientôt !"),
  );

  // Gestion de l'aide ou texte inconnu
  bot.hears("❓ Aide", (ctx) =>
    ctx.reply(
      "Ce bot permet de gérer les inscriptions. Contactez l'admin pour plus d'infos.",
    ),
  );

  // Lancement
  bot.launch();
  console.log("🤖 Bot Telegram v2 (Menu complet) démarré !");

  // Arrêt propre
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

// --- 4. LANCEMENT DU SERVEUR ---
app.listen(PORT, () => {
  console.log(`🚀 Serveur Web écoutant sur le port ${PORT}`);
});
