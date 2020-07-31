const express = require("express");
const ejs = require("ejs");
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
});
const fs = require("fs");
const path = require("path");
const { isText, isBinary } = require("istextorbinary");
const Str = require("@supercharge/strings");

const config = require("./config");

try {
  require("crypto");
} catch (err) {
  console.log("Crypto support is disabled.");
  return;
}

let crypto = require("crypto");

function getExtension(filename) {
  return filename.split(".").pop();
}

function isExtension(filename, extension) {
  const fileExtension = filename.split(".").pop();
  return fileExtension.toLowerCase() === extension.toLowerCase();
}

function loadMetadataFile(filename) {
  if (fs.existsSync(path.join(config.DATA_DIR, `${filename}.metadata.json`)))
    return JSON.parse(
      fs
        .readFileSync(path.join(config.DATA_DIR, `${filename}.metadata.json`))
        .toString()
    );
  return {
    originalName: filename,
    extension: getExtension(filename),
  };
}

const app = express();

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", async (req, res) => {
  res.render("index", { hasAccess: req.query["auth"] == config.PASSWORD });
});

app.post("/upload", upload.single("file"), async (req, res) => {
  console.log(req.file);
  if (!req.file)
    return res
      .status(400)
      .json({ error: true, message: "no file was provided" });
  const { originalname, encoding, mimetype, buffer, size } = req.file;
  const password = req.body["file_password"];
  if (size > 5e7)
    return res
      .status(400)
      .json({ error: true, message: "file is over 50MB big" });
  if (password) {
    if (!(password instanceof String))
      return res
        .status(400)
        .json({ error: true, message: "password is not a string" });
    if (password.length() > 16)
      return res.status(400).json({
        error: true,
        message: "password is longer than 16 characters",
      });
  }
  const randomBytes = Str.random(64);
  const newFileName = `${randomBytes.toString("utf8")}.${getExtension(
    originalname
  )}`;
  try {
    fs.writeFileSync(path.join(config.DATA_DIR, newFileName), buffer);
    fs.writeFileSync(
      path.join(config.DATA_DIR, `${newFileName}.metadata.json`),
      JSON.stringify({
        originalName: originalname,
        extension: getExtension(originalname),
      })
    );
  } catch (err) {
    return res.status(501).json({
      error: true,
      message: "internal server error, could not process file",
    });
  }
  return res.redirect(
    `/file/${newFileName}${password ? `?password=${password}` : ""}`
  );
});

app.get("/file/:filename", async (req, res) => {
  if (!req.params["filename"])
    return res
      .status(400)
      .json({ error: true, message: "no filename supplied" });
  if (!fs.existsSync(path.join(config.DATA_DIR, req.params["filename"])))
    return res.status(400).json({ error: true, message: "file not found" });
  const filename = req.params["filename"];
  const filepath = path.join(config.DATA_DIR, filename);
  const file = fs.readFileSync(filepath);
  const metadata = loadMetadataFile(filename);
  if (isBinary(filename, file)) {
    return res.sendFile(filepath);
  }
  if (file.toString().length > 5000) return res.send(file.toString());
  return res.render("textfile", {
    fileName: metadata.originalName,
    content: file.toString("utf8"),
  });
});

app.listen(config.PORT || 8080);
console.log(`Listening on port ${config.PORT || 8080}`);
