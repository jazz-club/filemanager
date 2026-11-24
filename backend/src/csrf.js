const crypto = require("crypto");
const logger = require("./logger");

function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

function timingSafeMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function csrfProtection(req, res, next) {
  if (!req.session) {
    return next(new Error("csrf trip"));
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }

  res.cookie("XSRF-TOKEN", req.session.csrfToken, {
    sameSite: "strict",
    secure: true,
    httpOnly: false,
    path: "/",
  });

  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  const incomingToken =
    req.headers["x-csrf-token"] ||
    req.headers["csrf-token"] ||
    (req.body && (req.body.csrfToken || req.body._csrf));

  if (!incomingToken || !timingSafeMatch(incomingToken, req.session.csrfToken)) {
    logger.audit({
      event: "SECURITY_CSRF_REJECTED",
      req,
      outcome: "REJECTED",
      level: "WARN",
      statusCode: 403,
      details: {
        method: req.method,
        path: req.originalUrl || req.url,
        hasToken: !!incomingToken,
        tokenMismatch: !!incomingToken,
      },
    });

    return res.status(403).json({
      error: "missing cstf token, try refreshing",
    });
  }

  next();
}

module.exports = {
  generateCsrfToken,
  csrfProtection,
};
