const express = require("express");
const app = express();
const AdminRoute = require("./route/AdminRoute");
const PublicRoute = require("./route/PublicRoute");

const bodyParser = require("body-parser");
const { testConnection } = require("./models/index");
const cors = require("cors");
const log = require("./util/Log");

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
app.use(log.LogRequest);

AdminRoute(app);
PublicRoute(app);
// app.use(log.LogResponse);

app.get("*", (req, res) => {
  res.send("Hello, World!");
});

const PORT = process.env.NODE_ENV === "production" ? 4011 : 4012;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
