export default function handler(req, res) {
  res.status(200).json({
    message: "JavaScript 실행 테스트",
    html: `
      <div>
        <h2 id="duribeon-test">자바스크립트 실행 전</h2>

        <script>
          document.getElementById("duribeon-test").innerText =
            "✅ 자바스크립트 실행 성공";
        </script>
      </div>
    `
  });
}