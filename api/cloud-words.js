const {
  clearSheetRow,
  getSheetRowsWithRowNumbers,
  sendJson,
  updateSheetRow,
} = require("./lib/voca-shared");

function normalizeRow(row) {
  return {
    word: String(row.word || "").trim(),
    meaning: String(row.meaning || "").trim(),
    example_sentence: String(row.example_sentence || "").trim(),
    example_translation: String(row.example_translation || "").trim(),
    interval: Math.max(0, Number.parseInt(row.interval || 0, 10) || 0),
    ease_factor: Math.max(1.3, Number.parseFloat(row.ease_factor || 2.5) || 2.5),
    repetitions: Math.max(0, Number.parseInt(row.repetitions || 0, 10) || 0),
    due_date: String(row.due_date || "").trim(),
    created_at: String(row.created_at || "").trim(),
  };
}

function findWord(rows, word) {
  const target = String(word || "").trim().toLowerCase();
  return rows.find(({ row }) => String(row.word || "").trim().toLowerCase() === target);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const rows = await getSheetRowsWithRowNumbers();
      sendJson(res, 200, rows.map(({ row }) => normalizeRow(row)));
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = String(body.action || "").trim();
    const rows = await getSheetRowsWithRowNumbers();
    const match = findWord(rows, body.word || body.original_word);

    if (!match) {
      sendJson(res, 404, { error: `Word '${body.word || body.original_word}' not found.` });
      return;
    }

    if (action === "update_stats") {
      const next = normalizeRow({
        ...match.row,
        interval: body.interval,
        ease_factor: body.ease_factor,
        repetitions: body.repetitions,
        due_date: body.due_date,
      });
      await updateSheetRow(match.rowNumber, next);
      sendJson(res, 200, { success: true });
      return;
    }

    if (action === "reset") {
      const next = normalizeRow({
        ...match.row,
        interval: 0,
        ease_factor: 2.5,
        repetitions: 0,
        due_date: "",
      });
      await updateSheetRow(match.rowNumber, next);
      sendJson(res, 200, { success: true });
      return;
    }

    if (action === "delete") {
      await clearSheetRow(match.rowNumber);
      sendJson(res, 200, { success: true });
      return;
    }

    if (action === "edit") {
      const newWord = String(body.new_word || body.word || "").trim();
      if (!newWord || !String(body.meaning || "").trim()) {
        sendJson(res, 400, { error: "word and meaning are required." });
        return;
      }
      const duplicate = rows.some(({ row, rowNumber }) =>
        rowNumber !== match.rowNumber && String(row.word || "").trim().toLowerCase() === newWord.toLowerCase()
      );
      if (duplicate) {
        sendJson(res, 409, { error: `"${newWord}" already exists.` });
        return;
      }
      const next = normalizeRow({
        ...match.row,
        word: newWord,
        meaning: body.meaning,
        example_sentence: body.example_sentence,
        example_translation: body.example_translation,
        interval: body.interval,
        ease_factor: body.ease_factor,
        repetitions: body.repetitions,
        due_date: body.due_date,
      });
      await updateSheetRow(match.rowNumber, next);
      sendJson(res, 200, { success: true });
      return;
    }

    sendJson(res, 400, { error: "Unknown action." });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
};
