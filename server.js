import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.get("/search", async (req, res) => {
  const q = req.query.query;
  const url =
    "https://www.aladin.co.kr/ttb/api/ItemSearch.aspx" +
    `?ttbkey=${process.env.ALADIN_TTB_KEY}` +
    `&Query=${encodeURIComponent(q)}` +
    "&QueryType=Title&MaxResults=5&SearchTarget=Book&output=js&Version=20131101";

  try {
    const r = await fetch(url);
    const data = await r.json();

    const books = (data.item || []).map(b => ({
      title: b.title,
      author: b.author,
      cover: b.cover
    }));

    res.json(books);
  } catch (error) {
    res.status(500).json({ error: "검색 중 오류가 발생했습니다" });
  }
});

app.post("/addBook", async (req, res) => {
  const { title, author, cover } = req.body;

  try {
    await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DB_ID },
        properties: {
          이름: {
            title: [{ text: { content: title } }]
          },
          author: {
            rich_text: [{ text: { content: author } }]
          },
          cover: {
            files: [{
              name: "cover",
              external: { url: cover }
            }]
          }
        }
      })
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "노션 추가 중 오류가 발생했습니다" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
