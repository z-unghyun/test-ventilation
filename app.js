const DEFAULT_LOCATION = { latitude: 37.5665, longitude: 126.978, name: "서울특별시" };

const $ = (selector) => document.querySelector(selector);
const els = {
  dashboard: $("#dashboard"), status: $("#status-message"), location: $("#header-location"),
  form: $("#search-form"), input: $("#city-input"), locationButton: $("#location-button"),
  updated: $("#updated-at"), card: $("#decision-card"), icon: $("#decision-icon"),
  title: $("#decision-title"), description: $("#decision-description"), duration: $("#duration"),
  progress: $("#decision-progress"), tip: $("#decision-tip"), timeline: $("#timeline"),
};

function greeting() {
  const hour = new Date().getHours();
  $("#greeting").textContent = hour < 11 ? "좋은 아침이에요." : hour < 18 ? "좋은 오후예요." : "편안한 저녁이에요.";
}

function weatherCode(code) {
  if (code === 0) return { label: "맑음", icon: "☀" };
  if ([1, 2].includes(code)) return { label: "대체로 맑음", icon: "☀" };
  if (code === 3) return { label: "흐림", icon: "☁" };
  if ([45, 48].includes(code)) return { label: "안개", icon: "≋" };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "이슬비", icon: "☂" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "비", icon: "☂" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "눈", icon: "❄" };
  if ([95, 96, 99].includes(code)) return { label: "뇌우", icon: "ϟ" };
  return { label: "구름 조금", icon: "☀" };
}

function airGrade(value, pollutant) {
  const cuts = pollutant === "pm25" ? [15, 35, 75] : [30, 80, 150];
  if (value <= cuts[0]) return { text: "좋음", className: "good" };
  if (value <= cuts[1]) return { text: "보통", className: "moderate" };
  if (value <= cuts[2]) return { text: "나쁨", className: "bad" };
  return { text: "매우 나쁨", className: "bad" };
}

function comfortGrade(value, type) {
  if (type === "temperature") {
    if (value >= 8 && value <= 28) return { text: "환기 적정", className: "good" };
    if (value > -5 && value < 33) return { text: "짧은 환기", className: "moderate" };
    return { text: "주의", className: "bad" };
  }
  if (value >= 35 && value <= 70) return { text: "쾌적", className: "good" };
  if (value <= 85) return { text: "보통", className: "moderate" };
  return { text: "습함", className: "bad" };
}

export function makeDecision({ pm25, pm10, temperature, humidity, wind, precipitation = 0 }) {
  const blockers = [];
  const cautions = [];
  if (pm25 > 75 || pm10 > 150) blockers.push("미세먼지 농도가 높아요");
  else if (pm25 > 35 || pm10 > 80) cautions.push("미세먼지가 다소 높아요");
  if (precipitation >= 1.5) blockers.push("비가 내리고 있어요");
  else if (precipitation > 0) cautions.push("약한 비가 있어요");
  if (wind >= 14) blockers.push("바람이 너무 강해요");
  else if (wind >= 9) cautions.push("바람이 강한 편이에요");
  if (temperature <= -5 || temperature >= 33) cautions.push("바깥 기온 차가 커요");
  if (humidity >= 88) cautions.push("바깥 습도가 높아요");

  if (blockers.length) return {
    level: "stop", title: "지금은 창문을 닫아주세요", duration: 0,
    description: `${blockers[0]}. 공기가 나아진 뒤 환기해요.`, progress: 12,
    tip: "공기청정기가 있다면 창문을 닫고 실내 공기를 순환해 주세요."
  };
  if (cautions.length) return {
    level: "caution", title: "지금은 짧게 환기해요", duration: 5,
    description: `${cautions[0]}. 5분 정도만 빠르게 환기하세요.`, progress: 38,
    tip: "맞은편 창문을 함께 열어 짧고 빠르게 공기를 바꿔주세요."
  };
  const duration = temperature >= 10 && temperature <= 26 && humidity <= 75 ? 20 : 10;
  return {
    level: "good", title: "환기하기 좋은 시간이에요", duration,
    description: "공기 상태가 쾌적해요. 창문을 활짝 열어보세요.", progress: duration === 20 ? 78 : 58,
    tip: "맞은편 창문까지 함께 열면 공기가 더 빠르게 순환해요."
  };
}

