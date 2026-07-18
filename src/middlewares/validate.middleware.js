export const validate = (schema, key = "body") => (req, res, next) => {
  const result = schema.safeParse(req[key]);

  if (!result.success) {
    return res.status(400).json({
      message: "Validation failed.",
      details: result.error.flatten(),
    });
  }

  if (key === "query" && req.query && typeof req.query === "object") {
    for (const existingKey of Object.keys(req.query)) {
      delete req.query[existingKey];
    }

    Object.assign(req.query, result.data);
  } else {
    req[key] = result.data;
  }

  return next();
};
