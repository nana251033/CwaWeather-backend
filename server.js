// server.js with updated CWA API calls (F-D0047-091 and F-A0085-005) - Dynamic Location

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
// 氣象署 API 金鑰，從 .env 檔案讀取
const CWA_API_KEY = process.env.CWA_API_KEY;

// 台灣所有縣市/縣市列表 (F-D0047-091 & F-A0085-005 支援的縣市名稱)
const TAIWAN_LOCATIONS = [
    "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣",
    "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
    "基隆市", "新竹縣", "新竹市", "苗栗縣", "彰化縣", "南投縣",
    "雲林縣", "嘉義縣", "嘉義市", "屏東縣"
];

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 輔助函式：呼叫 CWA API
 * @param {string} datasetId - 氣象資料集代碼 (e.g., F-D0047-091)
 * @param {Object} params - 查詢參數 (e.g., locationName, elements)
 */
const fetchCwaData = async (datasetId, params = {}) => {
  if (!CWA_API_KEY) {
    throw new Error("伺服器設定錯誤: 請在 .env 檔案中設定 CWA_API_KEY");
  }

  const url = `${CWA_API_BASE_URL}/v1/rest/datastore/${datasetId}`;
  
  // 設置預設參數，並覆寫授權碼
  const apiParams = {
    Authorization: CWA_API_KEY,
    ...params
  };

  const response = await axios.get(url, { params: apiParams });
  return response.data;
};

/**
 * 取得指定縣市的綜合天氣資訊 (使用 F-D0047-091 和 F-A0085-005)
 * 透過 req.query.locationName 接收縣市名稱。
 *
 * @param {express.Request} req 
 * @param {express.Response} res 
 */
const getCombinedWeather = async (req, res) => {
  try {
    const locationName = req.query.locationName;

    // 1. 參數檢查
    if (!locationName) {
        return res.status(400).json({
            error: "缺少參數",
            message: "請提供 locationName 查詢參數。",
        });
    }
    if (!TAIWAN_LOCATIONS.includes(locationName)) {
        return res.status(400).json({
            error: "地點無效",
            message: `地點 ${locationName} 不在支援列表中。`,
        });
    }

    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 2. 同時發送兩個 API 請求
    const twoWeekForecastPromise = fetchCwaData('F-D0047-091', {
      locationName: locationName,
      // 請求氣溫(T)和天氣現象(Wx)
      elementName: "T,Wx", 
    });

    // 紫外線指數 F-A0085-005 的 locationName 參數通常無效，故不帶
    const uvIndexPromise = fetchCwaData('F-A0085-005');
    
    const [twoWeekForecastData, uvIndexData] = await Promise.all([
      twoWeekForecastPromise,
      uvIndexPromise
    ]);
    
    // --- 3. 整理 F-D0047-091 (兩週預報) 資料 ---
    
    const targetLocation = twoWeekForecastData.records.locations[0].location.find(
      loc => loc.locationName === locationName
    );
    
    let forecasts = [];
    let twoWeekDescription = twoWeekForecastData.records.locations[0].datasetDescription;
    
    if (targetLocation && targetLocation.weatherElement.length > 0) {
        const tempElement = targetLocation.weatherElement.find(e => e.elementName === 'T');
        const wxElement = targetLocation.weatherElement.find(e => e.elementName === 'Wx');
        
        if (tempElement) {
            // 僅取前 5 個預報時段
            forecasts = tempElement.time.slice(0, 5).map(timeSlot => {
                const weatherAtTime = wxElement ? wxElement.time.find(t => t.startTime === timeSlot.startTime) : null;
                
                return {
                    startTime: timeSlot.startTime,
                    endTime: timeSlot.endTime,
                    // 氣溫
                    temperature: timeSlot.elementValue.value + "°C",
                    // 天氣現象
                    weatherDescription: weatherAtTime ? weatherAtTime.elementValue[0].value : 'N/A'
                };
            });
        }
    }
    
    // --- 4. 整理 F-A0085-005 (紫外線) 資料 ---
    
    let currentUV = 'N/A';
    let uvDescription = uvIndexData.records.datasetDescription;
    
    if (uvIndexData.records.locations.length > 0) {
        // F-A0085-005 的 locationName 直接對應縣市名稱
        const uvLocation = uvIndexData.records.locations[0].location.find(
            loc => loc.locationName === locationName
        );
        if (uvLocation && uvLocation.weatherElement[0] && uvLocation.weatherElement[0].elementValue.value) {
            currentUV = uvLocation.weatherElement[0].elementValue.value;
        }
    }

    // 5. 回傳整合後的資料
    res.json({
      success: true,
      data: {
        city: locationName, // 動態縣市名稱
        updateTime: twoWeekDescription,
        uvDescription: uvDescription,
        currentUVIndex: currentUV, 
        forecasts: forecasts, 
      },
    });
    
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      // API 回應錯誤 (例如授權碼錯誤、參數錯誤)
      const errorMsg = error.response.data.message || "無法取得天氣資料";
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: errorMsg,
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
    message: "歡迎使用 CWA 天氣預報 API (支援動態縣市查詢)",
    endpoints: {
      weather: "/api/weather?locationName={縣市名稱}", 
      locations: "/api/locations",
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 新增縣市列表 API
app.get("/api/locations", (req, res) => {
    res.json({
        success: true,
        data: TAIWAN_LOCATIONS,
    });
});

// 取得指定縣市綜合天氣預報
app.get("/api/weather", getCombinedWeather);

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
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});