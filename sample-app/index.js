const express = require("express");
const app = express();
const port = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#f8fafc">
        <div style="text-align:center">
          <h1 style="font-size:2.5rem;margin-bottom:0.5rem">Hello from brimble-pipeline</h1>
          <p style="color:#94a3b8">Running on port ${port}</p>
        </div>
      </body>
    </html>
  `);
});

app.listen(port, () => console.log(`listening on :${port}`));
