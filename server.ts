import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Web Scraping
  app.post("/api/scrape-manga", async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      const $ = cheerio.load(response.data);
      
      // Improved title extraction with multiple common patterns
      let title = "";
      const titleSelectors = [
        ".entry-title",
        ".title",
        "h1.title",
        ".manga-title",
        "h1",
        "title"
      ];
      
      for (const selector of titleSelectors) {
        const text = $(selector).first().text().trim();
        if (text) {
          title = text;
          break;
        }
      }

      // Improved image extraction
      let imageUrl = "";
      const imageSelectors = [
        ".thumb img",
        ".manga-thumb img",
        ".wp-manga-thumb img",
        "img[itemprop='image']",
        ".poster img",
        ".book-cover img"
      ];

      for (const selector of imageSelectors) {
        const src = $(selector).first().attr("src") || $(selector).first().attr("data-src");
        if (src) {
          imageUrl = src;
          break;
        }
      }
      
      // Improved chapter count extraction
      let chapterCount = 0;
      
      // 1. Try user-provided specific structure
      const firstChapterLi = $("#chapterlist .clstyle li").first();
      const dataNum = firstChapterLi.attr("data-num");
      if (dataNum) {
        chapterCount = parseInt(dataNum);
      }
      
      // 2. If not found, try to find the highest number in a list of chapters
      if (chapterCount === 0) {
        const chapterListSelectors = [
          "#chapterlist .clstyle li",
          ".chapter-list li",
          ".chapters-list li",
          ".wp-manga-chapter",
          ".eplister li"
        ];
        
        for (const selector of chapterListSelectors) {
          const items = $(selector);
          if (items.length > 0) {
            // Try to get max from data-num attribute if it exists
            items.each((_, el) => {
              const num = $(el).attr("data-num");
              if (num) {
                const parsed = parseInt(num);
                if (parsed > chapterCount) chapterCount = parsed;
              }
            });
            
            // If still 0, use the length of the list
            if (chapterCount === 0) {
              chapterCount = items.length;
            }
            break;
          }
        }
      }

      // 3. Last resort: scan all text for "Chapter X" patterns
      if (chapterCount === 0) {
        const bodyText = $("body").text();
        const matches = bodyText.match(/(?:Chapter|ตอนที่|ตอน)\s*(\d+(?:\.\d+)?)/gi);
        if (matches) {
          const numbers = matches.map(m => {
            const numMatch = m.match(/\d+(?:\.\d+)?/);
            return numMatch ? parseFloat(numMatch[0]) : 0;
          });
          chapterCount = Math.floor(Math.max(...numbers));
        }
      }

      // Improved latest update date extraction
      let lastUpdated = firstChapterLi.find(".chapterdate").text().trim();
      
      if (!lastUpdated) {
        const dateSelectors = [
          ".chapter-release-date",
          ".chapter-date",
          ".updated-on",
          ".date",
          "time"
        ];
        for (const selector of dateSelectors) {
          const dateText = $(selector).first().text().trim();
          if (dateText) {
            lastUpdated = dateText;
            break;
          }
        }
      }

      res.json({
        title,
        imageUrl,
        chapterCount,
        lastUpdated,
        url
      });
    } catch (error) {
      console.error("Scraping error:", error);
      res.status(500).json({ error: "Failed to scrape manga info" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
