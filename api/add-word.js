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

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function parseCsv(csvText) {
  const normalized = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    header.forEach((key, index) => {
      row[key] = values[index] ?? "";
    });
    return row;
  });
}

function buildCsv(rows) {
  const lines = [
    CSV_HEADER.join(","),
    ...rows.map((row) => CSV_HEADER.map((key) => csvEscape(row[key])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
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
          content: `Create a voca.csv flashcard for this English word or phrase: ${word}`,
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

function githubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPO are required.");
  }

  return {
    token,
    repo,
    branch: process.env.GITHUB_BRANCH || "main",
    path: process.env.GITHUB_CSV_PATH || "voca.csv",
  };
}

async function getCsvFromGithub(config) {
  const url = `https://api.github.com/repos/${config.repo}/contents/${encodeURIComponent(config.path)}?ref=${encodeURIComponent(config.branch)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to read voca.csv from GitHub.");
  }

  return {
    sha: data.sha,
    csvText: Buffer.from(data.content, "base64").toString("utf8"),
  };
}

async function updateCsvOnGithub(config, sha, csvText, word) {
  const url = `https://api.github.com/repos/${config.repo}/contents/${encodeURIComponent(config.path)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `Add vocabulary word: ${word}`,
      content: Buffer.from(csvText, "utf8").toString("base64"),
      sha,
      branch: config.branch,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to update voca.csv on GitHub.");
  }
  return data.commit?.html_url || data.content?.html_url;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const configuredSecret = process.env.ADD_WORD_SECRET;
  if (configuredSecret && req.headers["x-add-word-secret"] !== configuredSecret) {
    sendJson(res, 401, { error: "Invalid add-word secret." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const word = String(body.word || "").trim();
    if (!word) {
      sendJson(res, 400, { error: "English word is required." });
      return;
    }

    const config = githubConfig();
    const card = await createCardWithAI(word);
    const { sha, csvText } = await getCsvFromGithub(config);
    const rows = parseCsv(csvText);

    if (rows.some((row) => String(row.word || "").toLowerCase() === card.word.toLowerCase())) {
      sendJson(res, 409, { error: `"${card.word}" already exists in voca.csv.` });
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
    const updatedCsv = buildCsv([...rows, row]);
    const commitUrl = await updateCsvOnGithub(config, sha, updatedCsv, row.word);

    sendJson(res, 200, { success: true, word: row, commit_url: commitUrl });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
};
