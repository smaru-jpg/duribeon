export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "POST 요청만 지원합니다."
    });
  }

  try {
    const { origin, destination } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        message: "origin과 destination이 필요합니다."
      });
    }

    // 나중에 여기에 실제 두리번 장소 검색/경로 계산 로직 연결
    const result = {
      success: true,

      origin: {
        query: origin,
        name: origin
      },

      destination: {
        query: destination,
        name: destination
      },

      distance_m: null,
      duration_min: null,

      map_url:
        `https://duribeon.vercel.app/?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(destination)}`
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "길찾기 처리 중 오류가 발생했습니다."
    });
  }
}