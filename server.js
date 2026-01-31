import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// HTML 태그 제거 및 텍스트 정제 함수
function cleanText(text) {
  if (!text) return "";
  return text.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// 도서 검색 API
app.get("/search", async (req, res) => {
  const q = req.query.query;
  const url = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${process.env.ALADIN_TTB_KEY}&Query=${encodeURIComponent(q)}&QueryType=Title&MaxResults=10&SearchTarget=Book&output=js&Version=20131101`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    // 알라딘 JS 출력 특유의 세미콜론 제거 및 파싱
    const jsonStr = text.substring(0, text.lastIndexOf(';'));
    const data = JSON.parse(jsonStr);

    const books = (data.item || []).map(b => ({
      title: cleanText(b.title),
      author: cleanText(b.author),
      cover: b.cover.replace("coversum", "cover500"),
      description: cleanText(b.description)
    }));
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: "검색 실패" });
  }
});

// 노션에 추가 API
app.post("/addBook", async (req, res) => {
  const { title, author, cover, description } = req.body;
  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DB_ID },
        cover: cover ? { type: "external", external: { url: cover } } : undefined,
        properties: {
          "title": { title: [{ text: { content: title } }] },
          "author": { rich_text: [{ text: { content: author } }] }
        },
        children: description ? [
          { object: "block", type: "quote", quote: { rich_text: [{ text: { content: description.slice(0, 2000) } }] } }
        ] : []
      })
    });
    const result = await response.json();
    res.json({ ok: response.ok, id: result.id });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
