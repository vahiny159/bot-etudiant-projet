const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Telegraf, Markup } = require("telegraf");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
// L'URL publique de Render est nécessaire pour le bouton
const WEB_APP_URL =
  process.env.RENDER_EXTERNAL_URL || `https://ton-projet.onrender.com`;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// --- BDD SIMULÉE ---
let students = [
  {
    id: 1,
    nomComplet: "Jean Test",
    telephone: "0340000000",
    option: "Journalier",
    departement: "Informatique",
  },
];
let nextId = 2;

// --- API CRUD COMPLÈTE ---

// 1. GET (Liste + Recherche)
app.get("/api/students", (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : null;
  if (query)
    return res.json(
      students.filter((s) => s.nomComplet.toLowerCase().includes(query)),
    );
  res.json(students);
});

// 2. GET ONE (Pour récupérer un seul élève avant modif)
app.get("/api/students/:id", (req, res) => {
  const s = students.find((x) => x.id == req.params.id);
  s ? res.json(s) : res.status(404).json({});
});

// 3. POST (Ajouter)
app.post("/api/students", (req, res) => {
  const newStudent = req.body;
  newStudent.id = nextId++;
  newStudent.dateAjout = new Date().toLocaleDateString("fr-FR");
  students.push(newStudent);
  res.json(newStudent);
});

// 4. PUT (Modifier) - NOUVEAU !
app.put("/api/students/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const index = students.findIndex((s) => s.id === id);
  if (index !== -1) {
    // On garde l'ID et la date, on met à jour le reste
    students[index] = {
      ...students[index],
      ...req.body,
      id: id,
      dateAjout: students[index].dateAjout,
    };
    res.json(students[index]);
  } else {
    res.status(404).json({ error: "Non trouvé" });
  }
});

// 5. DELETE (Supprimer)
app.delete("/api/students/:id", (req, res) => {
  const id = parseInt(req.params.id);
  students = students.filter((s) => s.id !== id);
  res.json({ success: true });
});

// --- BOT TELEGRAM (Juste un Lanceur) ---
if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);

  // Menu simple
  bot.start((ctx) => {
    ctx.reply(
      "👋 **Gestion des Élèves**\nCliquez ci-dessous pour ouvrir l'application complète.",
      Markup.keyboard([
        [Markup.button.webApp("📱 Ouvrir le Tableau de Bord", WEB_APP_URL)],
      ]).resize(),
    );
  });

  // Écoute quand l'app se ferme
  bot.on("message", (ctx) => {
    if (ctx.message.web_app_data) {
      ctx.reply("✅ Opération terminée dans l'application !");
    }
  });

  bot.launch();
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

app.listen(PORT, () => console.log(`🚀 Serveur CRUD complet sur ${PORT}`));
