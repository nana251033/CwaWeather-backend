require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

app.use(cors());
app.use(express.json());

// 🌤 縣市英文對照（因不同 API 有 cityName vs locationName）
const CITY_MAP = {
  臺北市: "Taipei",
  新北市: "NewTaipei",
  桃園市: "Taoyuan",
  臺中市: "Taichung",
  臺南市: "Tainan",
  高雄市: "Kaohsiung",
  基隆市: "Keelung",
  新竹市: "Hsinchu",
  嘉義市: "Chiayi",
};

// 👉 主 API：一次返回「未來 1 週」＋「24 小時」
app.get("/api/weather", async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器未設定 CWA_API_KEY",
      });
    }

    const city = req.query.city || "臺北市";
    const cityEng = CITY_MAP[city] || "Taipei";

    // API URLs
    const weekURL = `${CWA_API_BASE_URL}/v1/rest/datastore/F-D0047-091`;
    const dailyURL = `${CWA_API_BASE_URL}/v1/rest/datastore/F-A0085-005`;

    // 🌤 同時呼叫 API（加速）
    const [weekRes, dailyRes] = await Promise.all([
      axios.get(weekURL, {
        params: { Authorization: CWA_API_KEY, locationName: city },
      }),
      axios.get(dailyURL, {
        params: { Authorization: CWA_API_KEY, locationName: cityEng },
      }),
    ]);

    // --- 處理一週天氣 ---
    const weekLocation = weekRes.data.records.locations[0].location[0];
    const weekData = weekLocation.weatherElement.map((el) => ({
      elementName: el.elementName,
      description: el.description,
      time: el.time,
    }));

    // --- 處理 24 小時天氣 ---
    const dailyLocation = dailyRes.data.records.locations[0].location[0];
    const dailyData = dailyLocation.weatherElement.map((el) => ({
      elementName: el.elementName,
      description: el.description,
      time: el.time,
    }));

    res.json({
      success: true,
      city,
      cityEng,
      weekly: weekData,
      hourly24: dailyData,
    });

  } catch (err) {
    console.error("❌ 天氣 API 呼叫失敗", err.message);
    res.status(500).json({
      success: false,
      error: "無法取得天氣資料",
      details: err.message,
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "CWA Weather API Ready",
    example: "/api/weather?city=臺北市",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
