export default function handler(req, res) {
  res.status(200).json({
    message: "iframe 렌더링 테스트",
    html: `
      <div>
        <h2>두리번 iframe 테스트</h2>

        <iframe
          src="https://duribeon.vercel.app"
          width="600"
          height="400"
          style="border:2px solid black;"
        ></iframe>
      </div>
    `
  });
}