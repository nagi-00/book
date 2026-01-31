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

// 텍스트 정제 함수 (HTML 태그 및 특수문자 제거)
function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/<[^>]*>?/gm, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// 1. 도서 검색 API
app.get("/search", async (req, res) => {
  const q = req.query.query;
  if (!q) return res.status(400).json({ error: "검색어를 입력하세요." });

  const url = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${process.env.ALADIN_TTB_KEY}&Query=${encodeURIComponent(q)}&QueryType=Title&MaxResults=10&SearchTarget=Book&output=js&Version=20131101`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    // 알라딘의 js 응답에서 실제 JSON 데이터 부분만 추출
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid JSON format from Aladin");
    
    const data = JSON.parse(match[0]);

    const books = (data.item || []).map(b => ({
      title: cleanText(b.title),
      author: cleanText(b.author),
      cover: b.cover.replace("coversum", "cover500"), // 고화질 이미지로 교체
      description: cleanText(b.description || "소개글이 없습니다.")
    }));

    res.json(books);
  } catch (err) {
    console.error("Search Error:", err);
    res.status(500).json({ error: "검색 실패" });
  }
});

// 2. 노션 추가 API
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
        cover: { type: "external", external: { url: cover } },
        properties: {
          "title": { title: [{ text: { content: title } }] },
          "author": { rich_text: [{ text: { content: author } }] }
        },
        children: [
          {
            object: "block",
            type: "quote",
            quote: {
              rich_text: [{ text: { content: description.slice(0, 2000) } }]
            }
          }
        ]
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    
    res.json({ ok: true });
  } catch (err) {
    console.error("Notion Error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
