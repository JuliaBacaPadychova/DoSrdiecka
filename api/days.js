const { rest } = require("../lib/supabase");
const { sendJson, withErrors } = require("../lib/http");

function pad2(n) {
  return String(n).padStart(2, "0");
}

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const url = new URL(req.url, "http://x");
  const year = parseInt(url.searchParams.get("year"), 10);
  const month = parseInt(url.searchParams.get("month"), 10); // 1-12

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return sendJson(res, 400, { error: "invalid_year_or_month" });
  }

  const from = `${year}-${pad2(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${pad2(nextMonth)}-01`;

  const days = await rest(
    `day_capacity?select=*&day=gte.${from}&day=lt.${to}&order=day.asc`
  );

  sendJson(res, 200, { days });
});
