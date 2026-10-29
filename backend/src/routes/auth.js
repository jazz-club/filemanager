const { Router } = require("express");
const bcrypt = require("bcrypt");
const { pool } = require("../db");

const router = Router();

/* 
	not too particularly sure about email-less auth but i am not dealing with mail servers
	i guess no forgot password flows? kinda would be cool to run a blacbox service where data just goes to the abyss and cant be recovered if you dont want it to
	maybe even no admin pages, idk
*/
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Username already taken" });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
      [username, hash]
    );

    req.session.userId = result.rows[0].id;
    req.session.username = result.rows[0].username;
    res.status(201).json({ message: "Account created", user: result.rows[0].username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "username or password missing" });

    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session error" });
      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ message: "Logged", user: user.username });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Could not logout" });
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});

// i know for a fact this isnt sufficient but i cant remember why
router.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user: req.session.username });
});

module.exports = router;
