require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// 台灣縣市列表
const TAIWAN_LOCATIONS = [
  "宜蘭縣","花蓮縣","臺東縣","澎湖縣","金門縣","連江縣",
  "臺北市","新北市","桃園市","臺中市","臺南市","高雄市",
  "基隆市","新竹縣","新竹市","苗栗縣","彰化縣","南投縣",
  "雲林縣","嘉義縣","嘉義市","屏東縣"
];

// ⭐️ CWA API 地名映射表 (解決 新竹市/嘉義市 的問題)
const CWA_NAME_MAP = {
    "新竹市": "新竹縣",
    "嘉義市": "嘉義縣",
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 統一的 CWA API 請求函數 (從您成功的代碼中提取)
 */
const fetchCwaData = async (locationName) => {
  if (!CWA_API_KEY) {
    throw new Error("請在 .env 檔案中設定 CWA_API_KEY");
  }

  // 使用 F-C0032-001 (36小時預報)
  const response = await axios.get(
    `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
    {
      params: {
        Authorization: CWA_API_KEY,
        locationName: locationName, // 傳入動態的縣市名稱
      },
    }
  );
  return response.data;
};


/**
 * 取得指定縣市的天氣預報 (通用化函數)
 * 使用 F-C0032-001 資料集
 */
const getGeneralWeather = async (req, res) => {
  try {
    const requestedLocationName = req.query.locationName;
    if (!requestedLocationName) {
      return res.status(400).json({ error: "缺少參數", message: "請提供 locationName" });
    }

    // 處理地名映射 (例如新竹市 => 新竹縣)
    const apiLocationName = CWA_NAME_MAP[requestedLocationName] || requestedLocationName;

    // 呼叫 CWA API
    const data = await fetchCwaData(apiLocationName);

    // 找到目標縣市的資料
    const locationData = data.records.location.find(
        loc => loc.locationName === apiLocationName
    );

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${apiLocationName} 的天氣資料`,
      });
    }

    // 整理天氣資料
    const weatherData = {
      city: requestedLocationName, // 回傳用戶查詢的名稱
      updateTime: data.records.datasetDescription,
      currentWeather: { temperature: 'N/A°C', weatherDescription: 'N/A' }, // 初始化
      forecasts: [],
    };

    // 解析天氣要素
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements[0].time[i].startTime,
        endTime: weatherElements[0].time[i].endTime,
        // ⭐️ 將所有預報元素解析到 forecast 物件
        weather: "", 
        rain: "",
        minTemp: "",
        maxTemp: "",
        // ... 其他元素
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            forecast.rain = value.parameterName + "%";
            break;
          case "MinT":
            forecast.minTemp = value.parameterName + "°C";
            break;
          case "MaxT":
            forecast.maxTemp = value.parameterName + "°C";
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
          // ... 省略其他元素，如果需要請自行添加
        }
      });
      
      // ⭐️ 如果是第一個預報時段，提取為當前天氣估算
      if (i === 0) {
          const avgT = (parseInt(forecast.minTemp) + parseInt(forecast.maxTemp)) / 2;
          weatherData.currentWeather = {
              temperature: `${Math.round(avgT)}°C`,
              weatherDescription: forecast.weather
          };
      }

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      // API 回應錯誤
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: error.message || "無法取得天氣資料，請稍後再試",
    });
  }
};


// Routes
app.get("/", (req, res) => {
  res.json({
    message: "CWA 天氣預報 API",
    endpoints: {
      weather: "/api/weather?locationName={縣市名稱}", // ⭐️ 新增通用路徑
      health: "/api/health",
      locations: "/api/locations"
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ⭐️ 新增/api/locations 供前端下拉選單使用
app.get("/api/locations", (req, res) => res.json({ success: true, data: TAIWAN_LOCATIONS }));

// ⭐️ 新增通用天氣預報端點
app.get("/api/weather", getGeneralWeather);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作 on port ${PORT}`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});