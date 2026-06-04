const crypto = require("crypto");

const CSV_HEADER = [
  "word",
  "meaning",
  "example_sentence",
  "example_translation",
  "interval",
  "ease_factor",
  "repetitions",
  "due_date",
  "created_at",
];

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(rows) {
  const lines = [
    CSV_HEADER.join(","),
    ...rows.map((row) => CSV_HEADER.map((key) => csvEscape(row[key])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function googleConfig() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || "voca";

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID are required.");
  }

  return { clientEmail, privateKey, spreadsheetId, sheetName };
}

async function getGoogleAccessToken(config) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(config.privateKey);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Failed to authenticate with Google.");
  }
  return data.access_token;
}

async function sheetsFetch(path, options = {}) {
  const config = googleConfig();
  const accessToken = await getGoogleAccessToken(config);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Google Sheets request failed.");
  }
  return data;
}

async function getSheetRows() {
  return (await getSheetRowsWithRowNumbers()).map(({ row }) => row);
}

async function getSheetRowsWithRowNumbers() {
  const config = googleConfig();
  const range = encodeURIComponent(`${config.sheetName}!A:I`);
  const data = await sheetsFetch(`/values/${range}`);
  const values = data.values || [];
  const hasHeader = values.length && values[0][0] === "word";
  const bodyRows = hasHeader ? values.slice(1) : values;
  const offset = hasHeader ? 2 : 1;
  return bodyRows
    .map((values, index) => ({
      rowNumber: index + offset,
      row: Object.fromEntries(CSV_HEADER.map((key, columnIndex) => [key, values[columnIndex] ?? ""])),
    }))
    .filter(({ row }) => Object.values(row).some((cell) => String(cell || "").trim() !== ""));
}

async function appendSheetRow(row) {
  const config = googleConfig();
  const range = encodeURIComponent(`${config.sheetName}!A:I`);
  await sheetsFetch(`/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({
      values: [CSV_HEADER.map((key) => row[key] ?? "")],
    }),
  });
}

async function updateSheetRow(rowNumber, row) {
  const config = googleConfig();
  const range = encodeURIComponent(`${config.sheetName}!A${rowNumber}:I${rowNumber}`);
  await sheetsFetch(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({
      values: [CSV_HEADER.map((key) => row[key] ?? "")],
    }),
  });
}

async function clearSheetRow(rowNumber) {
  const config = googleConfig();
  const range = encodeURIComponent(`${config.sheetName}!A${rowNumber}:I${rowNumber}`);
  await sheetsFetch(`/values/${range}:clear`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("");
}

async function createCardWithAI(word) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You create English vocabulary flashcards for a Korean learner. Return concise Korean meanings and one natural English example sentence with Korean translation.",
        },
        {
          role: "user",
          content: `Create a vocabulary flashcard for this English word or phrase: ${word}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "voca_card",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["word", "meaning", "example_sentence", "example_translation"],
            properties: {
              word: { type: "string" },
              meaning: { type: "string" },
              example_sentence: { type: "string" },
              example_translation: { type: "string" },
            },
          },
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  return JSON.parse(outputText(data));
}

module.exports = {
  CSV_HEADER,
  appendSheetRow,
  buildCsv,
  clearSheetRow,
  createCardWithAI,
  getSheetRows,
  getSheetRowsWithRowNumbers,
  sendJson,
  updateSheetRow,
};
