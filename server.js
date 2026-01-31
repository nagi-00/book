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

// 도서 검색 API
app.get("/search", async (req, res) => {
  const q = req.query.query;

  if (!q) {
    return res.status(400).json({ error: "검색어를 입력해주세요" });
  }

  const url =
    "https://www.aladin.co.kr/ttb/api/ItemSearch.aspx" +
    `?ttbkey=${process.env.ALADIN_TTB_KEY}` +
    `&Query=${encodeURIComponent(q)}` +
    "&QueryType=Title&MaxResults=10&SearchTarget=Book&output=js&Version=20131101";

  try {
    const r = await fetch(url);
    const text = await r.text();

    // 알라딘 API는 JSONP 형식으로 응답할 수 있으므로 파싱
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // JSONP 형식인 경우 처리
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      } else {
        throw new Error("Invalid response format");
      }
    }

    const books = (data.item || []).map(b => ({
      isbn: b.isbn13 || b.isbn,
      title: b.title,
      author: b.author,
      publisher: b.publisher,
      pubDate: b.pubDate,
      cover: b.cover?.replace("coversum", "cover500") || b.cover,
      description: b.description,
      categoryName: b.categoryName,
      link: b.link
    }));

    res.json(books);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "검색 실패" });
  }
});

// 도서 상세 정보 API
app.get("/detail", async (req, res) => {
  const isbn = req.query.isbn;
  const url =
    "https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx" +
    `?ttbkey=${process.env.ALADIN_TTB_KEY}` +
    `&itemIdType=ISBN13&ItemId=${isbn}` +
    "&output=js&Version=20131101&OptResult=ebookList,usedList,reviewList";

  try {
    const r = await fetch(url);
    const text = await r.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      } else {
        throw new Error("Invalid response format");
      }
    }

    const b = data.item?.[0];

    if (!b) {
      return res.status(404).json({ error: "책을 찾을 수 없습니다" });
    }

    res.json({
      isbn: b.isbn13 || b.isbn,
      title: b.title,
      author: b.author,
      publisher: b.publisher,
      pubDate: b.pubDate,
      cover: b.cover?.replace("coversum", "cover500") || b.cover,
      description: b.description,
      categoryName: b.categoryName,
      link: b.link,
      priceStandard: b.priceStandard,
      priceSales: b.priceSales,
      customerReviewRank: b.customerReviewRank
    });
  } catch (err) {
    console.error("Detail error:", err);
    res.status(500).json({ error: "상세 정보 로드 실패" });
  }
});

// 노션에 도서 추가
app.post("/addBook", async (req, res) => {
  const { title, author, cover, description } = req.body;

  try {
    const properties = {
      "title": {
        title: [{ text: { content: title || "" } }]
      },
      "author": {
        rich_text: [{ text: { content: author || "" } }]
      }
    };

    // cover 속성 추가 (URL 타입)
    if (cover) {
      properties["cover"] = {
        url: cover
      };
    }

    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DB_ID },
        cover: cover ? {
          type: "external",
          external: { url: cover }
        } : undefined,
        properties: properties,
        children: description ? [
          {
            object: "block",
            type: "quote",
            quote: {
              rich_text: [{ type: "text", text: { content: description.slice(0, 2000) } }]
            }
          }
        ] : []
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Notion API error:", result);
      return res.status(response.status).json({ error: result.message || "노션 추가 실패" });
    }

    res.json({ ok: true, pageId: result.id });
  } catch (err) {
    console.error("Add book error:", err);
    res.status(500).json({ error: "노션 추가 실패" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
