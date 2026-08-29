const express = require("express");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");

const app = express();

app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads
app.use("/api/users", userRoutes);

module.exports = app;
