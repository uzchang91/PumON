const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

// 정적 파일 서빙 (프로젝트 루트)
app.use(express.static(path.join(__dirname)));

const API_BASE =
  "https://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2";

// 🔥 이 경로가 핵심
app.get("/api/abandonmentPublic_v2", async (req, res) => {
  try {
    const url = API_BASE + "?" + new URLSearchParams(req.query).toString();
    const r = await fetch(url);
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).send(e.toString());
  }
});

// 경기도 보호시설 API 프록시
app.get("/api/shelter", async (req, res) => {
  try {
    const url = "https://openapi.gg.go.kr/OrganicAnimalProtectionFacilit?" + new URLSearchParams(req.query).toString();
    const r = await fetch(url);
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).send(e.toString());
  }
});

// 전국 보호소 정보 API 프록시 (animalShelterSrvc_v2)
app.get("/api/shelterInfo_v2", async (req, res) => {
  try {
    const url = "https://apis.data.go.kr/1543061/animalShelterSrvc_v2/shelterInfo_v2?" + new URLSearchParams(req.query).toString();
    const r = await fetch(url);
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).send(e.toString());
  }
});

// 이미지 프록시
app.get("/img", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing url");

  const r = await fetch(url);
  res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
  const buf = Buffer.from(await r.arrayBuffer());
  res.send(buf);
});

app.listen(8787, "127.0.0.1", () => {
  console.log("✅ Proxy running at http://127.0.0.1:8787");
});