async function fetchMetWeather(latitude, longitude) {
  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", latitude.toFixed(4));
  url.searchParams.set("lon", longitude.toFixed(4));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`날씨 API 오류 (${response.status})`);
  return response.json();
}

async function fetchAirAndHourly(latitude, longitude) {
  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  airUrl.search = new URLSearchParams({
    latitude, longitude, current: "pm10,pm2_5,european_aqi",
    hourly: "pm10,pm2_5", timezone: "auto", forecast_days: "2"
  });
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({
    latitude, longitude,
    current: "weather_code,apparent_temperature",
    hourly: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    timezone: "auto", forecast_days: "2"
  });
  const [airResponse, weatherResponse] = await Promise.all([fetch(airUrl), fetch(weatherUrl)]);
  if (!airResponse.ok || !weatherResponse.ok) throw new Error("대기질 예보를 불러오지 못했어요.");
  return Promise.all([airResponse.json(), weatherResponse.json()]);
}

function parseMet(data) {
  const now = data.properties.timeseries[0];
  const instant = now.data.instant.details;
  return {
    temperature: instant.air_temperature,
    humidity: instant.relative_humidity,
    wind: instant.wind_speed,
    precipitation: now.data.next_1_hours?.details?.precipitation_amount ?? 0,
  };
}

function parseOpenMeteo(forecast) {
  const index = closestIndex(forecast.hourly.time, Date.now());
  return {
    temperature: forecast.hourly.temperature_2m[index],
    humidity: forecast.hourly.relative_humidity_2m[index],
    wind: forecast.hourly.wind_speed_10m[index] / 3.6,
    precipitation: forecast.hourly.precipitation[index] ?? 0,
  };
}

function setPill(id, grade) {
  const pill = $(id);
  pill.textContent = grade.text;
  pill.className = `status-pill ${grade.className}`;
}

function renderCurrent(weather, air, forecast) {
  const pm10 = Math.round(air.current.pm10);
  const pm25 = Math.round(air.current.pm2_5);
  const temp = Math.round(weather.temperature * 10) / 10;
  const humidity = Math.round(weather.humidity);
  const condition = weatherCode(forecast.current.weather_code);
  $("#pm10").textContent = pm10;
  $("#pm25").textContent = pm25;
  $("#temperature").textContent = temp;
  $("#humidity").textContent = humidity;
  $("#weather-label").textContent = condition.label;
  $("#feels-like").textContent = `체감 ${Math.round(forecast.current.apparent_temperature)}°`;
  $("#wind-note").textContent = `바람 ${weather.wind.toFixed(1)}m/s`;
  $("#aqi-note").textContent = `AQI ${Math.round(air.current.european_aqi)}`;
  $("#pm10-note").textContent = pm10 <= 30 ? "맑은 공기" : "외출 시 참고";
  setPill("#pm10-status", airGrade(pm10, "pm10"));
  setPill("#pm25-status", airGrade(pm25, "pm25"));
  setPill("#temp-status", comfortGrade(temp, "temperature"));
  setPill("#humidity-status", comfortGrade(humidity, "humidity"));
  return makeDecision({ ...weather, pm10, pm25 });
}

function renderDecision(decision) {
  els.card.className = `decision-card ${decision.level === "good" ? "" : decision.level}`;
  els.title.textContent = decision.title;
  els.description.textContent = decision.description;
  els.duration.textContent = decision.duration;
  els.progress.style.width = `${decision.progress}%`;
  els.icon.innerHTML = $("#good-icon-template").innerHTML;
  els.tip.lastChild.textContent = ` ${decision.tip}`;
}

function closestIndex(times, targetMs) {
  let best = 0;
  let distance = Infinity;
  times.forEach((time, index) => {
    const d = Math.abs(new Date(time).getTime() - targetMs);
    if (d < distance) { distance = d; best = index; }
  });
  return best;
}

