import slugify from "slugify";

export const toSlug = (value) =>
  slugify(value || "", {
    lower: true,
    strict: true,
    trim: true,
  });

export const safeJsonParse = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
};

export const buildOrderNumber = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
export const buildInvoiceNumber = () => `INV-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

export const formatCurrency = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(amount / 100);

export const getPagination = (query) => {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 50);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
};

export const isAdminRole = (role) => ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR"].includes(role);

export const matchesPublishedState = (course) => {
  if (course.isDeleted) {
    return false;
  }

  if (course.status === "PUBLISHED") {
    return true;
  }

  return course.status === "SCHEDULED" && course.scheduledAt && new Date(course.scheduledAt) <= new Date();
};

export const toCsv = (rows) => {
  if (!rows.length) {
    return "";
  }

  const columns = Object.keys(rows[0]);

  return [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((column) => {
          const value = row[column] ?? "";
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");
};

