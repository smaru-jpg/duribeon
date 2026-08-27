export default function handler(req, res) {
  res.status(200).json({
    message: "UI 렌더링 테스트",
    html: `
      <div style="
        width:300px;
        height:180px;
        padding:20px;
        border:3px solid red;
        border-radius:12px;
        background:white;
      ">
        <h2 style="color:red;">두리번 UI 테스트</h2>
        <p>이 박스가 실제 화면으로 보이면 HTML 렌더링 가능</p>
        <button style="
          padding:10px 20px;
          background:black;
          color:white;
          border:none;
          border-radius:8px;
        ">
          테스트 버튼
        </button>
      </div>
    `
  });
}