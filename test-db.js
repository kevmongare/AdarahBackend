import { pool } from "./db.js";

(async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("DB connected:", res.rows[0]);
  } catch (err) {
    console.error("DB connection error:", err);
  } finally {
    await pool.end();
  }
})();
