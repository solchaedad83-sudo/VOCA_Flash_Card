const {
  appendSheetRow,
  createCardWithAI,
  getSheetRows,
  sendJson,
} = require("./lib/voca-shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const word = String(body.word || "").trim();
    if (!word) {
      sendJson(res, 400, { error: "English word is required." });
      return;
    }

    const card = await createCardWithAI(word);
    const rows = await getSheetRows();

    if (rows.some((row) => String(row.word || "").toLowerCase() === card.word.toLowerCase())) {
      sendJson(res, 409, { error: `"${card.word}" already exists in Google Sheets.` });
      return;
    }

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const row = {
      word: card.word.trim(),
      meaning: card.meaning.trim(),
      example_sentence: card.example_sentence.trim(),
      example_translation: card.example_translation.trim(),
      interval: 0,
      ease_factor: 2.5,
      repetitions: 0,
      due_date: "",
      created_at: now,
    };

    await appendSheetRow(row);
    sendJson(res, 200, { success: true, word: row });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
};