function renderTimeline(air, forecast) {
  const now = Date.now();
  const points = [0, 3, 6, 9, 12, 15].map((offset) => now + offset * 3600000);
  const slots = points.map((target, order) => {
    const wi = closestIndex(forecast.hourly.time, target);
    const ai = closestIndex(air.hourly.time, target);
    const values = {
      temperature: forecast.hourly.temperature_2m[wi], humidity: forecast.hourly.relative_humidity_2m[wi],
      wind: forecast.hourly.wind_speed_10m[wi] / 3.6, precipitation: forecast.hourly.precipitation[wi],
      pm25: air.hourly.pm2_5[ai], pm10: air.hourly.pm10[ai]
    };
    const decision = makeDecision(values);
    return { target, order, values, decision, code: forecast.hourly.weather_code[wi] };
  });
  const ranked = [...slots].sort((a, b) => {
    const score = (x) => x.decision.level === "good" ? 0 : x.decision.level === "caution" ? 1 : 2;
    return score(a) - score(b) || a.values.pm25 - b.values.pm25;
  });
  const bestOrder = ranked[0].order;
  els.timeline.innerHTML = slots.map((slot) => {
    const date = new Date(slot.target);
    const time = slot.order === 0 ? "지금" : `${String(date.getHours()).padStart(2, "0")}:00`;
    const status = slot.decision.level === "good" ? "환기 좋아요" : slot.decision.level === "caution" ? "짧게 환기" : "환기 미뤄요";
    const icon = weatherCode(slot.code).icon;
    return `<article class="time-slot ${slot.order === bestOrder ? "best" : ""}">
      <span class="slot-time">${time}</span><div class="slot-icon" aria-hidden="true">${icon}</div>
      <strong class="slot-status">${status}</strong><span class="slot-detail">PM2.5 ${Math.round(slot.values.pm25)} · ${Math.round(slot.values.temperature)}°</span>
    </article>`;
  }).join("");
}

async function loadReport(location) {
  els.status.hidden = false;
  els.status.className = "status-message";
  els.status.innerHTML = '<span class="spinner"></span> 바깥 공기를 살펴보고 있어요…';
  els.dashboard.hidden = true;
  els.location.textContent = location.name;
  try {
    const [metData, [air, forecast]] = await Promise.all([
      fetchMetWeather(location.latitude, location.longitude).catch(() => null),
      fetchAirAndHourly(location.latitude, location.longitude)
    ]);
    // MET requires an identifiable public Origin. Local previews therefore fall back
    // to the same keyless forecast source used for the hourly recommendation.
    const weather = metData ? parseMet(metData) : parseOpenMeteo(forecast);
    const decision = renderCurrent(weather, air, forecast);
    renderDecision(decision);
    renderTimeline(air, forecast);
    els.updated.textContent = `${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date())} 업데이트`;
    els.status.hidden = true;
    els.dashboard.hidden = false;
  } catch (error) {
    console.error(error);
    els.status.className = "status-message error";
    els.status.innerHTML = `<strong>데이터를 불러오지 못했어요.</strong><span>${error.message}<br />잠시 후 다시 시도해 주세요.</span>`;
  }
}

async function searchCity(query) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: query, count: 1, language: "ko", format: "json" });
  const response = await fetch(url);
  if (!response.ok) throw new Error("도시 검색에 실패했어요.");
  const data = await response.json();
  if (!data.results?.length) throw new Error("검색 결과가 없어요. 도시 이름을 다시 확인해 주세요.");
  const place = data.results[0];
  return { latitude: place.latitude, longitude: place.longitude, name: [place.name, place.admin1].filter(Boolean).join(", ") };
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = els.input.value.trim();
  if (!query) return;
  els.input.blur();
  try { await loadReport(await searchCity(query)); }
  catch (error) {
    els.status.hidden = false;
    els.status.className = "status-message error";
    els.status.innerHTML = `<strong>${error.message}</strong><span>예: 서울, 부산, Tokyo</span>`;
  }
});

els.locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) return loadReport(DEFAULT_LOCATION);
  els.location.textContent = "위치 확인 중…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => loadReport({ latitude: coords.latitude, longitude: coords.longitude, name: "현재 위치" }),
    () => loadReport(DEFAULT_LOCATION),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
  );
});

greeting();
loadReport(DEFAULT_LOCATION);
