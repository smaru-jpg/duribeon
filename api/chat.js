// api/chat.js  ← 브라우저가 아니라 서버에서 실행됨 (키가 노출되지 않음)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 허용됩니다" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY 환경변수가 없습니다" });
  }

  const MODEL = "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const { message, mode } = req.body || {};
    if (!message) return res.status(400).json({ error: "message가 필요합니다" });

    // mode === "parse" 이면 길안내 정보를 JSON으로 추출, 아니면 일반 대화
    const systemText =
      mode === "parse"
        ? [
            "너는 충남대학교 대덕캠퍼스 길안내 챗봇 '두리번'의 의도 분석기야.",
            "사용자 문장에서 출발지(origin), 목적지(destination), 의도(intent)를 뽑아라.",
            "origin은 사용자가 출발한다고 말한 장소(예: 정문, 서문, 도서관 등), 없으면 null.",
            "destination은 가려는 건물/학과/호실/교수님 등 목적지 표현, 없으면 null.",
            "intent는 길안내면 'navigation', 그 외 일반 대화면 'chat'.",
            "origin과 destination이 모두 있으면 ready_to_navigate=true, 아니면 false.",
            "너는 좌표나 실제 경로를 만들지 마라. 장소 이름만 그대로 뽑아라.",
            "반드시 아래 형식의 JSON 하나만 출력해라. 설명, 인사, 마크다운(```), 다른 텍스트 절대 금지.",
            '{"intent":"navigation|chat","origin":"문자열 또는 null","destination":"문자열 또는 null","ready_to_navigate":true|false,"reply":"사용자에게 보여줄 짧은 한국어 안내 문장"}',
          ].join("\n")
        : "너는 충남대학교 대덕캠퍼스 길안내 챗봇 '두리번'이야. 친근하고 간결하게 한국어로 답해줘. 캠퍼스에 없는 건물이나 정확하지 않은 위치는 지어내지 마.";

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig:
          mode === "parse" ? { responseMimeType: "application/json" } : {},
      }),
    });

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      return res.status(geminiRes.status).json({ error: "Gemini API 오류", detail });
    }

    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (mode === "parse") {
      // JSON 파싱 시도 (혹시 ```로 감싸져 오면 벗겨냄)
      const cleaned = raw.replace(/```json|```/g, "").trim();
      try {
        const parsed = JSON.parse(cleaned);
        return res.status(200).json({ parsed });
      } catch {
        return res.status(200).json({ parsed: null, raw });
      }
    }

    return res.status(200).json({ reply: raw || "(빈 응답)" });
  } catch (err) {
    return res.status(500).json({ error: "서버 오류", detail: String(err) });
  }
}