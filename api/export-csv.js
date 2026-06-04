const { buildCsv, getSheetRows } = require("./lib/voca-shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const configuredSecret = process.env.EXPORT_CSV_SECRET;
  if (configuredSecret && req.headers["x-export-csv-secret"] !== configuredSecret && req.query?.secret !== configuredSecret) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Invalid export secret." }));
    return;
  }

  try {
    const rows = await getSheetRows();
    const csv = buildCsv(rows);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="voca.csv"');
    res.setHeader("Cache-Control", "no-store");
    res.end(csv);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message || "Unexpected server error." }));
  }
};
