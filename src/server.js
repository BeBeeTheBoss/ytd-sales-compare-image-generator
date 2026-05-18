const path = require("path");
const fs = require("fs");
const express = require("express");
const { saveDashboardPng } = require("./dashboardSvg");

const app = express();
const port = Number(process.env.PORT || 5000);
const host = process.env.HOST || "0.0.0.0";
const rootDir = path.join(__dirname, "..");
const outputDir = path.join(rootDir, "outputs");
const publicDir = path.join(rootDir, "public");

app.use(express.json({ limit: "15mb" }));
app.use("/images", express.static(outputDir));
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "report-image-api" });
});

app.post("/api/report-image", async (req, res) => {
  const { valid, errors } = validateArrayPayload(req.body);
  if (!valid) {
    return res.status(400).json({ ok: false, message: "Invalid payload", errors });
  }

  try {
    const { filename } = await saveDashboardPng(req.body, outputDir);
    const imageUrl = `${req.protocol}://${req.get("host")}/images/${filename}`;

    return res.json({
      ok: true,
      message: "Report image generated",
      image_url: imageUrl
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to generate image",
      error: error.message
    });
  }
});

app.delete("/api/report-image/:filename", async (req, res) => {
  const rawName = String(req.params.filename || "").trim();
  const filename = path.basename(rawName);

  if (!filename || filename !== rawName) {
    return res.status(400).json({
      ok: false,
      message: "Invalid filename"
    });
  }

  const targetPath = path.join(outputDir, filename);
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
  } catch (_err) {
    return res.status(404).json({
      ok: false,
      message: "Image not found"
    });
  }

  try {
    await fs.promises.unlink(targetPath);
    return res.json({
      ok: true,
      message: "Image deleted",
      filename
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete image",
      error: error.message
    });
  }
});

app.delete("/api/report-images", async (_req, res) => {
  try {
    const entries = await fs.promises.readdir(outputDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    await Promise.all(
      files.map((name) => fs.promises.unlink(path.join(outputDir, name)))
    );

    return res.json({
      ok: true,
      message: "All generated images deleted",
      deleted_count: files.length
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete images",
      error: error.message
    });
  }
});

function validateArrayPayload(payload) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return { valid: false, errors: ["Payload must be a non-empty JSON array"] };
  }

  const errors = [];
  payload.forEach((row, idx) => {
    if (!row || typeof row !== "object") {
      errors.push(`row[${idx}] must be an object`);
      return;
    }

    if (typeof row.product_category_name !== "string") {
      errors.push(`row[${idx}].product_category_name must be a string`);
    }

    if (typeof row.branch_name !== "string") {
      errors.push(`row[${idx}].branch_name must be a string`);
    }

    if (Number.isNaN(Number(row.ytd_previous_saleamnt))) {
      errors.push(`row[${idx}].ytd_previous_saleamnt must be numeric string/number`);
    }

    if (Number.isNaN(Number(row.ytd_previous_billno))) {
      errors.push(`row[${idx}].ytd_previous_billno must be numeric string/number`);
    }
  });

  return { valid: errors.length === 0, errors };
}

app.listen(port, host, () => {
  console.log(`Report image API is running on http://${host}:${port}`);
});
