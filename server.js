import axios from "axios";

export default async function handler(req, res) {
  const { city } = req.query;
  const apiKey = process.env.CWA_API_KEY;

  if (!city) {
    return res.status(400).json({
      success: false,
      error: "缺少 city 參數",
    });
  }

  try {
    // ============================
    // A. 未來一週：F-D0047-091
    // ============================
    const weekUrl = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-091";

    const weekRes = await axios.get(weekUrl, {
      params: {
        Authorization: apiKey,
        locationName: city,
      },
    });

    const weekRecords = weekRes.data?.records?.locations?.[0]?.location?.[0];

    if (!weekRecords) {
      return res.json({
        success: false,
        error: `F-D0047-091 找不到縣市：${city}`,
        raw: weekRes.data,
      });
    }

    const weekElements = weekRecords.weatherElement;

    const weeklyForecast = weekElements.map((el) => ({
      elementName: el.elementName,
      description: el.description,
      time: el.time, // 內含 7 日資料
    }));

    // ============================
    // B. 未來 24 小時：F-A0085-005
    // ============================
    const dayUrl = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0085-005";

    const dayRes = await axios.get(dayUrl, {
      params: {
        Authorization: apiKey,
        locationName: city,
      },
    });

    const dayRecords = dayRes.data?.records?.location?.[0];

    if (!dayRecords) {
      return res.json({
        success: false,
        error: `F-A0085-005 找不到縣市：${city}`,
        raw: dayRes.data,
      });
    }

    const dayElements = dayRecords.weatherElement;

    const hourlyForecast = dayElements.map((el) => ({
      elementName: el.elementName,
      description: el.description,
      time: el.time, // 內含未來 24 小時 (3小時一筆)
    }));

    // ============================
    // 輸出結果整合
    // ============================
    return res.json({
      success: true,
      city,
      weekly: weeklyForecast,
      hourly: hourlyForecast,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
