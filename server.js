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

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/<[^>]*>?/gm, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// 도서 검색 API
app.get("/search", async (req, res) => {
  const q = req.query.query;
  if (!q) return res.status(400).json({ error: "검색어 없음" });

  // 알라딘 API 호출 주소 (output=js 대신 output=js를 쓰되, 파싱을 더 안전하게 합니다)
  const url = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${process.env.ALADIN_TTB_KEY}&Query=${encodeURIComponent(q)}&QueryType=Title&MaxResults=10&SearchTarget=Book&output=js&Version=20131101`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    // 알라딘 응답이 'fn_callback({"item":...});' 형태일 경우를 대비해
    // 첫 번째 '{' 부터 마지막 '}' 까지만 잘라냅니다.
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}') + 1;
    
    if (startIdx === -1 || endIdx === 0) {
      throw new Error("API 응답에 JSON 데이터가 포함되어 있지 않습니다.");
    }

    const jsonStr = text.substring(startIdx, endIdx);
    const data = JSON.parse(jsonStr);

    if (data.errorCode) {
      throw new Error(`알라딘 API 에러: ${data.errorMessage}`);
    }

    const books = (data.item || []).map(b => ({
      title: cleanText(b.title),
      author: cleanText(b.author),
      cover: b.cover ? b.cover.replace("coversum", "cover500") : "",
      description: cleanText(b.description || "소개글이 없습니다.")
    }));

    res.json(books);
  } catch (err) {
    // 터미널(VS Code 콘솔)에 뜨는 에러 메시지를 확인해 주세요!
    console.error("--- 서버 에러 상세 정보 ---");
    console.error(err.message);
    res.status(500).json({ error: "검색 실패" });
  }
});

// 노션 추가 API (동일)
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
          "title": { title: [{ text: { content: title || "제목 없음" } }] },
          "author": { rich_text: [{ text: { content: author || "저자 미상" } }] }
        },
        children: description ? [
          { object: "block", type: "quote", quote: { rich_text: [{ text: { content: description.slice(0, 2000) } }] } }
        ] : []
      })
    });
    const result = await response.json();
    res.json({ ok: response.ok, id: result.id });
  } catch (err) {
    console.error("Notion Error:", err);
    res.status(500).json({ ok: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
