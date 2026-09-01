import express from "express";
const app = express();
app.listen(PORT, '0.0.0.0', () => {
  console.log('Money Watch Pro server running on http://0.0.0.0:' + PORT);
});