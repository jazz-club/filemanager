const { Router } = require("express");
const { pool } = require("../db/connection");
const logger = require("../logger");
const { decryptText, decryptJson, auditOwnerKey } = require("../crypto");

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const category = (req.query.category || "all").toLowerCase().trim();
    const outcome = (req.query.outcome || "all").toUpperCase().trim();
    const search = (req.query.search || "").trim();

    const conditions = ["user_id = $1"];
    const values = [auditOwnerKey(userId)];
    let paramIndex = 2;

    if (category !== "all") {
      if (category === "uploads") {
        conditions.push(`event ILIKE '%UPLOAD%'`);
      } else if (category === "downloads") {
        conditions.push(`event ILIKE '%DOWNLOAD%'`);
      } else if (category === "deletes") {
        conditions.push(`event ILIKE '%DELETE%'`);
      } else if (category === "shares") {
        conditions.push(`event ILIKE '%SHARE%'`);
      } else if (category === "folders") {
        conditions.push(`event ILIKE 'FOLDER_%'`);
      } else if (category === "auth") {
        conditions.push(`event ILIKE 'AUTH_%'`);
      }
    }

    if (outcome !== "ALL") {
      conditions.push(`outcome = $${paramIndex}`);
      values.push(outcome);
      paramIndex++;
    }

    const whereClause = "WHERE " + conditions.join(" AND ");

    const countQ = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause}`,
      values
    );
    const baseTotal = countQ.rows[0]?.total || 0;
    const paginationClause = search ? "" : `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const dataValues = search ? values : [...values, limit, offset];
    const dataQ = await pool.query(
      `SELECT event, action, level, outcome, status_code AS "statusCode",
              method, item_type AS "itemType", item_name AS "itemName",
              (details - 'folderId' - 'targetFolderId') AS details, created_at AS "createdAt"
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       ${paginationClause}`,
      dataValues
    );

    const decodedLogs = dataQ.rows.map((row) => ({
      ...row,
      action: decryptText(row.action),
      itemName: decryptText(row.itemName),
      details: stripIdentifiers(decryptJson(row.details)),
    }));
    const matchingLogs = search
      ? decodedLogs.filter((row) =>
          [row.action, row.itemName, row.event].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(search.toLowerCase())
          )
        )
      : decodedLogs;
    const total = search ? matchingLogs.length : baseTotal;
    const logs = search ? matchingLogs.slice(offset, offset + limit) : matchingLogs;

    const statsQ = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN event ILIKE '%UPLOAD%' THEN 1 END)::int AS uploads,
         COUNT(CASE WHEN event ILIKE '%DOWNLOAD%' THEN 1 END)::int AS downloads,
         COUNT(CASE WHEN event ILIKE '%DELETE%' THEN 1 END)::int AS deletes,
         COUNT(CASE WHEN event ILIKE '%SHARE%' THEN 1 END)::int AS shares,
         COUNT(CASE WHEN event ILIKE 'FOLDER_%' THEN 1 END)::int AS folders,
         COUNT(CASE WHEN event ILIKE 'AUTH_%' THEN 1 END)::int AS auth
       FROM audit_logs
       WHERE user_id = $1`,
      [auditOwnerKey(userId)]
    );

    res.json({
      logs,
      total,
      limit,
      offset,
      stats: statsQ.rows[0] || {
        total,
        uploads: 0,
        downloads: 0,
        deletes: 0,
        shares: 0,
        folders: 0,
        auth: 0,
      },
    });
  } catch (err) {
    console.error("Fetch audit logs error:", err);
    res.status(500).json({ error: "Failed to load audit logs" });
  }
});

function stripIdentifiers(value) {
  if (Array.isArray(value)) return value.map(stripIdentifiers);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).reduce((result, key) => {
    if (!/(^|_)(id|ids)$/i.test(key) && !/Id(s)?$/.test(key))
      result[key] = stripIdentifiers(value[key]);
    return result;
  }, {});
}

router.post("/clear", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    await pool.query("DELETE FROM audit_logs WHERE user_id = $1", [auditOwnerKey(userId)]);
    res.json({ message: "Audit history cleared" });
  } catch (err) {
    console.error("Clear audit logs error:", err);
    res.status(500).json({ error: "Failed to clear audit logs" });
  }
});

module.exports = router;
